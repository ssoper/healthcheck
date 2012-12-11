// Generated by CoffeeScript 1.4.0
(function() {
  var child_monitor = require('./child_monitor'),
      net = require('net');
  var children, healthCheck, i, numWorkers, port, startPort, _i, _ref;

  healthCheck = function(port, cb) {
    var c, gotAuth;
    console.log(port)
    // port
    c = net.connect(3000, 'localhost');
    c.setEncoding("utf8");
    gotAuth = false;
    c.on('data', function(data) {
      var d;
      d = null;
      try {
        d = JSON.parse(data);
      } catch (error) {
        c.end();
        console.error("Health check failed: bad initial response, " + data);
        return cb(false);
      }
      if (!gotAuth) {
        if (d.cmd === "PLSAUTH") {
          gotAuth = true;
          return c.write(JSON.stringify({
            cmd: "RING"
          }) + "\r\n");
        } else {
          c.end();
          console.error("Health check failed: bad initial response, " + data);
          return cb(false);
        }
      } else {
        c.end();
        console.info("Health check response", {
          res: d
        });
        return cb(true);
      }
    });
    c.on('error', function(e) {
      console.error("Health check failed: error connecting " + e);
      return cb(false);
    });
    return c.setTimeout(5000, function() {
      return c.destroy();
    });
  };

  numWorkers = 1;

  startPort = 31337;

  children = [];

  for (i = _i = 0, _ref = numWorkers - 1; 0 <= _ref ? _i <= _ref : _i >= _ref; i = 0 <= _ref ? ++_i : --_i) {
    port = startPort + i;
    children.push(child_monitor.spawnMonitoredChild('/Users/ssoper/workspace/argus/apps/api', "sfs_socket_" + port, healthCheck, {
      DEBUG: true
    }));
  }

  process.on("SIGHUP", function() {
    console.log("Received SIGHUP, respawning children");
    return child_monitor.bounceChildren(children);
  });

}).call(this);


/*

monitor starts up
monitor logs directly to disk
monitor starts up chidren
children log their errors to redis
monitor performs healthcheck every 1 min which is logged to redis

ALSO
Modify log watcher to 
1. log per server
2. log per path (but what happens if a path logged by timeslice is also logged? double entry)

log it all to redis and add new items for things like servers, user agents, etc.

*/