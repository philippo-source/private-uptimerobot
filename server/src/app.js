import cors from "cors";
import express from "express";
import { initStore } from "./db/store.js";
import { router } from "./routes.js";

const app = express();

let storeInitialized = false;
let initPromise = null;

// Ensure database store is fully initialized before processing requests.
const ensureStoreInit = async (req, res, next) => {
  if (!storeInitialized) {
    if (!initPromise) {
      initPromise = initStore().then(() => {
        storeInitialized = true;
      });
    }
    await initPromise;
  }
  next();
};

const authMiddleware = (req, res, next) => {
  // Allow cron route to handle its own authentication (CRON_SECRET)
  if (req.path === "/cron" || req.path.startsWith("/cron/")) {
    return next();
  }

  const { APP_USERNAME, APP_PASSWORD } = process.env;
  
  if (!APP_USERNAME && !APP_PASSWORD) {
    return next(); // No auth configured
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const base64Credentials = authHeader.split(" ")[1];
  const credentials = Buffer.from(base64Credentials, "base64").toString("utf-8");
  const [username, password] = credentials.split(":");

  if (
    (APP_USERNAME && username !== APP_USERNAME) ||
    (APP_PASSWORD && password !== APP_PASSWORD)
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
};

app.use(cors());
app.use(express.json());
app.use(ensureStoreInit);
app.use("/api", authMiddleware, router);

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.statusCode || 500).json({
    error: error.statusCode ? error.message : "Something went wrong."
  });
});

export default app;
