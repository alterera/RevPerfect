/**
 * PM2 Ecosystem Configuration
 * Production configuration for Azure VM deployment
 */
module.exports = {
  apps: [
    {
      name: 'revperfect-backend',
      script: './dist/index.js',
      instances: 1, // Use 'max' for cluster mode, or specific number
      exec_mode: 'fork', // 'fork' for single instance, 'cluster' for multiple
      
      // Environment
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      
      // Logging
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true, // Prepend timestamp to logs
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Auto-restart configuration
      autorestart: true,
      watch: false, // Set to true for development, false for production
      max_memory_restart: '1G', // Restart if memory exceeds 1GB
      
      // Graceful shutdown
      kill_timeout: 5000, // Time to wait for graceful shutdown (ms)
      wait_ready: true, // Wait for app to emit 'ready' event
      listen_timeout: 10000, // Time to wait for app to start (ms)
      
      // Advanced
      min_uptime: '10s', // Minimum uptime to consider app stable
      max_restarts: 10, // Max restarts in 1 minute
      restart_delay: 4000, // Delay between restarts (ms)
      
      // Source map support (if using TypeScript source maps)
      source_map_support: true,
      
      // Instance variables
      instance_var: 'INSTANCE_ID',
    },
  ],
  
  // Deployment configuration (optional, for PM2 deploy)
  deploy: {
    production: {
      user: 'deploy',
      host: ['your-server-ip'],
      ref: 'origin/main',
      repo: 'git@github.com:your-org/revperfect.git',
      path: '/var/www/revperfect-backend',
      'post-deploy': 'cd backend && npm install --production && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'apt-get update && apt-get install git -y',
    },
  },
};

