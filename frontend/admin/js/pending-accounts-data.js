// O.R.M.S. — Approve Accounts data, backed by the real API.
// Used to return a hardcoded PENDING_ACCOUNTS array; now fetches from
// GET /api/auth/admin/verifications/ (see PendingVerificationSerializer),
// shaped to match what approve-accounts.js already expects (id/owner/
// email/type/photoUrl/created).

const ADMIN_API_BASE = "/api/auth/admin";

async function getPendingVerifications() {
  const response = await authFetch(`${ADMIN_API_BASE}/verifications/`);
  if (!response.ok) {
    throw new Error("Could not load pending accounts. Try refreshing the page.");
  }
  return response.json();
}

// Marks the account verified — it can log in immediately after this.
async function approveVerification(id) {
  const response = await authFetch(`${ADMIN_API_BASE}/verifications/${id}/approve/`, {
    method: "POST",
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || "Could not approve this account.");
  }
  return response.json();
}

// Deletes the pending account outright — see AdminRejectVerificationView's
// docstring for why (no email service to notify/let them resubmit yet).
async function rejectVerification(id) {
  const response = await authFetch(`${ADMIN_API_BASE}/verifications/${id}/reject/`, {
    method: "POST",
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || "Could not reject this account.");
  }
  return response.json();
}
