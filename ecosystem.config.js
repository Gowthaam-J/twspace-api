module.exports = {
  apps: [
    {
      name: 'twspace-crawler',
      namespace: 'crawler',
      script: './dist/index.js',
      args: '--config ./config.json',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'api-server',
      namespace: 'api',
      script: './dist/apiServer.js',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
