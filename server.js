#!/usr/bin/env node

'use strict'

const config = require('config')
const debug = require('modules/debug').print
const http = require('http')
const app = require('modules/app')

//set global variables
global.app_name = config.get('app_name')

//Get port and ip from config and store in Express.
var port = config.get('server.port')
var host = config.get('server.host')
app.set('port', port)
app.set('hostname', host)

//Create HTTP server.
var server = http.createServer(app)

//Listen on provided port and ip
server.listen(port, host)
server.on('error', onError)
server.on('listening', onListening)

//Event listener for HTTP server "error" event.
function onError(error) {
  if (error.syscall !== 'listen') {
    throw error
  }

  var bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges')
      process.exit(1)
      break
    case 'EADDRINUSE':
      console.error(bind + ' is already in use')
      process.exit(1)
      break
    default:
      throw error
  }
}

//Event listener for HTTP server "listening" event.
function onListening() {
  var addr = server.address()
  var bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + addr.port
  debug('Listening on ' + bind)
}
