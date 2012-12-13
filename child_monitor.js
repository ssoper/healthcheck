var _ = require('lodash'),
    async = require('async'),
    child_process = require('child_process'),
    Logger = require('./redis_logger'),
    bounceInterval = 60 * 1000,
    bounceWait = bounceInterval + 30 * 1000,
    healthCheckInterval = 60 * 1000;

var delayTimeout = function(ms, func) {
  return setTimeout(func, ms);
};

function MonitoredChild(script, port, healthCheck, environmentVariables, redisOpts) {
  this.script = script;
  this.port = port;
  this.healthCheck = healthCheck;
  this.environmentVariables = environmentVariables;
  this.currentChild = null;
  this.healthCheckTimeout = null;
  this.bounceTimeout = null;
  this.expectedExit = false;

  this.respawns = 0;
  this.respawnsMax = 5;
  this.respawnTimer = 0;
  this.respawnTimerMax = 5000;

  this.infoLogger = new Logger(redisOpts);
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

  this.currentChild.stdout.pipe(logger);
  this.currentChild.stderr.pipe(logger);

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

exports.spawnMonitoredChild = function(script, port, healthCheck, envs, redisOpts) {
  var ret;
  ret = new MonitoredChild(script, port, healthCheck, envs, redisOpts || {});
  ret.respawn();
  return ret;
};
