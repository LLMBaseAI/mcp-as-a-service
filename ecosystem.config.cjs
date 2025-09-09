module.exports = {
  apps: [{
    name: 'mcp-registry',
    script: 'bun',
    args: ['run', 'src/index.ts'],
    instances: 2,
    exec_mode: 'cluster',
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/mcp-registry/error.log',
    out_file: '/var/log/mcp-registry/out.log',
    log_file: '/var/log/mcp-registry/combined.log',
    time: true,
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s',
    autorestart: true,
    kill_timeout: 5000,
    listen_timeout: 3000,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};