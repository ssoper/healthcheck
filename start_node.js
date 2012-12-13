var net = require('net'),
    child_monitor = require('./child_monitor'),
    numWorkers = 2,
    startPort = 31337,
    children = [];

var healthCheck = function(procId, cb) {
  var port = procId.split('_').slice(-1)[0];
  var conn = net.connect(port, 'localhost', function() {
    return cb(true)
  });

  return conn.setTimeout(5000, function() {
    return conn.destroy();
  });
};

for (var i = 0; i < numWorkers; i++) {
  port = startPort + i;
  var cmd = process.env.CMD;
  var procId = path.basename(cmd) + '_' + port;
  children.push(child_monitor.spawnMonitoredChild('/Users/sopers/workspace/argus/apps/api', procId, healthCheck, {
    PORT: port,
    DEBUG: true
  }));
}

process.on("SIGHUP", function() {
  console.log("Received SIGHUP, respawning children");
  return child_monitor.bounceChildren(children);
});
