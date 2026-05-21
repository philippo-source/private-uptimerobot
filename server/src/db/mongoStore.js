import crypto from "node:crypto";
import { MongoClient } from "mongodb";
import { config } from "../config.js";

let client;
let db;

function mongoUrl() {
  if (!config.databaseUrlMongo) {
    throw new Error("DATABASE_URL_MONGO is required when DB_PROVIDER=mongodb.");
  }
  return config.databaseUrlMongo;
}

function dbNameFromUrl(url) {
  const parsed = new URL(url);
  const name = parsed.pathname.replace("/", "");
  return name || "uptimerobot";
}

export async function getMongoDb() {
  if (!client) {
    const url = mongoUrl();
    client = new MongoClient(url);
    await client.connect();
    db = client.db(dbNameFromUrl(url));
  }
  return db;
}

function collections(database) {
  return {
    monitors: database.collection("monitors"),
    checks: database.collection("checks"),
    incidents: database.collection("incidents")
  };
}

function monitorBase(doc) {
  return {
    id: doc.id,
    name: doc.name,
    url: doc.url,
    tags: doc.tags || [],
    method: doc.method,
    auth_username: doc.auth_username,
    auth_password: doc.auth_password,
    expected_status: doc.expected_status,
    interval_seconds: doc.interval_seconds,
    timeout_seconds: doc.timeout_seconds,
    status: doc.status,
    is_paused: doc.is_paused,
    last_checked_at: doc.last_checked_at,
    last_status_code: doc.last_status_code,
    last_response_time_ms: doc.last_response_time_ms,
    last_error: doc.last_error,
    created_at: doc.created_at
  };
}

function serializeMonitor(doc, stat) {
  return {
    id: doc.id,
    name: doc.name,
    url: doc.url,
    tags: doc.tags || [],
    method: doc.method,
    authUsername: doc.auth_username || "",
    hasAuth: Boolean(doc.auth_username && doc.auth_password),
    expectedStatus: doc.expected_status,
    intervalSeconds: doc.interval_seconds,
    timeoutSeconds: doc.timeout_seconds,
    status: doc.is_paused ? "paused" : doc.status,
    isPaused: doc.is_paused,
    lastCheckedAt: doc.last_checked_at,
    lastStatusCode: doc.last_status_code,
    lastResponseTimeMs: doc.last_response_time_ms,
    lastError: doc.last_error,
    createdAt: doc.created_at,
    stats: {
      min: stat?.min ?? null,
      max: stat?.max ?? null,
      avg: stat?.avg === undefined ? null : Math.round(stat.avg),
      checks: stat?.checks ?? 0,
      uptimePct: stat?.uptimePct ?? 0
    }
  };
}

async function statsFor(collection, monitorIds) {
  const stats = await collection
    .aggregate([
      { $match: { monitor_id: { $in: monitorIds } } },
      {
        $group: {
          _id: "$monitor_id",
          min: { $min: { $cond: [{ $eq: ["$status", "up"] }, "$response_time_ms", null] } },
          max: { $max: { $cond: [{ $eq: ["$status", "up"] }, "$response_time_ms", null] } },
          avg: { $avg: { $cond: [{ $eq: ["$status", "up"] }, "$response_time_ms", null] } },
          checks: { $sum: 1 },
          up: { $sum: { $cond: [{ $eq: ["$status", "up"] }, 1, 0] } }
        }
      }
    ])
    .toArray();

  return new Map(
    stats.map((item) => [
      item._id,
      {
        min: item.min,
        max: item.max,
        avg: item.avg,
        checks: item.checks,
        uptimePct: item.checks ? Number(((item.up / item.checks) * 100).toFixed(3)) : 0
      }
    ])
  );
}

export const mongoStore = {
  async init() {
    const database = await getMongoDb();
    const { monitors, checks, incidents } = collections(database);
    await Promise.all([
      monitors.createIndex({ id: 1 }, { unique: true }),
      checks.createIndex({ monitor_id: 1, checked_at: -1 }),
      incidents.createIndex({ monitor_id: 1, started_at: -1 })
    ]);
  },

  async summary() {
    const database = await getMongoDb();
    const { monitors, checks, incidents } = collections(database);
    const monitorRows = await monitors.find({}).toArray();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [incidentCount, recentChecks] = await Promise.all([
      incidents.countDocuments({ started_at: { $gte: since } }),
      checks.find({ checked_at: { $gte: since } }).project({ status: 1 }).toArray()
    ]);

    const counts = monitorRows.reduce(
      (acc, monitor) => {
        if (monitor.is_paused) acc.paused += 1;
        else if (monitor.status === "down") acc.down += 1;
        else acc.up += 1;
        return acc;
      },
      { up: 0, down: 0, paused: 0 }
    );

    const upChecks = recentChecks.filter((check) => check.status === "up").length;
    return {
      monitors: counts,
      totalMonitors: monitorRows.length,
      last24h: {
        uptimePct: recentChecks.length
          ? Number(((upChecks / recentChecks.length) * 100).toFixed(3))
          : 100,
        incidents: incidentCount
      }
    };
  },

  async listMonitors() {
    const database = await getMongoDb();
    const { monitors, checks } = collections(database);
    const rows = await monitors
      .find({})
      .sort({ is_paused: 1, status: 1, created_at: -1 })
      .toArray();
    const stats = await statsFor(checks, rows.map((row) => row.id));
    return rows.map((row) => serializeMonitor(row, stats.get(row.id)));
  },

  async createMonitor(data) {
    const database = await getMongoDb();
    const now = new Date();
    const id = crypto.randomUUID();
    await collections(database).monitors.insertOne({
      id,
      name: data.name,
      url: data.url,
      tags: data.tags || [],
      method: "GET",
      auth_username: data.authUsername || null,
      auth_password: data.authPassword || null,
      expected_status: data.expectedStatus,
      interval_seconds: data.intervalSeconds,
      timeout_seconds: data.timeoutSeconds,
      status: "pending",
      is_paused: false,
      last_checked_at: null,
      last_status_code: null,
      last_response_time_ms: null,
      last_error: null,
      created_at: now,
      updated_at: now
    });
    return id;
  },

  async getMonitor(id) {
    const database = await getMongoDb();
    const { monitors, checks } = collections(database);
    const row = await monitors.findOne({ id });
    if (!row) return null;
    const stats = await statsFor(checks, [id]);
    return serializeMonitor(row, stats.get(id));
  },

  async getRawMonitor(id) {
    const database = await getMongoDb();
    const row = await collections(database).monitors.findOne({ id });
    return row ? monitorBase(row) : null;
  },

  async listActiveMonitors() {
    const database = await getMongoDb();
    const rows = await collections(database).monitors
      .find({ is_paused: false })
      .sort({ created_at: 1 })
      .toArray();
    return rows.map(monitorBase);
  },

  async updateMonitor(id, data) {
    const database = await getMongoDb();
    const set = { updated_at: new Date() };
    if (data.name !== undefined) set.name = data.name;
    if (data.url !== undefined) set.url = data.url;
    if (data.tags !== undefined) set.tags = data.tags;
    if (data.authUsername !== undefined) set.auth_username = data.authUsername;
    if (data.authPassword !== undefined) set.auth_password = data.authPassword;
    if (data.intervalSeconds !== undefined) set.interval_seconds = data.intervalSeconds;
    if (data.timeoutSeconds !== undefined) set.timeout_seconds = data.timeoutSeconds;
    if (data.expectedStatus !== undefined) set.expected_status = data.expectedStatus;
    if (data.isPaused !== undefined) {
      set.is_paused = data.isPaused;
      set.status = data.isPaused ? "paused" : "pending";
    }

    const result = await collections(database).monitors.updateOne({ id }, { $set: set });
    return result.matchedCount > 0;
  },

  async deleteMonitor(id) {
    const database = await getMongoDb();
    const { monitors, checks, incidents } = collections(database);
    const result = await monitors.deleteOne({ id });
    if (result.deletedCount > 0) {
      await Promise.all([
        checks.deleteMany({ monitor_id: id }),
        incidents.deleteMany({ monitor_id: id })
      ]);
    }
    return result.deletedCount > 0;
  },

  async getChecks(monitorId, limit = 120) {
    const database = await getMongoDb();
    return collections(database).checks
      .find({ monitor_id: monitorId })
      .project({ _id: 0, status: 1, status_code: 1, response_time_ms: 1, error: 1, checked_at: 1 })
      .sort({ checked_at: -1 })
      .limit(limit)
      .toArray()
      .then((rows) => rows.reverse());
  },

  async getMonitorIncidents(monitorId, limit = 20) {
    const database = await getMongoDb();
    return collections(database).incidents
      .find({ monitor_id: monitorId })
      .project({ _id: 0 })
      .sort({ started_at: -1 })
      .limit(limit)
      .toArray();
  },

  async listIncidents() {
    const database = await getMongoDb();
    const { monitors, incidents } = collections(database);
    const rows = await incidents
      .find({})
      .project({ _id: 0 })
      .sort({ started_at: -1 })
      .limit(200)
      .toArray();
    const monitorRows = await monitors
      .find({ id: { $in: rows.map((row) => row.monitor_id) } })
      .project({ _id: 0, id: 1, name: 1, url: 1 })
      .toArray();
    const monitorMap = new Map(monitorRows.map((monitor) => [monitor.id, monitor]));
    return rows.map((row) => ({
      ...row,
      monitor_name: monitorMap.get(row.monitor_id)?.name || "Deleted monitor",
      monitor_url: monitorMap.get(row.monitor_id)?.url || ""
    }));
  },

  async recordCheck(monitor, result) {
    const database = await getMongoDb();
    const { monitors, checks } = collections(database);
    const now = new Date();
    await checks.insertOne({
      id: crypto.randomUUID(),
      monitor_id: monitor.id,
      status: result.status,
      status_code: result.statusCode,
      response_time_ms: result.responseTimeMs,
      error: result.error,
      checked_at: now
    });
    await monitors.updateOne(
      { id: monitor.id },
      {
        $set: {
          status: result.status,
          last_checked_at: now,
          last_status_code: result.statusCode,
          last_response_time_ms: result.responseTimeMs,
          last_error: result.error,
          updated_at: now
        }
      }
    );
  },

  async findOpenIncident(monitorId) {
    const database = await getMongoDb();
    return collections(database).incidents.findOne(
      { monitor_id: monitorId, status: "open" },
      { projection: { _id: 0 }, sort: { started_at: -1 } }
    );
  },

  async createIncident(monitorId, data) {
    const database = await getMongoDb();
    const incident = {
      id: crypto.randomUUID(),
      monitor_id: monitorId,
      status: "open",
      root_cause: data.rootCause,
      status_code: data.statusCode,
      error: data.error,
      started_at: new Date(),
      resolved_at: null,
      notification_sent_at: null
    };
    await collections(database).incidents.insertOne(incident);
    return incident;
  },

  async markIncidentNotified(id) {
    const database = await getMongoDb();
    await collections(database).incidents.updateOne(
      { id },
      { $set: { notification_sent_at: new Date() } }
    );
  },

  async resolveIncident(id) {
    const database = await getMongoDb();
    await collections(database).incidents.updateOne(
      { id },
      { $set: { status: "resolved", resolved_at: new Date() } }
    );
  }
};
