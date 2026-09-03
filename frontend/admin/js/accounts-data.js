// SafeSpace — Manage Accounts data, backed by the real API.
// This used to return a hardcoded ACCOUNTS array plus anything saved to
// localStorage by the Create Account form; it now fetches real accounts
// from GET /api/auth/admin/users/. The shape returned by that endpoint
// matches this file's old placeholder objects field-for-field (owner,
// type, active, lastActiveLabel, activityMinutes, created, updated), so
// manage-accounts.js and create-accounts.js didn't need to change how
// they read each account — only how this file fetches them.

const ADMIN_API_BASE = "/api/auth/admin";

// Fetches the live account list. Callers should await this and handle the
// case where it throws (e.g. token expired, network error) rather than
// assuming it always resolves.
async function getAllAccounts() {
  const response = await authFetch(`${ADMIN_API_BASE}/users/`);
  if (!response.ok) {
    throw new Error("Could not load accounts. Try refreshing the page.");
  }
  return response.json();
}

// Used by the "Disable/Enable User" button and "Update Role" popup —
// PATCHes just the changed fields for one account.
async function updateAccount(id, changes) {
  const response = await authFetch(`${ADMIN_API_BASE}/users/${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || "Could not update this account.");
  }
  return response.json();
}

// Backs the (currently disabled — no email service to actually deliver a
// reset link yet) "Reset Password" button. Left here, unused, for when
// that's wired up.
async function resetAccountPassword(id) {
  const response = await authFetch(`${ADMIN_API_BASE}/users/${id}/reset-password/`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Could not reset this account's password.");
  }
  return response.json();
}

// Used by the "Delete Account" button.
async function deleteAccount(id) {
  const response = await authFetch(`${ADMIN_API_BASE}/users/${id}/`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || "Could not delete this account.");
  }
}

// Used by the Create Account form's "Barangay Staff" account type — creates
// a Staff/Administrator account with just an email + role (see
// accounts/serializers.py's AdminCreateUserSerializer).
async function createAccount({ email, staffRole }) {
  const response = await authFetch(`${ADMIN_API_BASE}/create-user/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, staff_role: staffRole }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const firstError = Object.values(data)[0];
    throw new Error(Array.isArray(firstError) ? firstError[0] : "Could not create this account.");
  }
  return response.json();
}

// Used by the Create Account form's "Barangay Citizen" account type —
// creates a full, pre-verified citizen account right away (see
// accounts/serializers.py's AdminCreateCitizenSerializer).
async function createCitizenAccount({ email, password, firstName, lastName, contactNumber, address }) {
  const response = await authFetch(`${ADMIN_API_BASE}/create-citizen/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      first_name: firstName,
      last_name: lastName,
      contact_number: contactNumber,
      address,
    }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const firstError = Object.values(data)[0];
    throw new Error(Array.isArray(firstError) ? firstError[0] : "Could not create this account.");
  }
  return response.json();
}
