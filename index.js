/* 
 * Launch node apps using node-harness and capture log output to send to Redis. 
 * Logs must output JSON. The winston logger is a great option.
 *
 * Inspired by http://blog.argteam.com/coding/hardening-nodejs-production-process-supervisor/
 *
 */

var _ = require('lodash'),
    fs = require('fs'),
    async = require('async'),
    child_process = require('child_process'),
    Logger = require('./lib/redis_logger'),
    bounceInterval = 60 * 1000,
    bounceWait = bounceInterval + 30 * 1000,
    healthCheckInterval = 60 * 1000;

var delayTimeout = function(ms, func) {
  return setTimeout(func, ms);
};

function MonitoredChild(script, port, healthCheck, envs, redis) {
  this.script = script;
  this.port = port;
  this.healthCheck = healthCheck;
  this.environmentVariables = envs;
  this.currentChild = null;
  this.healthCheckTimeout = null;
  this.bounceTimeout = null;
  this.expectedExit = false;

  this.respawns = 0;
  this.respawnsMax = 5;
  this.respawnTimer = 0;
  this.respawnTimerMax = 5000;

  _.extend(redis, { container: redis.name + ':info' });
  this.infoLogger = new Logger(redis);

  _.extend(redis, { container: redis.name + ':errors' });  
  this.errorLogger = new Logger(redis);
}

MonitoredChild.prototype.bounce = function() {
  var self = this;
  if (this.currentChild == null) {
    return this.respawn();
  }
  console.log("Requested bounce of " + this.currentChild.pid + ", port " + this.port);
  clearTimeout(this.healthCheckTimeout);
  this.expectedExit = true;
  this.currentChild.kill();
  return this.bounceTimeout = delayTimeout(bounceInterval, function() {
    console.error("Child did not exit in time, forcefully killing it");
    return self.currentChild.kill("SIGKILL");
  });
};

MonitoredChild.prototype.delayedHealthCheck = function() {
  var self = this;
  return this.healthCheckTimeout = delayTimeout(healthCheckInterval, function() {
    self.respawns = 0;
    var start;
    start = new Date();
    return self.healthCheck(self.port, function(healthy) {
      if (healthy) {
        return self.delayedHealthCheck();
      } else {
        console.error("" + self.port + " did not respond in time, killing it harshly");
        return self.currentChild.kill("SIGKILL");
      }
    });
  });
};

MonitoredChild.prototype.respawn = function() {
  var self = this;

  if (this.respawns == 0) {
    this.respawns++;
    this.respawnTimer = new Date();
  } else {
    this.respawns++;
    if (this.respawns > this.respawnsMax &&
        (new Date - this.respawnTimer) < this.respawnTimerMax) {
      console.error('Too many attempted restarts, exiting');
      process.exit(1);
    }
  }

  this.currentChild = child_process.spawn(process.execPath, [this.script], {
    env: _.extend(this.environmentVariables, process.env)
  });

  console.log("Started child", {
    port: this.port,
    pid: this.currentChild.pid
  });

  this.currentChild.stdout.pipe(this.infoLogger);
  this.currentChild.stderr.pipe(this.errorLogger);

  this.currentChild.on('exit', function(code, signal) {
    if (self.healthCheckTimeout != null) {
      clearTimeout(self.healthCheckTimeout);
    }
    if (self.bounceTimeout != null) {
      clearTimeout(self.bounceTimeout);
    }
    if (self.expectedExit) {
      self.expectedExit = false;
      console.info("Expected exit from child " + self.currentChild.pid + ", port " + self.port + " - respawning");
    } else {
      console.error("Child " + self.currentChild.pid + ", port " + self.port + " exited with code " + code + ", signal " + signal + ", respawning");
    }
    return self.respawn();
  });

  return this.delayedHealthCheck();
};

exports.bounceChildren = function(monitoredChildren, callback) {
  return async.forEachSeries(monitoredChildren, function(monitoredChild, seriesCallback) {
    monitoredChild.bounce();
    return delayTimeout(bounceWait, seriesCallback);
  }, callback);
};

exports.spawnMonitoredChild = function(script, port, healthCheck, opts) {
  if (!fs.existsSync(script)) {
    console.log('Path "' + script + '" does not exist');
    process.exit(1);
  }

  var envs = opts.envs || {};
  var redis = opts.redis || {};

  var ret = new MonitoredChild(script, port, healthCheck, envs, redis);
  ret.respawn();
  return ret;
};
