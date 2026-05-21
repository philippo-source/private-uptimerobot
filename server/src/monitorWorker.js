import { query } from "./db/pool.js";
import { sendDownAlert } from "./mailer.js";

const timers = new Map();

function classifyFailure(result) {
  if (result.error) {
    if (/ENOTFOUND|EAI_AGAIN|dns/i.test(result.error)) return "DNS Resolving problem";
    if (/timeout|AbortError/i.test(result.error)) return "Connection Timeout";
    return result.error.slice(0, 120);
  }

  if (result.statusCode) {
    if (result.statusCode === 401) return "Unauthorized";
    if (result.statusCode === 429) return "Gateway Timeout";
    return `HTTP ${result.statusCode}`;
  }

  return "Unknown error";
}

async function checkUrl(monitor) {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    monitor.timeout_seconds * 1000
  );

  try {
    const response = await fetch(monitor.url, {
      method: monitor.method,
      signal: controller.signal,
      redirect: "follow"
    });
    const responseTimeMs = Math.round(performance.now() - started);
    const isUp =
      response.status >= monitor.expected_status &&
      response.status < monitor.expected_status + 100;

    return {
      status: isUp ? "up" : "down",
      statusCode: response.status,
      responseTimeMs,
      error: null
    };
  } catch (error) {
    return {
      status: "down",
      statusCode: null,
      responseTimeMs: Math.round(performance.now() - started),
      error: error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function recordCheck(monitor, result) {
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
}

async function handleIncident(monitor, result) {
  const openIncident = await query(
    `SELECT * FROM incidents
     WHERE monitor_id = $1 AND status = 'open'
     ORDER BY started_at DESC
     LIMIT 1`,
    [monitor.id]
  );

  if (result.status === "down" && openIncident.rowCount === 0) {
    const created = await query(
      `INSERT INTO incidents (monitor_id, root_cause, status_code, error)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        monitor.id,
        classifyFailure(result),
        result.statusCode,
        result.error
      ]
    );

    try {
      const sent = await sendDownAlert({
        monitor,
        incident: created.rows[0]
      });
      if (sent) {
        await query(
          `UPDATE incidents SET notification_sent_at = NOW() WHERE id = $1`,
          [created.rows[0].id]
        );
      }
    } catch (error) {
      console.error(`Failed to send alert for ${monitor.name}:`, error.message);
    }
  }

  if (result.status === "up" && openIncident.rowCount > 0) {
    await query(
      `UPDATE incidents
       SET status = 'resolved', resolved_at = NOW()
       WHERE id = $1`,
      [openIncident.rows[0].id]
    );
  }
}

async function runMonitor(monitor) {
  const fresh = await query(`SELECT * FROM monitors WHERE id = $1`, [monitor.id]);
  const current = fresh.rows[0];
  if (!current || current.is_paused) return;

  const result = await checkUrl(current);
  await recordCheck(current, result);
  await handleIncident(current, result);
}

function scheduleMonitor(monitor) {
  clearMonitor(monitor.id);

  if (monitor.is_paused) return;

  const intervalMs = monitor.interval_seconds * 1000;
  const run = () =>
    runMonitor(monitor).catch((error) =>
      console.error(`Monitor ${monitor.name} failed:`, error.message)
    );

  run();
  timers.set(monitor.id, setInterval(run, intervalMs));
}

export function clearMonitor(id) {
  const timer = timers.get(id);
  if (timer) clearInterval(timer);
  timers.delete(id);
}

export async function reloadMonitor(id) {
  const result = await query(`SELECT * FROM monitors WHERE id = $1`, [id]);
  if (result.rowCount === 0) {
    clearMonitor(id);
    return;
  }

  scheduleMonitor(result.rows[0]);
}

export async function startMonitorWorker() {
  const result = await query(
    `SELECT * FROM monitors WHERE is_paused = FALSE ORDER BY created_at ASC`
  );
  for (const monitor of result.rows) {
    scheduleMonitor(monitor);
  }
  console.log(`Monitor worker scheduled ${result.rowCount} monitor(s).`);
}
