healthCheck = (port, cb) ->
  c = net.connect port, 'localhost'
  c.setEncoding "utf8"

  gotAuth = false
  c.on 'data', (data) ->
    d = null
    try
      d = JSON.parse(data)
    catch error
      c.end()
      console.error "Health check failed: bad initial response, #{data}"
      return cb(false)

    if !gotAuth
      if d.cmd == "PLSAUTH"
        gotAuth = true
        c.write JSON.stringify({cmd:"RING"}) + "\r\n"
      else
        c.end()
        console.error "Health check failed: bad initial response, #{data}"
        return cb(false)
    else
      c.end()
      console.info "Health check response", {res: d}
      return cb(true)

  c.on 'error', (e) ->
    console.error "Health check failed: error connecting #{e}"
    cb(false)

  c.setTimeout config.healthCheckTimeout, -> c.destroy()

numWorkers = 2
startPort = 31337
children = []
for i in [0..numWorkers-1]
  port = startPort + i
  children.push(child_monitor.spawnMonitoredChild './lib/sfs_socket', "sfs_socket_#{port}", healthCheck, {SFS_SOCKET_PORT: port, SFS_SOCKET_HOST: socketHost})

process.on "SIGHUP", ->
  console.log "Received SIGHUP, respawning children"
  child_monitor.bounceChildren(children)