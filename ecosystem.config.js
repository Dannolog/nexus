module.exports = {
  apps: [
    {
      name: "nexus",
      script: "node",
      args: "node_modules/next/dist/bin/next start --port 3050",
      cwd: "/mnt/devip3/nexus",
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 2000,
      env: { NODE_ENV: "production" },
    },
    {
      name: "nexus-watcher",
      script: "scripts/watch-push.js",
      cwd: "/mnt/devip3/nexus",
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 5,
      restart_delay: 3000,
    },
  ],
};
