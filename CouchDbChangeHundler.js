const debug = require('debug')
const ChangesStream = require('changes-stream')
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

  stop() {
    this._logInfo('stop')
    this._changeStream.destroy()
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
    this._logInfo('starting changes stream', this.options)
    this._changeStream = new ChangesStream(this.options)

    this._changeStream.on('readable', () => {
      var change = this._changeStream.read()
      if (this.seqId === change.id)  {
        return
      }
      this._changeStream.pause()
      Promise.resolve()
        .then(() => this.handler(null, change))
        .then(() => {
          this._logInfo('upsert')
          return this._db.upsert(this.seqId, (docSeq) => {
            if (!docSeq[this.seqKey] || parseInt(docSeq[this.seqKey], 10) < parseInt(change.seq, 10)) {
              docSeq[this.seqKey] = change.seq
              this._logInfo('save seq', docSeq[this.seqKey])
              return docSeq
            }
            else {
              this._logError('seq is wrong', docSeq[this.seqKey])
            }
          })
        })
        .then(() => {
          this._logInfo('resume changes')
          this._changeStream.resume()
        })
        .catch(error => {
          this._logError('_onChange', error)
          throw error
        })
    });

    this._changeStream.on('error', (error) => {
      this._changeStream.pause()
      Promise.resolve()
        .then(() => this.handler(error, null))
        .then(() => {
          this._logInfo('resume changes')
          this._changeStream.resume()
        })
    })
  }
}

module.exports = CouchDbChangeHundler
