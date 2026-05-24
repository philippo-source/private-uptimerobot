import { store } from "./db/store.js";
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
    const headers = {};
    if (monitor.auth_username && monitor.auth_password) {
      headers.Authorization = `Basic ${Buffer.from(
        `${monitor.auth_username}:${monitor.auth_password}`
      ).toString("base64")}`;
    }

    const response = await fetch(monitor.url, {
      method: monitor.method,
      headers,
      signal: controller.signal,
      redirect: "follow"
    });
    const responseTimeMs = Math.round(performance.now() - started);
    const statusMatches =
      response.status >= monitor.expected_status &&
      response.status < monitor.expected_status + 100;
    let bodyMatches = true;

    if (monitor.expected_body) {
      const body = await response.text();
      bodyMatches = body.includes(monitor.expected_body);
    }

    return {
      status: statusMatches && bodyMatches ? "up" : "down",
      statusCode: response.status,
      responseTimeMs,
      error: bodyMatches ? null : "Expected response body was not found"
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
  await store.recordCheck(monitor, result);
}

async function handleIncident(monitor, result) {
  const openIncident = await store.findOpenIncident(monitor.id);

  if (result.status === "down" && !openIncident) {
    const incident = await store.createIncident(monitor.id, {
      rootCause: classifyFailure(result),
      statusCode: result.statusCode,
      error: result.error
    });

    try {
      const sent = await sendDownAlert({
        monitor,
        incident
      });
      if (sent) {
        await store.markIncidentNotified(incident.id);
      }
    } catch (error) {
      console.error(`Failed to send alert for ${monitor.name}:`, error.message);
    }
  }

  if (result.status === "up" && openIncident) {
    await store.resolveIncident(openIncident.id);
  }
}

async function runMonitor(monitor) {
  const current = await store.getRawMonitor(monitor.id);
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
  const monitor = await store.getRawMonitor(id);
  if (!monitor) {
    clearMonitor(id);
    return;
  }

  scheduleMonitor(monitor);
}

export async function startMonitorWorker() {
  const monitors = await store.listActiveMonitors();
  for (const monitor of monitors) {
    scheduleMonitor(monitor);
  }
  console.log(`Monitor worker scheduled ${monitors.length} monitor(s).`);

  const pruneJob = setInterval(() => {
    if (typeof store.pruneOldChecks === "function") {
      store.pruneOldChecks(30).catch((e) => console.error("Prune error:", e));
    }
  }, 24 * 60 * 60 * 1000);
  timers.set("prune", pruneJob);
}

export function stopMonitorWorker() {
  for (const timer of timers.values()) {
    clearInterval(timer);
  }
  timers.clear();
}

export async function runCronChecks() {
  const monitors = await store.listActiveMonitors();
  const now = Date.now();
  const promises = [];

  for (const monitor of monitors) {
    const lastChecked = monitor.last_checked_at ? new Date(monitor.last_checked_at).getTime() : 0;
    const intervalMs = monitor.interval_seconds * 1000;

    // Check if the monitor has never been checked or is due for its next check (using a 5s buffer)
    if (now - lastChecked >= intervalMs - 5000) {
      promises.push(
        runMonitor(monitor).catch((error) =>
          console.error(`Cron monitor ${monitor.name} failed:`, error.message)
        )
      );
    }
  }

  await Promise.all(promises);

  if (typeof store.pruneOldChecks === "function") {
    store.pruneOldChecks(30).catch((error) => console.error("Prune error:", error));
  }
}

