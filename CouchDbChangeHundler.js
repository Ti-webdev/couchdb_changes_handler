const debug = require('debug')
const stream = require('stream')
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
    this._db = new PouchDB(this.options.db, {skipSetup: true, ajax: {timeout: 120000}})

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
    this._changeStream.pipe(new stream.Writable({
      write: (change, encoding, next) => {
        if (this.seqId === change.id)  {
          this._logInfo('seq is equals')
          return
        }
        Promise.resolve()
          .then(() => this.handler(null, change))
          .then(() => {
            this._logInfo('upsert', change.seq)
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
            next()
          })
          .catch(error => {
            this._logError('_onChange', error)
            next(error)
            return this.handler(error, null)
          })
      },
      objectMode: true
    }))
  }
}

module.exports = CouchDbChangeHundler
