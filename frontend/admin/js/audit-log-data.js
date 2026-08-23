// O.R.M.S. — View Audit Logs data, backed by the real API.
// Used to return a hardcoded AUDIT_LOGS array; now fetches from
// GET /api/auth/admin/audit-logs/ (see AuditLogSerializer) — one row per
// login, closed out with a logged-off time once that user logs out.

const AUDIT_API_BASE = "/api/auth/admin";

async function getAuditLogs() {
  const response = await authFetch(`${AUDIT_API_BASE}/audit-logs/`);
  if (!response.ok) {
    throw new Error("Could not load audit logs. Try refreshing the page.");
  }
  return response.json();
}
