import app from "./app.js";
import { config } from "./config.js";
import { closePool } from "./db/pool.js";
import { startMonitorWorker, stopMonitorWorker } from "./monitorWorker.js";

const server = app.listen(config.port, async () => {
  console.log(`API listening on http://localhost:${config.port}`);
  await startMonitorWorker();
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down API.`);
  stopMonitorWorker();

  server.close(async () => {
    try {
      await closePool();
    } catch (error) {
      console.error("Failed to close database pool:", error.message);
    } finally {
      process.exit(0);
    }
  });

  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
