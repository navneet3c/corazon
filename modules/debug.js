/*
 * Simple module to print debug messages
 */
module.exports.print = function() {
  if(!process.env.NODE_ENV) {
    console.log("debug:", arguments)
  }
}
