module.exports = {
  apps: [
    {
      name: 'rideality-api',
      script: './dist/server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        OTP_ALLOW_BYPASS: 'true',
        OTP_RETURN_CODE: 'true',
        OTP_DEV_BYPASS_CODE: '123456',
        // FCM / Firebase Admin (service account JSON on disk — not committed)
        FIREBASE_SERVICE_ACCOUNT_PATH: '/opt/rideality_backup/secrets/rideality-firebase-adminsdk.json',
        GOOGLE_APPLICATION_CREDENTIALS: '/opt/rideality_backup/secrets/rideality-firebase-adminsdk.json',
        FIREBASE_PROJECT_ID: 'rideality',
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
