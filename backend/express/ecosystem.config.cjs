/**
 * PM2 production process layout.
 * Copy to /var/www/nexusai-api/ecosystem.config.cjs after deploy.
 *
 * RUN_WORKERS=false on nexusai-api is intentional — HTTP stays fast.
 * WhatsApp outbound (whatsapp-outbound queue) runs in nexusai-worker only.
 *
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup systemd -u root --hp /root
 */
module.exports = {
  apps: [
    {
      name: 'nexusai-api',
      cwd: '/var/www/nexusai-api',
      script: 'dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '750M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        RUN_WORKERS: 'false',
        MIGRATE_ON_START: 'true',
      },
      error_file: '/var/log/nexusai/api-error.log',
      out_file: '/var/log/nexusai/api-out.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'nexusai-worker',
      cwd: '/var/www/nexusai-api',
      script: 'dist/worker.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        RUN_WORKERS: 'true',
        WORKER_HEALTH_PORT: 3002,
      },
      error_file: '/var/log/nexusai/worker-error.log',
      out_file: '/var/log/nexusai/worker-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
