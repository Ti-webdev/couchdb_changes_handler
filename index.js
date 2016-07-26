'use strict'

const follow = require('follow')
const debug = require('debug')

const PouchDB = require('pouchdb-core')
  .plugin(require('pouchdb-adapter-http'))
  .plugin(require('pouchdb-upsert'))

const console = {
  info: debug('cch:info'),
  error: debug('cch:error')
}

module.exports = function (seqId, followOptions, handler) {
  let db = new PouchDB(followOptions.db)

  let startFollow = function () {
    console.info('starting follow', followOptions)
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
            console.info('save seq', docSeq.seq)
            return docSeq
          }
          else {
            console.error('seq is wrong', docSeq.seq)
          }
        })
      })
      .then(function () {
        console.info('feed resume')
        feed.resume()
      })
    })
  }

  console.info('get last seq')
  return db.get(seqId)
    .then(function (seqDoc) {
      console.info('start since', seqDoc.seq)
      followOptions.since = seqDoc.seq
    }, function (error) {
      if ('not_found' === error.name) {
        console.info('starting with first seq')
      } else {
        console.error('Cannot get seq', error)
        throw error
      }
    })
    .then(function () {
      return startFollow()
    })
    .catch(function (error) {
      console.error('error get seq', error)
    })
}
