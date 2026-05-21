import { query } from "./pool.js";

function serializeMonitor(row) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    tags: row.tags || [],
    method: row.method,
    authUsername: row.auth_username || "",
    hasAuth: Boolean(row.auth_username && row.auth_password),
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

function normalizeMonitor(row) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    tags: row.tags || [],
    method: row.method,
    auth_username: row.auth_username,
    auth_password: row.auth_password,
    expected_status: row.expected_status,
    interval_seconds: row.interval_seconds,
    timeout_seconds: row.timeout_seconds,
    status: row.status,
    is_paused: row.is_paused,
    last_checked_at: row.last_checked_at,
    last_status_code: row.last_status_code,
    last_response_time_ms: row.last_response_time_ms,
    last_error: row.last_error,
    created_at: row.created_at
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

export const postgresStore = {
  async summary() {
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

    return {
      monitors: counts,
      totalMonitors: monitors.rowCount,
      last24h: {
        uptimePct: Number(uptime.rows[0].uptime),
        incidents: incidents.rows[0].count
      }
    };
  },

  listMonitors() {
    return monitorWithStats();
  },

  async createMonitor(data) {
    const result = await query(
      `INSERT INTO monitors (name, url, tags, auth_username, auth_password, interval_seconds, timeout_seconds, expected_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        data.name,
        data.url,
        data.tags,
        data.authUsername,
        data.authPassword,
        data.intervalSeconds,
        data.timeoutSeconds,
        data.expectedStatus
      ]
    );
    return result.rows[0].id;
  },

  async getMonitor(id) {
    return (await monitorWithStats("WHERE m.id = $1", [id]))[0] || null;
  },

  async getRawMonitor(id) {
    const result = await query(`SELECT * FROM monitors WHERE id = $1`, [id]);
    return result.rows[0] ? normalizeMonitor(result.rows[0]) : null;
  },

  async listActiveMonitors() {
    const result = await query(
      `SELECT * FROM monitors WHERE is_paused = FALSE ORDER BY created_at ASC`
    );
    return result.rows.map(normalizeMonitor);
  },

  async updateMonitor(id, data) {
    const result = await query(
      `UPDATE monitors
       SET name = COALESCE($2, name),
           url = COALESCE($3, url),
           tags = COALESCE($4, tags),
           auth_username = COALESCE($5, auth_username),
           auth_password = COALESCE($6, auth_password),
           interval_seconds = COALESCE($7, interval_seconds),
           timeout_seconds = COALESCE($8, timeout_seconds),
           expected_status = COALESCE($9, expected_status),
           is_paused = COALESCE($10, is_paused),
           status = CASE
             WHEN COALESCE($10, is_paused) THEN 'paused'
             WHEN status = 'paused' THEN 'pending'
             ELSE status
           END
       WHERE id = $1
       RETURNING *`,
      [
        id,
        data.name,
        data.url,
        data.tags,
        data.authUsername,
        data.authPassword,
        data.intervalSeconds,
        data.timeoutSeconds,
        data.expectedStatus,
        data.isPaused
      ]
    );
    return result.rowCount > 0;
  },

  async deleteMonitor(id) {
    const result = await query(`DELETE FROM monitors WHERE id = $1`, [id]);
    return result.rowCount > 0;
  },

  async getChecks(monitorId, limit = 120) {
    const result = await query(
      `SELECT status, status_code, response_time_ms, error, checked_at
       FROM checks
       WHERE monitor_id = $1
       ORDER BY checked_at DESC
       LIMIT $2`,
      [monitorId, limit]
    );
    return result.rows.reverse();
  },

  async getMonitorIncidents(monitorId, limit = 20) {
    const result = await query(
      `SELECT *
       FROM incidents
       WHERE monitor_id = $1
       ORDER BY started_at DESC
       LIMIT $2`,
      [monitorId, limit]
    );
    return result.rows;
  },

  async listIncidents() {
    const result = await query(
      `SELECT i.*, m.name AS monitor_name, m.url AS monitor_url
       FROM incidents i
       JOIN monitors m ON m.id = i.monitor_id
       ORDER BY i.started_at DESC
       LIMIT 200`
    );
    return result.rows;
  },

  async recordCheck(monitor, result) {
    await query(
      `INSERT INTO checks (monitor_id, status, status_code, response_time_ms, error)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        monitor.id,
        result.status,
        result.statusCode,
        result.responseTimeMs,
        result.error
      ]
    );

    await query(
      `UPDATE monitors
       SET status = $2,
           last_checked_at = NOW(),
           last_status_code = $3,
           last_response_time_ms = $4,
           last_error = $5
       WHERE id = $1`,
      [
        monitor.id,
        result.status,
        result.statusCode,
        result.responseTimeMs,
        result.error
      ]
    );
  },

  async findOpenIncident(monitorId) {
    const result = await query(
      `SELECT * FROM incidents
       WHERE monitor_id = $1 AND status = 'open'
       ORDER BY started_at DESC
       LIMIT 1`,
      [monitorId]
    );
    return result.rows[0] || null;
  },

  async createIncident(monitorId, data) {
    const result = await query(
      `INSERT INTO incidents (monitor_id, root_cause, status_code, error)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [monitorId, data.rootCause, data.statusCode, data.error]
    );
    return result.rows[0];
  },

  markIncidentNotified(id) {
    return query(`UPDATE incidents SET notification_sent_at = NOW() WHERE id = $1`, [id]);
  },

  resolveIncident(id) {
    return query(
      `UPDATE incidents
       SET status = 'resolved', resolved_at = NOW()
       WHERE id = $1`,
      [id]
    );
  }
};
