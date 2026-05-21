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

app.use(cors());
app.use(express.json());
app.use(ensureStoreInit);
app.use("/api", router);

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.statusCode || 500).json({
    error: error.statusCode ? error.message : "Something went wrong."
  });
});

export default app;
