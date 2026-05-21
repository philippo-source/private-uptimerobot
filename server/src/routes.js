import express from "express";
import { store } from "./db/store.js";
import { clearMonitor, reloadMonitor } from "./monitorWorker.js";
import { emailConfigStatus, sendTestEmail } from "./mailer.js";

export const router = express.Router();

function normalizeUrl(url) {
  if (!/^https?:\/\//i.test(url)) return `https://${url}`;
  return url;
}

function monitorPayload(body) {
  return {
    name: body.name?.trim(),
    url: body.url ? normalizeUrl(body.url.trim()) : undefined,
    tags: Array.isArray(body.tags)
      ? body.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : undefined,
    authUsername:
      body.authUsername === undefined || body.authUsername.trim() === ""
        ? undefined
        : body.authUsername.trim(),
    authPassword:
      body.authPassword === undefined || body.authPassword === ""
        ? undefined
        : body.authPassword,
    intervalSeconds:
      body.intervalSeconds === undefined ? undefined : Number(body.intervalSeconds),
    timeoutSeconds:
      body.timeoutSeconds === undefined ? undefined : Number(body.timeoutSeconds),
    expectedStatus:
      body.expectedStatus === undefined ? undefined : Number(body.expectedStatus),
    expectedBody:
      body.expectedBody === undefined ? undefined : body.expectedBody.trim(),
    isPaused: body.isPaused
  };
}

router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

router.get("/email/status", (_req, res) => {
  res.json(emailConfigStatus());
});

router.get("/summary", async (_req, res, next) => {
  try {
    res.json(await store.summary());
  } catch (error) {
    next(error);
  }
});

router.get("/monitors", async (_req, res, next) => {
  try {
    res.json(await store.listMonitors());
  } catch (error) {
    next(error);
  }
});

router.post("/monitors", async (req, res, next) => {
  try {
    const data = monitorPayload(req.body);

    if (!data.name || !data.url) {
      return res.status(400).json({ error: "Name and URL are required." });
    }

    const id = await store.createMonitor({
      name: data.name,
      url: data.url,
      tags: data.tags || [],
      authUsername: data.authUsername || null,
      authPassword: data.authPassword || null,
      intervalSeconds: data.intervalSeconds || 60,
      timeoutSeconds: data.timeoutSeconds || 10,
      expectedStatus: data.expectedStatus || 200,
      expectedBody: data.expectedBody || null
    });

    await reloadMonitor(id);
    res.status(201).json(await store.getMonitor(id));
  } catch (error) {
    next(error);
  }
});

router.get("/monitors/:id", async (req, res, next) => {
  try {
    const monitor = await store.getMonitor(req.params.id);
    if (!monitor) return res.status(404).json({ error: "Monitor not found." });

    const [checks, incidents] = await Promise.all([
      store.getChecks(req.params.id),
      store.getMonitorIncidents(req.params.id)
    ]);

    res.json({
      ...monitor,
      checks,
      incidents
    });
  } catch (error) {
    next(error);
  }
});

router.put("/monitors/:id", async (req, res, next) => {
  try {
    const ok = await store.updateMonitor(req.params.id, monitorPayload(req.body));
    if (!ok) return res.status(404).json({ error: "Monitor not found." });

    await reloadMonitor(req.params.id);
    res.json(await store.getMonitor(req.params.id));
  } catch (error) {
    next(error);
  }
});

router.delete("/monitors/:id", async (req, res, next) => {
  try {
    const ok = await store.deleteMonitor(req.params.id);
    clearMonitor(req.params.id);
    if (!ok) return res.status(404).json({ error: "Monitor not found." });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post("/monitors/:id/test-email", async (req, res, next) => {
  try {
    const monitor = await store.getMonitor(req.params.id);
    if (!monitor) return res.status(404).json({ error: "Monitor not found." });

    await sendTestEmail(monitor);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get("/incidents", async (_req, res, next) => {
  try {
    res.json(await store.listIncidents());
  } catch (error) {
    next(error);
  }
});
