module.exports = {
  apps: [
    {
      name: 'whatsapp-sender',
      script: 'whatsapp-sender.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      restart_delay: 15000,
      max_restarts: 20,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
