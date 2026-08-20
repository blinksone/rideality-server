module.exports = {
  apps: [
    {
      name: 'rideality-admin',
      cwd: __dirname,
      script: 'npx',
      args: 'serve -s dist -l 8080 --no-request-logging',
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      watch: false,
    },
  ],
};
