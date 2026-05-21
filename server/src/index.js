import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { initStore } from "./db/store.js";
import { router } from "./routes.js";
import { startMonitorWorker } from "./monitorWorker.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api", router);

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Something went wrong." });
});

app.listen(config.port, async () => {
  console.log(`API listening on http://localhost:${config.port}`);
  await initStore();
  await startMonitorWorker();
});
