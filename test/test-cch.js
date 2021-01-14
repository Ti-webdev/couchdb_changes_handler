const CouchDbChangeHundler = require('../CouchDbChangeHundler')
const should = require('should')
const inherits = require('inherits')
const PouchDB = require('pouchdb-core')
  .plugin(require('pouchdb-adapter-memory'))

// add instance_start_time to PouchDB.info()
const ExpressPouchDB = function () {
  this.constructor = PouchDB
  PouchDB.apply(this, Array.prototype.slice.call(arguments))
  const startTime = new Date()
  const pouchInfo = this.info
  this.info = function (callback) {
    return pouchInfo.apply(this)
      .then(info => {
        info.instance_start_time = startTime
        if (callback) {
          callback(null, info)
        }
        return info
      }, callback)
  }
}
inherits(ExpressPouchDB, PouchDB)

const sinon = require('sinon')

const express = require('express')

const HOST = '127.0.0.1'
const PORT = 5985
const DB = 'test'

describe('cch', () => {
  let server
  before(function () {
    server = express()
      .use(require('pouchdb-express-router')(ExpressPouchDB))
      .listen(PORT, HOST)
  })
  after(() => server.close())

  describe('handler', () => {
    const cch = new CouchDbChangeHundler()
    cch.seqId = '_local/test'
    cch.seqKey = 'last_seq'
    cch.options = {
      db: `http://${HOST}:${PORT}/${DB}`,
      feed: 'continuous',
      // filter: 'verification/init',
      // include_docs: true
    }
    before(() => cch.start())
    after(() => cch.stop())

    describe('change', function () {
      let putResult
      let db = new PouchDB(DB)
      before(() => {
        return new Promise(async (resolve) => {
          cch.handler = sinon.spy(resolve)
          putResult = await db.put({ _id: 'foo' }).then(result => result)
        })
      })
      it('first', () => {
        sinon.assert.calledOnce(cch.handler)
        cch.handler.args[0][1].id.should.equal('foo')
        cch.handler.args[0][1].changes[0].rev.should.equal(putResult.rev)
      })
      describe('second', function () {
        let putResultSecond
        before(() => {
          return new Promise(async (resolve) => {
            cch.handler = sinon.spy(resolve)
            putResultSecond = await db.put({ _id: putResult.id, _rev: putResult.rev, second: true })
          })
        })
        it('result', () => {
          sinon.assert.calledOnce(cch.handler)
          should(cch.handler.args[0][1].second).be.true
          cch.handler.args[0][1].changes[0].rev.should.equal(putResultSecond.rev)
        })
      })
    })
  })
})
