'use strict'

const CouchDbChangeHundler = require('./CouchDbChangeHundler')

module.exports = function (seqId, followOptions, handler) {
  let cch = new CouchDbChangeHundler()
  if (arguments.length) {
    cch.seqId = seqId
    cch.options = followOptions
    cch.handler = handler
    return cch.start()
  }
  else {
    return cch
  }
}
