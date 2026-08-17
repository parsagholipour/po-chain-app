#!/bin/sh
set -e

wait_for_db() {
  node -e '
    const net = require("net");
    const raw = process.env.DATABASE_URL;
    if (!raw) {
      console.error("DATABASE_URL is not set");
      process.exit(1);
    }
    const url = new URL(raw);
    const host = url.hostname;
    const port = Number(url.port || 5432);
    const deadline = Date.now() + 60_000;

    const attempt = () => {
      const socket = net.connect({ host, port }, () => {
        socket.end();
        process.exit(0);
      });
      socket.on("error", retry);
      socket.setTimeout(2000, () => {
        socket.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() > deadline) {
        console.error("Database not reachable at " + host + ":" + port);
        process.exit(1);
      }
      setTimeout(attempt, 1000);
    };

    attempt();
  '
}

npm run db:generate
echo "Waiting for database..."
wait_for_db
npm run db:migrate:deploy
exec npm run dev -- --webpack -H 0.0.0.0
