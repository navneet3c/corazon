'use strict'

const express = require('express')
const session = require('express-session')
const path = require('path')
const favicon = require('serve-favicon')
const fs = require('fs')
const logger = require('morgan')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const mongoose = require('mongoose')
const config = require('config')
const debug = require('modules/debug').print
const MongoStore = require('connect-mongo')(session)
const errorHandlers = require('modules/errorHandler')

var app = express()

// view engine setup
app.set('views', 'views')
app.set('view engine', 'ejs')

//setup functionalities
app.use(favicon(path.join('public', 'favicon.ico')))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))
app.use(cookieParser())
app.use(express.static('public'))

//configure logger
var logPath = 'logs'
fs.stat(logPath, function (err, stats) {
  if(err) {
    fs.mkdir(logPath, '0755')
  }
  var accessLogStream = fs.createWriteStream(path.join(logPath, 'access.log'), {flags: 'a'})
  app.use(logger('tiny', {stream: accessLogStream}))
})

//setup db connection
var connectionString = config.get('db.url') + config.get('db.dbName')
const connection = mongoose.createConnection(connectionString)

//setup session
app.use(session({
    secret: config.get('session.secret'),
    resave: false,
    saveUninitialized: true,
    store: new MongoStore({ mongooseConnection: connection }),
    cookie: {
      maxAge: 60000
    }
}))

//configure routes
var routes = require('routes/index')

app.use('/', routes)

// error handlers
app.use(errorHandlers.defaultHandler)
app.use(errorHandlers.errorHandler)

module.exports = app
