import { useEffect, useMemo, useState, useRef } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Edit3,
  Gauge,
  LayoutDashboard,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert
} from "lucide-react";
import { api } from "./lib/api.js";
import { dateTime, duration, ms, pct, timeAgo } from "./lib/format.js";

function shortTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function tooltipTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "numeric",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "shortOffset"
  }).format(new Date(value));
}

function tooltipRange(start, end) {
  if (!end) return "";
  if (!start) return tooltipTime(end);
  const startText = new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "numeric",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(start));
  const endText = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "shortOffset"
  }).format(new Date(end));
  return `${startText} - ${endText}`;
}

function Shell({ page, setPage, children }) {
  const items = [
    ["monitors", "Monitoring", LayoutDashboard],
    ["incidents", "Incidents", ShieldAlert]
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span />UptimeMonitor</div>
        <nav>
          {items.map(([id, label, Icon]) => (
            <button
              className={page === id ? "active" : ""}
              key={id}
              onClick={() => setPage(id)}
            >
              <Icon size={20} />
              {label}
            </button>
          ))}
        </nav>
        <div className="profile">
          <div className="avatar">UM</div>
          <div>
            <strong>Monitor Admin</strong>
            <small>Germany host</small>
          </div>
        </div>
      </aside>
      <main>{children}</main>
    </div>
  );
}

function StatusPill({ status }) {
  return <span className={`status status-${status}`}>{status}</span>;
}

function Sparkline({ checks = [] }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  const bars = Array.from({ length: 24 }, (_, index) => {
    const start = new Date(now - (24 - index) * hourMs);
    const end = new Date(now - (23 - index) * hourMs);
    const hourChecks = checks.filter((check) => {
      const checkedAt = new Date(check.checked_at).getTime();
      return checkedAt >= start.getTime() && checkedAt < end.getTime();
    });
    const hasDown = hourChecks.some((check) => check.status === "down");
    return {
      start,
      end,
      checks: hourChecks,
      status: hourChecks.length === 0 ? "idle" : hasDown ? "down" : "up"
    };
  });
  const checkedBars = bars.filter((bar) => bar.checks.length > 0);
  const upBars = checkedBars.filter((bar) => bar.status === "up").length;
  const uptime = checkedBars.length ? (upBars / checkedBars.length) * 100 : 0;
  const hoverBar = hoverIndex === null ? null : bars[hoverIndex];

  return (
    <div className="sparkline">
      {bars.map((check, index) => (
        <span
          key={check.start.toISOString()}
          className={`spark-bar ${check.status === "down" ? "bad" : check.status === "idle" ? "idle" : ""}`}
          onFocus={() => setHoverIndex(index)}
          onMouseEnter={() => setHoverIndex(index)}
          onMouseLeave={() => setHoverIndex(null)}
          tabIndex="0"
        />
      ))}
      {hoverBar && (
        <div className="spark-tooltip">
          <span>{tooltipRange(hoverBar.start, hoverBar.end)}</span>
          <b>
            {hoverBar.status === "idle" ? "No checks" : hoverBar.status === "up" ? "Up" : "Down"} {pct(uptime)}
          </b>
        </div>
      )}
    </div>
  );
}

function recentUptime(checks = [], fallback = 0) {
  if (!checks.length) return fallback;
  const up = checks.filter((check) => check.status === "up").length;
  return (up / checks.length) * 100;
}

function checksInRange(checks, start, end = new Date()) {
  return checks.filter((check) => {
    const checkedAt = new Date(check.checked_at);
    return checkedAt >= start && checkedAt <= end;
  });
}

function incidentsInRange(incidents, start, end = new Date()) {
  return incidents.filter((incident) => {
    const startedAt = new Date(incident.started_at);
    return startedAt >= start && startedAt <= end;
  });
}

function uptimeSummary(checks, incidents, start, end = new Date()) {
  const rangeChecks = checksInRange(checks, start, end);
  const upChecks = rangeChecks.filter((check) => check.status === "up").length;
  const downChecks = rangeChecks.length - upChecks;
  const uptimePct = rangeChecks.length ? (upChecks / rangeChecks.length) * 100 : null;
  const incidentRows = incidentsInRange(incidents, start, end);
  const downMinutes = rangeChecks.length
    ? Math.round(downChecks * ((end - start) / Math.max(1, rangeChecks.length)) / 60000)
    : 0;

  return {
    uptimePct,
    incidents: incidentRows.length,
    downLabel: downMinutes ? duration(0, downMinutes * 60000) : "0m"
  };
}

function formatDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function mtbf(incidents, start, end = new Date()) {
  const count = incidentsInRange(incidents, start, end).length;
  if (count < 2) return "N/A";
  const hours = (end - start) / 3600000;
  return `${(hours / count).toFixed(1)}h`;
}

function currentStatusDuration(monitor) {
  if (monitor.status === "paused") return "Currently paused";

  const latestIncident = monitor.incidents?.[0];
  if (monitor.status === "down" && latestIncident?.status === "open") {
    return `Currently down for ${duration(latestIncident.started_at)}`;
  }

  const latestResolved = monitor.incidents?.find((incident) => incident.resolved_at);
  const upSince = latestResolved?.resolved_at || monitor.createdAt;
  return `Currently up for ${duration(upSince)}`;
}

function UptimeSummaryPanel({ monitor, onRangeChange }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customStart, setCustomStart] = useState(formatDateInput(new Date()));
  const [customEnd, setCustomEnd] = useState("");
  const [mtbfRange, setMtbfRange] = useState("365");
  const now = new Date();
  const ranges = {
    7: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    30: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    365: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
  };
  const cards = [
    ["Last 7 days", uptimeSummary(monitor.checks, monitor.incidents, ranges[7])],
    ["Last 30 days", uptimeSummary(monitor.checks, monitor.incidents, ranges[30])],
    ["Last 365 days", uptimeSummary(monitor.checks, monitor.incidents, ranges[365])]
  ];
  const customRange = {
    start: customStart ? new Date(`${customStart}T00:00:00`) : ranges[7],
    end: customEnd ? new Date(`${customEnd}T23:59:59`) : now
  };
  const customSummary = uptimeSummary(monitor.checks, monitor.incidents, customRange.start, customRange.end);

  useEffect(() => {
    onRangeChange(customRange);
  }, [customStart, customEnd]);

  function applyPreset(name) {
    const date = new Date();
    if (name === "week") {
      setCustomStart(formatDateInput(new Date(date.getTime() - 7 * 24 * 60 * 60 * 1000)));
      setCustomEnd(formatDateInput(date));
    }
    if (name === "last-week") {
      setCustomStart(formatDateInput(new Date(date.getTime() - 14 * 24 * 60 * 60 * 1000)));
      setCustomEnd(formatDateInput(new Date(date.getTime() - 7 * 24 * 60 * 60 * 1000)));
    }
    if (name === "month") {
      setCustomStart(formatDateInput(new Date(date.getFullYear(), date.getMonth(), 1)));
      setCustomEnd(formatDateInput(date));
    }
    if (name === "last-month") {
      setCustomStart(formatDateInput(new Date(date.getFullYear(), date.getMonth() - 1, 1)));
      setCustomEnd(formatDateInput(new Date(date.getFullYear(), date.getMonth(), 0)));
    }
    if (name === "history") {
      const firstCheck = monitor.checks[0]?.checked_at;
      setCustomStart(formatDateInput(firstCheck ? new Date(firstCheck) : date));
      setCustomEnd(formatDateInput(date));
    }
  }

  return (
    <div className="panel uptime-panel">
      {cards.map(([label, summary]) => (
        <div className="uptime-card" key={label}>
          <h2>{label}</h2>
          <strong>{summary.uptimePct === null ? "--.--%" : pct(summary.uptimePct)}</strong>
          <p>{summary.incidents} incidents, {summary.downLabel} down</p>
        </div>
      ))}
      <div className="uptime-card picker-card">
        <button type="button" className="range-trigger" onClick={() => setPickerOpen(true)}>
          Pick a date...
        </button>
        <strong>{customSummary.uptimePct === null ? "--.--%" : pct(customSummary.uptimePct)}</strong>
        <p>{customSummary.incidents} incidents, {customSummary.downLabel} down</p>
        {pickerOpen && (
          <div className="date-popover">
            <div className="popover-head">
              <h2>Pick a date range.</h2>
              <button type="button" className="icon" onClick={() => setPickerOpen(false)}>x</button>
            </div>
            <div className="preset-row">
              <button type="button" onClick={() => applyPreset("week")}>This week</button>
              <button type="button" onClick={() => applyPreset("last-week")}>Last week</button>
              <button type="button" onClick={() => applyPreset("month")}>This month</button>
              <button type="button" onClick={() => applyPreset("last-month")}>Last month</button>
              <button type="button" onClick={() => applyPreset("history")}>Entire history</button>
            </div>
            <div className="date-inputs">
              <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} />
              <span>-</span>
              <input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} />
            </div>
          </div>
        )}
      </div>
      <div className="uptime-card mtbf-card">
        <div className="mtbf-head">
          <h2>MTBF</h2>
          <select value={mtbfRange} onChange={(event) => setMtbfRange(event.target.value)}>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="365">365 days</option>
          </select>
        </div>
        <strong>{mtbf(monitor.incidents, ranges[mtbfRange])}</strong>
      </div>
    </div>
  );
}

function ResponseTimeChart({ monitor, customRange }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const [range, setRange] = useState("hour");
  const prevCustomRange = useRef(customRange);

  useEffect(() => {
    if (!prevCustomRange.current && customRange) {
      prevCustomRange.current = customRange;
      return;
    }
    
    if (
      customRange &&
      prevCustomRange.current &&
      (customRange.start?.getTime() !== prevCustomRange.current.start?.getTime() ||
       customRange.end?.getTime() !== prevCustomRange.current.end?.getTime())
    ) {
      setRange("custom");
      prevCustomRange.current = customRange;
    }
  }, [customRange]);

  const now = new Date();
  const rawChecks = monitor.checks
    .filter((check) => check.response_time_ms !== null && check.response_time_ms !== undefined)
    .sort((a, b) => new Date(a.checked_at) - new Date(b.checked_at));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  function averageBucket(bucketChecks, checkedAt, label) {
    if (bucketChecks.length === 0) return null;
    const average = Math.round(
      bucketChecks.reduce((sum, check) => sum + check.response_time_ms, 0) / bucketChecks.length
    );
    return {
      checked_at: checkedAt.toISOString(),
      response_time_ms: average,
      label,
      samples: bucketChecks.length
    };
  }

  const points = (() => {
    if (range === "custom" && customRange) {
      return rawChecks.filter((check) => {
        const checkedAt = new Date(check.checked_at);
        return checkedAt >= customRange.start && checkedAt <= customRange.end;
      }).slice(-80);
    }

    if (range === "hour") {
      const start = new Date(now.getTime() - 60 * 60 * 1000);
      return rawChecks.filter((check) => new Date(check.checked_at) >= start).slice(-40);
    }

    if (range === "24h") {
      const hourMs = 60 * 60 * 1000;
      return Array.from({ length: 24 }, (_, index) => {
        const start = new Date(now.getTime() - (24 - index) * hourMs);
        const end = new Date(now.getTime() - (23 - index) * hourMs);
        const bucketChecks = rawChecks.filter((check) => {
          const checkedAt = new Date(check.checked_at);
          return checkedAt >= start && checkedAt < end;
        });
        const hourLabel = start.getHours().toString().padStart(2, "0");
        return averageBucket(bucketChecks, start, `${hourLabel}:00`);
      }).filter(Boolean);
    }

    return Array.from({ length: monthDays }, (_, dayIndex) => {
      const start = new Date(now.getFullYear(), now.getMonth(), dayIndex + 1);
      const end = new Date(now.getFullYear(), now.getMonth(), dayIndex + 2);
      const bucketChecks = rawChecks.filter((check) => {
        const checkedAt = new Date(check.checked_at);
        return checkedAt >= start && checkedAt < end;
      });
      return averageBucket(bucketChecks, start, start.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }));
    }).filter(Boolean);
  })();

  const values = points.map((check) => check.response_time_ms);
  const rangeStats = {
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    avg: values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null
  };
  const maxValue = Math.max(418, rangeStats.max || 0, ...values);
  const midValue = Math.max(1, Math.round(maxValue * 0.36));
  const width = 920;
  const height = 170;
  const padX = 66;
  const top = 24;
  const bottom = 34;
  const chartW = width - padX - 28;
  const chartH = height - top - bottom;

  const linePoints = points.map((check, index) => {
    const x = padX + (points.length <= 1 ? chartW / 2 : (index / (points.length - 1)) * chartW);
    const y = top + chartH - (check.response_time_ms / maxValue) * chartH;
    return { x, y, check };
  });
  const path = linePoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
  const tickIndexes = points.length <= 4
    ? points.map((_, index) => index)
    : [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const hoverPoint = hoverIndex === null ? null : linePoints[hoverIndex];
  const tooltipX = hoverPoint ? Math.min(width - 210, Math.max(8, hoverPoint.x - 105)) : 0;
  const tooltipY = hoverPoint ? Math.max(4, hoverPoint.y - 76) : 0;

  return (
    <div className="panel response-panel">
      <div className="chart-head">
        <h2>Response time</h2>
        <div className="chart-actions">
          <select
            aria-label="Response time range"
            value={range}
            onChange={(event) => {
              setRange(event.target.value);
              setHoverIndex(null);
            }}
          >
            <option value="hour">Last hour</option>
            <option value="24h">Last 24 hours</option>
            <option value="month">Whole month</option>
            {customRange && <option value="custom">Selected range</option>}
          </select>
        </div>
      </div>
      <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Response time chart">
        <line x1={padX} x2={width - 28} y1={top} y2={top} />
        <line x1={padX} x2={width - 28} y1={top + chartH * 0.64} y2={top + chartH * 0.64} />
        <line x1={padX} x2={width - 28} y1={top + chartH} y2={top + chartH} />
        <text x="10" y={top + 4}>{maxValue}ms</text>
        <text x="28" y={top + chartH * 0.64 + 4}>{midValue}ms</text>
        <text x="42" y={top + chartH + 4}>0ms</text>
        {path && <path d={path} />}
        {linePoints.map((point, index) => (
          <circle
            className={hoverIndex === index ? "active-point" : ""}
            key={`${point.check.checked_at}-${index}`}
            cx={point.x}
            cy={point.y}
            r="6"
          />
        ))}
        {hoverPoint && (
          <g className="chart-tooltip">
            <line className="hover-line" x1={hoverPoint.x} x2={hoverPoint.x} y1={top} y2={top + chartH} />
            <rect x={tooltipX} y={tooltipY} width="202" height="62" rx="8" />
            <text x={tooltipX + 10} y={tooltipY + 24}>{hoverPoint.check.label || tooltipTime(hoverPoint.check.checked_at)}</text>
            <text className="tooltip-value" x={tooltipX + 10} y={tooltipY + 48}>{ms(hoverPoint.check.response_time_ms)}</text>
          </g>
        )}
        {tickIndexes.map((index) => {
          const point = linePoints[index];
          if (!point) return null;
          return (
            <text
              className="x-label"
              key={point.check.checked_at}
              x={point.x}
              y={height - 6}
              textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
            >
              {point.check.label || shortTime(point.check.checked_at)}
            </text>
          );
        })}
        {linePoints.map((point, index) => {
          const previous = linePoints[index - 1];
          const next = linePoints[index + 1];
          const left = previous ? (previous.x + point.x) / 2 : padX;
          const right = next ? (next.x + point.x) / 2 : width - 28;
          return (
            <rect
              className="hit-zone"
              key={`hit-${point.check.checked_at}-${index}`}
              x={left}
              y={top}
              width={Math.max(1, right - left)}
              height={chartH}
              onMouseEnter={() => setHoverIndex(index)}
              onMouseMove={() => setHoverIndex(index)}
              onMouseLeave={() => setHoverIndex(null)}
            />
          );
        })}
      </svg>
      {points.length === 0 && <div className="chart-empty">No response-time data for this range.</div>}
      <div className="response-stats">
        <b><span>~</span>{ms(rangeStats.avg)}<small>Average</small></b>
        <b><span className="min">↓</span>{ms(rangeStats.min)}<small>Minimum</small></b>
        <b><span className="max">↑</span>{ms(rangeStats.max)}<small>Maximum</small></b>
      </div>
    </div>
  );
}

function MonitorForm({ monitor, onClose, onSave }) {
  const [form, setForm] = useState({
    name: monitor?.name || "",
    url: monitor?.url || "",
    tags: monitor?.tags || [],
    tagDraft: "",
    authUsername: monitor?.authUsername || "",
    authPassword: "",
    intervalSeconds: monitor?.intervalSeconds || 60,
    timeoutSeconds: monitor?.timeoutSeconds || 10,
    expectedStatus: monitor?.expectedStatus || 200,
    expectedBody: monitor?.expectedBody || ""
  });
  const [nameTouched, setNameTouched] = useState(Boolean(monitor?.name));

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateUrl(value) {
    setForm((current) => ({
      ...current,
      url: value,
      name: nameTouched ? current.name : value
    }));
  }

  function updateName(value) {
    setNameTouched(true);
    update("name", value);
  }

  function addTag() {
    const tag = form.tagDraft.trim();
    if (!tag || form.tags.includes(tag)) return;
    setForm((current) => ({
      ...current,
      tags: [...current.tags, tag],
      tagDraft: ""
    }));
  }

  function removeTag(tag) {
    setForm((current) => ({
      ...current,
      tags: current.tags.filter((item) => item !== tag)
    }));
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="modal"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          const draft = form.tagDraft.trim();
          const payload = {
            ...form,
            tags: draft && !form.tags.includes(draft)
              ? [...form.tags, draft]
              : form.tags
          };
          delete payload.tagDraft;
          if (!payload.authPassword) delete payload.authPassword;
          onSave(payload);
        }}
      >
        <h2>{monitor ? "Edit monitor" : "New monitor"}</h2>
        <label>
          URL <span className="required">required</span>
          <input
            autoFocus
            placeholder="https://example.com"
            value={form.url}
            onChange={(e) => updateUrl(e.target.value)}
            required
          />
        </label>
        <label>
          Name
          <input value={form.name} onChange={(e) => updateName(e.target.value)} required />
        </label>
        <label>
          Tags
          <div className="tag-input">
            {form.tags.map((tag) => (
              <button type="button" key={tag} onClick={() => removeTag(tag)}>
                {tag}<span aria-hidden="true">x</span>
              </button>
            ))}
            <input
              placeholder="Add tag and press Enter"
              value={form.tagDraft}
              onChange={(e) => update("tagDraft", e.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addTag();
                }
              }}
            />
          </div>
        </label>
        <div className="field-grid auth-grid">
          <label>
            Login username
            <input
              autoComplete="username"
              value={form.authUsername}
              onChange={(e) => update("authUsername", e.target.value)}
            />
          </label>
          <label>
            Login password
            <input
              autoComplete="new-password"
              placeholder={monitor?.hasAuth ? "Saved; type to replace" : ""}
              type="password"
              value={form.authPassword}
              onChange={(e) => update("authPassword", e.target.value)}
            />
          </label>
        </div>
        <div className="field-grid">
          <label>
            Interval
            <select
              value={form.intervalSeconds}
              onChange={(e) => update("intervalSeconds", Number(e.target.value))}
            >
              <option value={60}>1 min</option>
              <option value={300}>5 min</option>
              <option value={900}>15 min</option>
              <option value={3600}>1 hour</option>
            </select>
          </label>
          <label>
            Timeout
            <input
              type="number"
              min="1"
              value={form.timeoutSeconds}
              onChange={(e) => update("timeoutSeconds", Number(e.target.value))}
            />
          </label>
          <label>
            Expected status
            <input
              type="number"
              min="100"
              max="599"
              value={form.expectedStatus}
              onChange={(e) => update("expectedStatus", Number(e.target.value))}
            />
          </label>
        </div>
        <label>
          Expected response body
          <textarea
            placeholder="Optional text that must be present in the response"
            value={form.expectedBody}
            onChange={(e) => update("expectedBody", e.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary">Save</button>
        </div>
      </form>
    </div>
  );
}

function Dashboard({ openDetail }) {
  const [monitors, setMonitors] = useState([]);
  const [summary, setSummary] = useState(null);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState(null);

  async function load() {
    setRefreshing(true);
    try {
      const [monitorRows, summaryRow] = await Promise.all([api.monitors(), api.summary()]);
      setMonitors(monitorRows);
      setSummary(summaryRow);
      setLoading(false);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  const filtered = useMemo(
    () =>
      monitors.filter((monitor) =>
        `${monitor.name} ${monitor.url}`.toLowerCase().includes(filter.toLowerCase())
      ),
    [monitors, filter]
  );

  async function saveMonitor(data) {
    if (editing?.id) await api.updateMonitor(editing.id, data);
    else {
      await api.createMonitor(data);
      setToast({ message: "Monitor created" });
      setTimeout(() => setToast(null), 3200);
    }
    setEditing(null);
    await load();
  }

  async function togglePause(monitor) {
    await api.updateMonitor(monitor.id, { isPaused: !monitor.isPaused });
    await load();
  }

  return (
    <section className="page">
      <div className="page-header">
        <h1>Monitors<span>.</span></h1>
        <button className="primary" onClick={() => setEditing({})}><Plus size={18} />New</button>
      </div>
      <div className="content-grid">
        <div>
          <div className="toolbar">
            <div className="search"><Search size={18} /><input placeholder="Search by name or URL" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
            <button className="ghost" onClick={load} disabled={refreshing}>
              <RefreshCw className={refreshing ? "spin" : ""} size={18} />Refresh
            </button>
          </div>
          <div className="monitor-list">
            {loading && <div className="empty">Loading monitors...</div>}
            {!loading && filtered.length === 0 && <div className="empty">No monitors yet.</div>}
            {filtered.map((monitor) => (
              <article className="monitor-row" key={monitor.id}>
                <button className={`round ${monitor.status}`} onClick={() => openDetail(monitor.id)}>
                  {monitor.status === "paused" ? <PauseCircle size={18} /> : <Activity size={18} />}
                </button>
                <button className="row-main" data-url={monitor.url} onClick={() => openDetail(monitor.id)}>
                  <strong>{monitor.name}</strong>
                  <span>HTTP · {monitor.status === "paused" ? "Paused" : `Last check ${timeAgo(monitor.lastCheckedAt)}`}</span>
                  <span className="tag-row">
                    <em>{monitor.intervalSeconds / 60} min</em>
                    {monitor.tags?.slice(0, 3).map((tag) => <em key={tag}>{tag}</em>)}
                  </span>
                </button>
                <Sparkline checks={monitor.recentChecks || []} />
                <span className="uptime">{pct(recentUptime(monitor.recentChecks, monitor.stats.uptimePct))}</span>
                <button className="icon" onClick={() => togglePause(monitor)} title="Pause or resume">
                  {monitor.isPaused ? <PlayCircle size={18} /> : <PauseCircle size={18} />}
                </button>
                <button className="icon" onClick={() => setEditing(monitor)} title="Edit monitor">
                  <Edit3 size={18} />
                </button>
              </article>
            ))}
          </div>
        </div>
        <aside className="right-rail">
          <div className="panel">
            <h2>Current status<span>.</span></h2>
            <div className="status-ring"><Gauge size={28} /></div>
            <div className="mini-stats">
              <b>{summary?.monitors.down ?? 0}<small>Down</small></b>
              <b>{summary?.monitors.up ?? 0}<small>Up</small></b>
              <b>{summary?.monitors.paused ?? 0}<small>Paused</small></b>
            </div>
          </div>
          <div className="panel">
            <h2>Last 24 hours<span>.</span></h2>
            <div className="two-stats">
              <b>{pct(summary?.last24h.uptimePct ?? 100)}<small>Overall uptime</small></b>
              <b>{summary?.last24h.incidents ?? 0}<small>Incidents</small></b>
            </div>
          </div>
        </aside>
      </div>
      {editing && <MonitorForm monitor={editing.id ? editing : null} onClose={() => setEditing(null)} onSave={saveMonitor} />}
      {toast && <div className="toast" role="status">{toast.message}</div>}
    </section>
  );
}

function MonitorDetail({ id, back }) {
  const [monitor, setMonitor] = useState(null);
  const [editing, setEditing] = useState(null);
  const [selectedRange, setSelectedRange] = useState(null);
  const [toast, setToast] = useState(null);
  const [sendingEmail, setSendingEmail] = useState(false);

  async function load() {
    setMonitor(await api.monitor(id));
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [id]);

  if (!monitor) return <section className="page"><div className="empty">Loading monitor...</div></section>;

  async function save(data) {
    await api.updateMonitor(id, data);
    setEditing(null);
    await load();
  }

  async function sendTestNotification() {
    setSendingEmail(true);
    try {
      await api.testEmail(id);
      setToast({ message: "Test email sent" });
    } catch (error) {
      setToast({ message: error.message });
    } finally {
      setSendingEmail(false);
      setTimeout(() => setToast(null), 4200);
    }
  }

  return (
    <section className="page">
      <button className="back" onClick={back}><ChevronLeft size={18} />Monitoring</button>
      <div className="detail-head">
        <div className={`big-state ${monitor.status}`}><Activity size={24} /></div>
        <div>
          <h1>{monitor.name}<span>.</span></h1>
          <p>HTTP/S monitor for <a href={monitor.url}>{monitor.url}</a></p>
          {monitor.tags?.length > 0 && (
            <div className="tag-row detail-tags">
              {monitor.tags.map((tag) => <em key={tag}>{tag}</em>)}
            </div>
          )}
        </div>
        <div className="detail-actions">
          <button className="ghost" onClick={sendTestNotification} disabled={sendingEmail}>
            {sendingEmail ? "Sending..." : "Test email"}
          </button>
          <button className="ghost" onClick={() => api.updateMonitor(id, { isPaused: !monitor.isPaused }).then(load)}>
            {monitor.isPaused ? <PlayCircle size={18} /> : <PauseCircle size={18} />}{monitor.isPaused ? "Resume" : "Pause"}
          </button>
          <button className="ghost" onClick={() => setEditing(monitor)}><Edit3 size={18} />Edit</button>
        </div>
      </div>
      <div className="metric-grid">
        <div className="panel"><h2>Current status</h2><strong className={monitor.status}>{monitor.status}</strong><p>{currentStatusDuration(monitor)}</p></div>
        <div className="panel"><h2>Last check</h2><strong>{timeAgo(monitor.lastCheckedAt)}</strong><p>Checked every {monitor.intervalSeconds / 60} min</p></div>
        <div className="panel"><h2>Response times</h2><div className="triple"><b>{ms(monitor.stats.min)}<small>Min</small></b><b>{ms(monitor.stats.avg)}<small>Average</small></b><b>{ms(monitor.stats.max)}<small>Maximum</small></b></div></div>
      </div>
      <UptimeSummaryPanel monitor={monitor} onRangeChange={setSelectedRange} />
      <ResponseTimeChart monitor={monitor} customRange={selectedRange} />
      <div className="panel">
        <h2>Latest incidents<span>.</span></h2>
        <IncidentTable incidents={monitor.incidents} compact />
      </div>
      {editing && <MonitorForm monitor={editing} onClose={() => setEditing(null)} onSave={save} />}
      {toast && <div className="toast" role="status">{toast.message}</div>}
    </section>
  );
}

function IncidentTable({ incidents, compact = false }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Status</th>
            {!compact && <th>Monitor</th>}
            <th>Error</th>
            <th>Started</th>
            <th>Resolved</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          {incidents.length === 0 && (
            <tr><td colSpan={compact ? 5 : 6} className="empty-cell">No incidents recorded.</td></tr>
          )}
          {incidents.map((incident) => (
            <tr key={incident.id}>
              <td data-label="Status"><span className={`incident ${incident.status}`}>{incident.status === "resolved" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}{incident.status}</span></td>
              {!compact && <td data-label="Monitor"><strong>{incident.monitor_name}</strong><small>{incident.monitor_url}</small></td>}
              <td data-label="Error"><span className="code">{incident.status_code || "ERR"}</span> {incident.error || incident.root_cause || "Check failed"}</td>
              <td data-label="Started">{dateTime(incident.started_at)}</td>
              <td data-label="Resolved">{incident.resolved_at ? dateTime(incident.resolved_at) : "Open"}</td>
              <td data-label="Duration">{duration(incident.started_at, incident.resolved_at || new Date())}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IncidentsPage() {
  const [incidents, setIncidents] = useState([]);
  const [filter, setFilter] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    try {
      setIncidents(await api.incidents());
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  const filtered = incidents.filter((incident) =>
    `${incident.monitor_name} ${incident.monitor_url} ${incident.error || incident.root_cause}`.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <section className="page">
      <div className="page-header">
        <h1>Incidents<span>.</span></h1>
        <button className="ghost" onClick={load} disabled={refreshing}>
          <RefreshCw className={refreshing ? "spin" : ""} size={18} />Refresh
        </button>
      </div>
      <div className="toolbar">
        <div className="search"><Search size={18} /><input placeholder="Search by name or URL" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
      </div>
      <div className="notice"><AlertTriangle size={20} /><div><strong>Latest incidents</strong><p>Downtime events are created automatically and resolved when checks recover.</p></div></div>
      <IncidentTable incidents={filtered} />
    </section>
  );
}

function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const credentials = btoa(`${username}:${password}`);
    localStorage.setItem("app_credentials", credentials);
    try {
      await api.summary();
      onLogin();
    } catch (err) {
      setError("Invalid credentials. Please try again.");
      localStorage.removeItem("app_credentials");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-box" onSubmit={handleSubmit}>
        <div className="brand"><span />UptimeMonitor</div>
        <h2>Welcome back</h2>
        <p className="login-sub">Please sign in to continue.</p>
        {error && <div className="login-error">{error}</div>}
        <label>
          Username (optional)
          <input 
            autoComplete="username"
            value={username} 
            onChange={(e) => setUsername(e.target.value)} 
          />
        </label>
        <label>
          Password
          <input 
            autoComplete="current-password"
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required 
            autoFocus
          />
        </label>
        <button type="submit" className="primary" disabled={loading}>
          {loading ? "Verifying..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export function App() {
  const [page, setPage] = useState("monitors");
  const [detailId, setDetailId] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(true);

  useEffect(() => {
    function handleAuthRequired() {
      setIsAuthenticated(false);
    }
    window.addEventListener("auth:required", handleAuthRequired);
    return () => window.removeEventListener("auth:required", handleAuthRequired);
  }, []);

  if (!isAuthenticated) {
    return <Login onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <Shell page={page} setPage={(next) => { setDetailId(null); setPage(next); }}>
      {detailId ? (
        <MonitorDetail id={detailId} back={() => setDetailId(null)} />
      ) : page === "incidents" ? (
        <IncidentsPage />
      ) : (
        <Dashboard openDetail={setDetailId} />
      )}
    </Shell>
  );
}
