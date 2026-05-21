const API_URL = import.meta.env.VITE_API_URL || "";

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  const credentials = localStorage.getItem("app_credentials");
  if (credentials) {
    headers["Authorization"] = `Basic ${credentials}`;
  }

  const response = await fetch(`${API_URL}/api${path}`, {
    headers,
    ...options
  });

  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent("auth:required"));
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Request failed");
  }

  if (response.status === 204) return null;
  return response.json();
}

export const api = {
  summary: () => request("/summary"),
  monitors: () => request("/monitors"),
  monitor: (id) => request(`/monitors/${id}`),
  createMonitor: (data) =>
    request("/monitors", { method: "POST", body: JSON.stringify(data) }),
  updateMonitor: (id, data) =>
    request(`/monitors/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteMonitor: (id) => request(`/monitors/${id}`, { method: "DELETE" }),
  testEmail: (id) => request(`/monitors/${id}/test-email`, { method: "POST" }),
  emailStatus: () => request("/email/status"),
  incidents: () => request("/incidents")
};
