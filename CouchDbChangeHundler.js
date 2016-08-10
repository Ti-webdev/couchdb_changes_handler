const follow = require('follow')
const debug = require('debug')

const PouchDB = require('pouchdb-core')
  .plugin(require('pouchdb-adapter-http'))
  .plugin(require('pouchdb-upsert'))

class CouchDbChangeHundler {
  constructor() {
    this.logTag = 'cch'
    this.seqKey = 'seq'
    this.exitOnSigInt = true
  }

  start() {
    this._logInfo = debug(`${this.logTag}:info`)
    this._logError = debug(`${this.logTag}:error`)
    this._registerSigInt()
    this._db = new PouchDB(this.options.db)

    this._logInfo('get last seq')
    return this._db.get(this.seqId)
      .then(seqDoc => {
        this._logInfo('start since', seqDoc[this.seqKey])
        this.options.since = seqDoc[this.seqKey]
      }, error => {
        if ('not_found' === error.name) {
          this._logInfo('starting with first seq')
        } else {
          this._logError('Cannot get seq', error)
          throw error
        }
      })
      .then(() => this._startFollow())
      .catch(error => this._logError('error get seq', error))
  }

  _registerSigInt() {
    if (this.exitOnSigInt) {
      process.on('SIGINT', function() {
        process.stdout.write('\n')
        process.exit(2)
      })
    }
  }

  _startFollow() {
    this._logInfo('starting follow', this.options)

    let cch = this
    this._feed = follow(this.options, (error, change) => {
      this._feed.pause()
      cch._onChange(error, change)
        .then(() => {
          this._logInfo('feed resume')
          this._feed.resume()
        })
    })
  }

  _onChange(error, change) {
    return Promise.resolve()
      .then(() => this.handler(error, change))
      .catch(e => {
        this._logError('_onChange', error)
        throw e
      })
      .then(() => {
        if (error) {
          return
        }
        return this._db.upsert(this.seqId, function (docSeq) {
          if (!docSeq[this.seqKey] || docSeq[this.seqKey] < change.seq) {
            docSeq[this.seqKey] = change.seq
            this._logInfo('save seq', docSeq[this.seqKey])
            return docSeq
          }
          else {
            this._logError('seq is wrong', docSeq[this.seqKey])
          }
        })
      })
  }
}

module.exports = CouchDbChangeHundler
