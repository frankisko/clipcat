var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const nunjucks = require('nunjucks');
const moment = require("moment");

var collectionRouter = require('./routes/collection.route');
var fileRouter = require('./routes/file.route');
var metadataRouter = require('./routes/metadata.route');

//remotes
var CollectionRemote = require('./remotes/collection.remote');
collectionRemote = new CollectionRemote();

var FFMPEGRemote = require('./remotes/ffmpeg.remote');
ffmpegRemote = new FFMPEGRemote();

var FileRemote = require('./remotes/file.remote');
fileRemote = new FileRemote();

var MetadataRemote = require('./remotes/metadata.remote');
metadataRemote = new MetadataRemote();

var PathRemote = require('./remotes/path.remote');
pathRemote = new PathRemote();

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'njk');

var nunjucks_env = nunjucks.configure(path.join(__dirname, 'views'), {
  autoescape: true,
  express: app
});

//custom nunjucks filters
nunjucks_env.addFilter('fancy_datetime', function(timestamp) {
  let response = "";

  if (timestamp) {
      response = moment.unix(timestamp).format("DD/MM/YYYY HH:mm:ss");
  }

  return response;
});

nunjucks_env.addFilter('fancy_date', function(timestamp) {
  let response = "";

  if (timestamp) {
      response = moment.unix(timestamp).format("DD/MM/YYYY");
  }

  return response;
});

nunjucks_env.addFilter('fancy_duration', function(seconds) {
  if (seconds > 0) {
      return Math.floor(seconds / 60) + " min";
  } else {
      return "0 min";
  }
});


//app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public').replace(path.sep + 'app.asar', '')));

app.use('/collection', collectionRouter);
app.use('/file', fileRouter);
app.use('/metadata', metadataRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  console.log(req.url);
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  console.log(err.message, req.url);

  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
