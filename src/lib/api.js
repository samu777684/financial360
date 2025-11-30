// src/lib/api.js
const API_BASE = import.meta.env.DEV
  ? "http://localhost:3001"           // Desarrollo
  : "https://financial360.online";    // Producción (¡importante! con https)

export const api = {
  base: API_BASE,
  get: (endpoint) => fetch(`${API_BASE}${endpoint}`, { credentials: "include" }).then(r => r.json()),
  post: (endpoint, data) => fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  }).then(r => r.json()),
};