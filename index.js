'use strict'

let follow = require('follow')
let debug = require('debug')

let pouchdb = require('pouchdb')
pouchdb.plugin(require('pouchdb-upsert'))

let logInfo = debug('cch:info')
let logError = debug('cch:error')

module.exports = function (seqId, followOptions, handler) {
  let db = pouchdb(followOptions.db)

  let startFollow = function () {
    logInfo('starting follow', followOptions)
    follow(followOptions, function(error, change) {
      let feed = this
      feed.pause()

      let result = handler(error, change, feed)

      Promise.resolve(result)
      .then(function () {
        if (error) {
          return
        }
        return db.upsert(seqId, function (docSeq) {
          if (!docSeq.seq || docSeq.seq < change.seq) {
            docSeq.seq = change.seq
            logInfo('save seq', docSeq.seq)
            return docSeq
          }
          else {
            logError('seq is wrong', docSeq.seq)
          }
        })
      })
      .then(function () {
        logInfo('feed resume')
        feed.resume()
      })
    })
  }

  logInfo('get last seq')
  return db.get(seqId)
    .then(function (seqDoc) {
      logInfo('start since', seqDoc.seq)
      followOptions.since = seqDoc.seq
    }, function (error) {
      if ('not_found' === error.name) {
        logInfo('starting with first seq')
      } else {
        logError('Cannot get seq', error)
        throw error
      }
    })
    .then(function () {
      return startFollow()
    })
    .catch(function (error) {
      logError('error get seq', error)
    })
}
