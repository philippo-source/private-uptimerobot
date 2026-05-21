import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronLeft,
  Edit3,
  Gauge,
  LayoutDashboard,
  PauseCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2
} from "lucide-react";
import { api } from "./lib/api.js";
import { dateTime, duration, ms, pct, timeAgo } from "./lib/format.js";

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
  const bars = checks.length
    ? checks.slice(-30)
    : Array.from({ length: 30 }, () => ({ status: "pending" }));
  return (
    <div className="sparkline">
      {bars.map((check, index) => (
        <span
          key={index}
          className={check.status === "down" ? "bad" : check.status === "pending" ? "idle" : ""}
        />
      ))}
    </div>
  );
}

function MonitorForm({ monitor, onClose, onSave }) {
  const [form, setForm] = useState({
    name: monitor?.name || "",
    url: monitor?.url || "",
    tags: monitor?.tags?.join(", ") || "",
    authUsername: monitor?.authUsername || "",
    authPassword: "",
    intervalSeconds: monitor?.intervalSeconds || 60,
    timeoutSeconds: monitor?.timeoutSeconds || 10,
    expectedStatus: monitor?.expectedStatus || 200
  });

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={(event) => {
          event.preventDefault();
          const payload = {
            ...form,
            tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
          };
          if (!payload.authPassword) delete payload.authPassword;
          onSave(payload);
        }}
      >
        <h2>{monitor ? "Edit monitor" : "New monitor"}</h2>
        <label>
          Name
          <input value={form.name} onChange={(e) => update("name", e.target.value)} required />
        </label>
        <label>
          URL
          <input value={form.url} onChange={(e) => update("url", e.target.value)} required />
        </label>
        <label>
          Tags
          <input
            placeholder="api, production, customer"
            value={form.tags}
            onChange={(e) => update("tags", e.target.value)}
          />
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

  async function load() {
    const [monitorRows, summaryRow] = await Promise.all([api.monitors(), api.summary()]);
    setMonitors(monitorRows);
    setSummary(summaryRow);
    setLoading(false);
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
    else await api.createMonitor(data);
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
            <button className="ghost" onClick={load}><RefreshCw size={18} />Refresh</button>
          </div>
          <div className="monitor-list">
            {loading && <div className="empty">Loading monitors...</div>}
            {!loading && filtered.length === 0 && <div className="empty">No monitors yet.</div>}
            {filtered.map((monitor) => (
              <article className="monitor-row" key={monitor.id}>
                <button className={`round ${monitor.status}`} onClick={() => openDetail(monitor.id)}>
                  {monitor.status === "paused" ? <PauseCircle size={18} /> : <Activity size={18} />}
                </button>
                <button className="row-main" onClick={() => openDetail(monitor.id)}>
                  <strong>{monitor.name}</strong>
                  <span>HTTP · {monitor.status === "paused" ? "Paused" : `Last check ${timeAgo(monitor.lastCheckedAt)}`}</span>
                  {monitor.tags?.length > 0 && (
                    <span className="tag-row">
                      {monitor.tags.slice(0, 3).map((tag) => <em key={tag}>{tag}</em>)}
                    </span>
                  )}
                </button>
                <span className="interval">{monitor.intervalSeconds / 60} min</span>
                <Sparkline />
                <span className="uptime">{pct(monitor.stats.uptimePct)}</span>
                <button className="icon" onClick={() => togglePause(monitor)} title="Pause or resume">
                  <PauseCircle size={18} />
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
    </section>
  );
}

function MonitorDetail({ id, back }) {
  const [monitor, setMonitor] = useState(null);
  const [editing, setEditing] = useState(null);

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
          <button className="ghost" onClick={() => api.updateMonitor(id, { isPaused: !monitor.isPaused }).then(load)}>
            <PauseCircle size={18} />{monitor.isPaused ? "Resume" : "Pause"}
          </button>
          <button className="ghost" onClick={() => setEditing(monitor)}><Edit3 size={18} />Edit</button>
        </div>
      </div>
      <div className="metric-grid">
        <div className="panel"><h2>Current status</h2><strong className={monitor.status}>{monitor.status}</strong><p>{monitor.lastError || "Healthy checks are passing."}</p></div>
        <div className="panel"><h2>Last check</h2><strong>{timeAgo(monitor.lastCheckedAt)}</strong><p>Checked every {monitor.intervalSeconds / 60} min</p></div>
        <div className="panel"><h2>Response times</h2><div className="triple"><b>{ms(monitor.stats.min)}<small>Min</small></b><b>{ms(monitor.stats.avg)}<small>Average</small></b><b>{ms(monitor.stats.max)}<small>Maximum</small></b></div></div>
      </div>
      <div className="panel chart-panel">
        <div className="chart-head"><h2>Response time</h2><StatusPill status={monitor.status} /></div>
        <div className="chart">
          {monitor.checks.map((check, index) => (
            <span
              key={`${check.checked_at}-${index}`}
              className={check.status}
              style={{ height: `${Math.max(8, Math.min(96, (check.response_time_ms || 0) / 8))}px` }}
              title={`${ms(check.response_time_ms)} ${dateTime(check.checked_at)}`}
            />
          ))}
        </div>
      </div>
      <div className="panel">
        <h2>Latest incidents<span>.</span></h2>
        <IncidentTable incidents={monitor.incidents} compact />
      </div>
      {editing && <MonitorForm monitor={editing} onClose={() => setEditing(null)} onSave={save} />}
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
            <th>Root cause</th>
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
              <td><span className={`incident ${incident.status}`}>{incident.status === "resolved" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}{incident.status}</span></td>
              {!compact && <td><strong>{incident.monitor_name}</strong><small>{incident.monitor_url}</small></td>}
              <td><span className="code">{incident.status_code || "ERR"}</span> {incident.root_cause}</td>
              <td>{dateTime(incident.started_at)}</td>
              <td>{incident.resolved_at ? dateTime(incident.resolved_at) : "Open"}</td>
              <td>{duration(incident.started_at, incident.resolved_at || new Date())}</td>
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

  async function load() {
    setIncidents(await api.incidents());
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  const filtered = incidents.filter((incident) =>
    `${incident.monitor_name} ${incident.monitor_url} ${incident.root_cause}`.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <section className="page">
      <div className="page-header">
        <h1>Incidents<span>.</span></h1>
        <button className="ghost" onClick={load}><Bell size={18} />Refresh</button>
      </div>
      <div className="toolbar">
        <div className="search"><Search size={18} /><input placeholder="Search by name or URL" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
      </div>
      <div className="notice"><AlertTriangle size={20} /><div><strong>Latest incidents</strong><p>Downtime events are created automatically and resolved when checks recover.</p></div></div>
      <IncidentTable incidents={filtered} />
    </section>
  );
}

export function App() {
  const [page, setPage] = useState("monitors");
  const [detailId, setDetailId] = useState(null);

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
