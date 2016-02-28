/*
 * Error handlers
 */
 
//catch 404 and forward to error handler
module.exports.defaultHandler = function(req, res, next) {
  var err = new Error('Not Found')
  err.status = 404
  next(err)
}

if (process.env.NODE_ENV == 'production') {
  // production error handler
  module.exports.errorHandler = function(err, req, res, next) {
    res.status(err.status || 500)
    res.render('error', {
      title: global.app_name,
      message: err.status + ": " + err.message,
      error: {}
    })
  }
} else {
  // development error handler
  // will print stacktrace
  module.exports.errorHandler = function(err, req, res, next) {
    res.status(err.status || 500)
    res.render('error', {
      title: global.app_name,
      message: err.status + ": " + err.message,
      error: err
    })
  }
}
