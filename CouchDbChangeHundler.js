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
    this._started = true
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

  stop() {
    this._started = false
    this._logInfo('stop')
    this._feed.stop()
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

    return new Promise((resolve, reject) => {
      this._feed = follow(this.options, (error, change) => {
        if (error) {
          this._logError(error)
        }
        else {
          this._logInfo('change', change)
        }
        this._feed.pause()
        this._onChange(error, change)
          .then(() => {
            if (this._started) {
              this._logInfo('feed resume')
              this._feed.resume()
            }
          })
          .catch(error => {
            this._logError('_onChange', error)
            throw error
          })
      })
      this._feed.on('confirm_request', resolve)
      this._feed.on('error', reject)
      this._feed.on('retry', () => {
        setTimeout(() => {
          if (!this._started) {
            clearTimeout(this._feed.retry_timer)
          }
        }, 0)
      })
    })
  }

  _onChange(error, change) {
    return Promise.resolve()
      .then(() => this.handler(error, change))
      .then(() => {
        if (error) {
          return
        }
        this._logInfo('upsert')
        return this._db.upsert(this.seqId, (docSeq) => {
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
