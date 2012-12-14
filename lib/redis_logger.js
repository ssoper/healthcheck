var _ = require('lodash'),
    util = require('util'),
    redis = require('redis'),
    moment = require('moment'),
    Stream = require('stream').Stream

function RedisLogger (options) {
  Stream.call(this);
  this.writable = true;

  var self = this;

  options       = options || {};
  options.host  = options.host || 'localhost';
  options.port  = options.port || 6379;

  this.buffer ='';
  this.redis     = redis.createClient(options.port, options.host);
  this.length    = options.length    || 200;
  this.container = options.container || 'node_monitor';
  this.channel   = options.channel;

  if (options.auth) {
    this.redis.auth(options.auth);
  }

  // Suppress errors from the Redis client
  this.redis.on('error', function (err) {
    self.emit('error');
  });
};

util.inherits(RedisLogger, Stream);

RedisLogger.prototype.write = function(data) {
  this.log(data)
};

RedisLogger.prototype.log = function (msg, cb) {
  var self = this;

  this.redis.llen(self.container, function (err, len) {
    if (err) {
      if (cb) cb(err, false);
      return self.emit('error', err);
    }

    // RPUSH may be better for poll-streaming.
    self.redis.lpush(self.container, msg, function (err) {
      if (err) {
        if (cb) cb(err, false);
        return self.emit('error', err);
      }

      self.redis.ltrim(self.container, 0, self.length, function () {
        if (err) {
          if (cb) cb(err, false);
          return self.emit('error', err);
        }

        if (self.channel) {
          self.redis.publish(self.channel, msg);
        }

        // TODO: emit 'logged' correctly,
        // keep track of pending logs.
        self.emit('logged');

        if (cb) cb(null, true);
      });
    });
  });
};

module.exports = function(options) {
  return new RedisLogger(options);
}
