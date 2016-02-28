/*
 * Model for user related functions
 */

'use strict'

const mongoose = require("mongoose")
const Schema =  mongoose.Schema

// create schema
var userSchema  = new Schema({
    "userEmail" : String,
    "userPassword" : String
})
// create model if not exists.
module.exports.users = mongoose.model('userLogin1',userSchema);
