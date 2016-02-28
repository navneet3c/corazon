'use strict'

const express = require('express')
const router = express.Router()
const debug = require('modules/debug').print
const userModels = require('models/user')

/* GET home page. */
router.route('/').get(function(req, res, next) {
  var sess=req.session
  if(sess.email) {
    debug("logged in")
  } else {
    debug("not logged in")
  }

  var mymodel = new userModels.users()
  userModels.users.find(function (err, k) {
    if (err) return console.error(err);
    console.log("result", k);
  })

  res.render('index', {
    title: global.app_name,
    body: "body"
  })
})

module.exports = router
