import express from "express";
import { query } from "./db/pool.js";
import { clearMonitor, reloadMonitor } from "./monitorWorker.js";

export const router = express.Router();

function normalizeUrl(url) {
  if (!/^https?:\/\//i.test(url)) return `https://${url}`;
  return url;
}

function serializeMonitor(row) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    method: row.method,
    expectedStatus: row.expected_status,
    intervalSeconds: row.interval_seconds,
    timeoutSeconds: row.timeout_seconds,
    status: row.is_paused ? "paused" : row.status,
    isPaused: row.is_paused,
    lastCheckedAt: row.last_checked_at,
    lastStatusCode: row.last_status_code,
    lastResponseTimeMs: row.last_response_time_ms,
    lastError: row.last_error,
    createdAt: row.created_at,
    stats: {
      min: row.min_response_ms === null ? null : Number(row.min_response_ms),
      max: row.max_response_ms === null ? null : Number(row.max_response_ms),
      avg: row.avg_response_ms === null ? null : Math.round(Number(row.avg_response_ms)),
      checks: Number(row.total_checks || 0),
      uptimePct: Number(row.uptime_pct || 0)
    }
  };
}

async function monitorWithStats(where = "", params = []) {
  const result = await query(
    `SELECT m.*,
            MIN(c.response_time_ms) FILTER (WHERE c.status = 'up') AS min_response_ms,
            MAX(c.response_time_ms) FILTER (WHERE c.status = 'up') AS max_response_ms,
            AVG(c.response_time_ms) FILTER (WHERE c.status = 'up') AS avg_response_ms,
            COUNT(c.id) AS total_checks,
            COALESCE(ROUND(100.0 * COUNT(c.id) FILTER (WHERE c.status = 'up') / NULLIF(COUNT(c.id), 0), 3), 0) AS uptime_pct
     FROM monitors m
     LEFT JOIN checks c ON c.monitor_id = m.id
     ${where}
     GROUP BY m.id
     ORDER BY
       CASE WHEN m.is_paused THEN 2 WHEN m.status = 'down' THEN 0 ELSE 1 END,
       m.created_at DESC`,
    params
  );

  return result.rows.map(serializeMonitor);
}

router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

router.get("/summary", async (_req, res, next) => {
  try {
    const monitors = await query(`SELECT status, is_paused FROM monitors`);
    const incidents = await query(
      `SELECT COUNT(*)::int AS count FROM incidents WHERE started_at >= NOW() - INTERVAL '24 hours'`
    );
    const uptime = await query(
      `SELECT COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'up') / NULLIF(COUNT(*), 0), 3), 100) AS uptime
       FROM checks
       WHERE checked_at >= NOW() - INTERVAL '24 hours'`
    );

    const counts = monitors.rows.reduce(
      (acc, monitor) => {
        if (monitor.is_paused) acc.paused += 1;
        else if (monitor.status === "down") acc.down += 1;
        else acc.up += 1;
        return acc;
      },
      { up: 0, down: 0, paused: 0 }
    );

    res.json({
      monitors: counts,
      totalMonitors: monitors.rowCount,
      last24h: {
        uptimePct: Number(uptime.rows[0].uptime),
        incidents: incidents.rows[0].count
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get("/monitors", async (_req, res, next) => {
  try {
    res.json(await monitorWithStats());
  } catch (error) {
    next(error);
  }
});

router.post("/monitors", async (req, res, next) => {
  try {
    const {
      name,
      url,
      intervalSeconds = 60,
      timeoutSeconds = 10,
      expectedStatus = 200
    } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: "Name and URL are required." });
    }

    const result = await query(
      `INSERT INTO monitors (name, url, interval_seconds, timeout_seconds, expected_status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        name.trim(),
        normalizeUrl(url.trim()),
        Number(intervalSeconds) || 60,
        Number(timeoutSeconds) || 10,
        Number(expectedStatus) || 200
      ]
    );

    await reloadMonitor(result.rows[0].id);
    res.status(201).json((await monitorWithStats("WHERE m.id = $1", [result.rows[0].id]))[0]);
  } catch (error) {
    next(error);
  }
});

router.get("/monitors/:id", async (req, res, next) => {
  try {
    const monitors = await monitorWithStats("WHERE m.id = $1", [req.params.id]);
    if (!monitors[0]) return res.status(404).json({ error: "Monitor not found." });

    const checks = await query(
      `SELECT status, status_code, response_time_ms, error, checked_at
       FROM checks
       WHERE monitor_id = $1
       ORDER BY checked_at DESC
       LIMIT 120`,
      [req.params.id]
    );

    const incidents = await query(
      `SELECT *
       FROM incidents
       WHERE monitor_id = $1
       ORDER BY started_at DESC
       LIMIT 20`,
      [req.params.id]
    );

    res.json({
      ...monitors[0],
      checks: checks.rows.reverse(),
      incidents: incidents.rows
    });
  } catch (error) {
    next(error);
  }
});

router.put("/monitors/:id", async (req, res, next) => {
  try {
    const {
      name,
      url,
      intervalSeconds,
      timeoutSeconds,
      expectedStatus,
      isPaused
    } = req.body;

    const result = await query(
      `UPDATE monitors
       SET name = COALESCE($2, name),
           url = COALESCE($3, url),
           interval_seconds = COALESCE($4, interval_seconds),
           timeout_seconds = COALESCE($5, timeout_seconds),
           expected_status = COALESCE($6, expected_status),
           is_paused = COALESCE($7, is_paused),
           status = CASE
             WHEN COALESCE($7, is_paused) THEN 'paused'
             WHEN status = 'paused' THEN 'pending'
             ELSE status
           END
       WHERE id = $1
       RETURNING *`,
      [
        req.params.id,
        name?.trim(),
        url ? normalizeUrl(url.trim()) : null,
        intervalSeconds === undefined ? null : Number(intervalSeconds),
        timeoutSeconds === undefined ? null : Number(timeoutSeconds),
        expectedStatus === undefined ? null : Number(expectedStatus),
        isPaused
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Monitor not found." });
    }

    await reloadMonitor(req.params.id);
    res.json((await monitorWithStats("WHERE m.id = $1", [req.params.id]))[0]);
  } catch (error) {
    next(error);
  }
});

router.delete("/monitors/:id", async (req, res, next) => {
  try {
    const result = await query(`DELETE FROM monitors WHERE id = $1`, [req.params.id]);
    clearMonitor(req.params.id);
    if (result.rowCount === 0) return res.status(404).json({ error: "Monitor not found." });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get("/incidents", async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT i.*, m.name AS monitor_name, m.url AS monitor_url
       FROM incidents i
       JOIN monitors m ON m.id = i.monitor_id
       ORDER BY i.started_at DESC
       LIMIT 200`
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});
