var Stream = require('stream').Stream,
    util = require('util')

function RedisStream() {
  function Public() {
    Stream.call(this);
    this.writable = true;

    this.write = function(data) {
      console.log(data.toString('utf8'))
    };

    this.end = function(data) {
      console.log(data.toString('utf8'))

      this.flush();
      this.close();
    };

    this.destroy = function() {
      this.flush();
      this.close();
    };

    this.flush = function() {
      console.log('flush?')
    };

    this.close = function() {
      var self = this;
      console.log('closed')
      // process.nextTick(function() {
      //   self.emit('close', totalCount, totalSize, totalChunks);
      // });
    };
  }

  util.inherits(Public, Stream);
  var object = new Public();
  return object;
}

var redis = require('redis'),
    winston = require('winston'),
    common = require('winston/lib/winston/common'),
    util = require('util'),
    Stream = require('stream').Stream;

var Redis = winston.transports.Redis = function (options) {
  winston.Transport.call(this, options);
  Stream.call(this);
  this.writable = true;

  var self = this;

  options       = options || {};
  options.host  = options.host || 'localhost';
  options.port  = options.port || 6379;

  this.name      = 'redis';
  this.redis     = redis.createClient(options.port, options.host);
  this.json      = options.json !== false;
  this.length    = options.length    || 200;
  this.container = options.container || 'winston';
  this.timestamp = options.timestamp || true;
  this.channel   = options.channel;

  if (options.auth) {
    this.redis.auth(options.auth);
  }

  // Suppress errors from the Redis client
  this.redis.on('error', function (err) {
    self.emit('error');
  });

  if (typeof this.container !== 'function') {
    var container = this.container;
    this.container = function () {
      return container;
    };
  }

  if (this.channel && typeof this.channel !== 'function') {
    var channel = this.channel;
    this.channel = function () {
      return channel;
    };
  }
};

//
// Inherit from `winston.Transport`.
//
util.inherits(Redis, winston.Transport);
util.inherits(Redis, Stream);

Redis.prototype.write = function(data) {
  console.log(data.toString('utf8'))
};

this.end = function(data) {
  console.log(data.toString('utf8'))

  this.flush();
  this.close();
};

this.destroy = function() {
  this.flush();
  this.close();
};

this.flush = function() {
  console.log('flush?')
};

this.close = function() {
  var self = this;
  console.log('closed')
  // process.nextTick(function() {
  //   self.emit('close', totalCount, totalSize, totalChunks);
  // });
};

//
// ### function log (level, msg, [meta], callback)
// #### @level {string} Level at which to log the message.
// #### @msg {string} Message to log
// #### @meta {Object} **Optional** Additional metadata to attach
// #### @callback {function} Continuation to respond to when complete.
// Core logging method exposed to Winston. Metadata is optional.
//
Redis.prototype.log = function (level, msg, meta, callback) {
  var self = this,
      container = this.container(meta),
      channel = this.channel && this.channel(meta);

  this.redis.llen(container, function (err, len) {
    if (err) {
      if (callback) callback(err, false);
      return self.emit('error', err);
    }

    var output = common.log({
      level: level,
      message: msg,
      meta: meta,
      timestamp: self.timestamp,
      json: self.json
    });

    // RPUSH may be better for poll-streaming.
    self.redis.lpush(container, output, function (err) {
      if (err) {
        if (callback) callback(err, false);
        return self.emit('error', err);
      }

      self.redis.ltrim(container, 0, self.length, function () {
        if (err) {
          if (callback) callback(err, false);
          return self.emit('error', err);
        }

        if (channel) {
          self.redis.publish(channel, output);
        }

        // TODO: emit 'logged' correctly,
        // keep track of pending logs.
        self.emit('logged');

        if (callback) callback(null, true);
      });
    });
  });
};
