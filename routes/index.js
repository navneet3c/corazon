'use strict'

const express = require('express')
const router = express.Router()
const debug = require('modules/debug').print

/* GET home page. */
router.get('/', function(req, res, next) {
  var sess=req.session
  if(sess.email) {
    debug("logged in")
  } else {
    debug("not logged in")
  }
  res.render('index', {
    title: global.app_name,
    body: "body"
  })
})

module.exports = router
