// O.R.M.S. — placeholder session records for the admin "View Audit Logs" page.

function auditTimestamp(y, m, d, h, min, s) {
  const date = new Date(y, m - 1, d, h, min, s);
  const pad = (n) => String(n).padStart(2, "0");
  return {
    date,
    label: `${pad(h)}:${pad(min)}:${pad(s)} ${pad(m)}/${pad(d)}/${y}`,
  };
}

const AUDIT_LOGS = [
  { id: "000001", owner: "Juan Dela Cruz", type: "Administrator", loggedOn: auditTimestamp(2026, 7, 30, 8, 15, 2), loggedOff: auditTimestamp(2026, 7, 30, 17, 42, 10) },
  { id: "000002", owner: "Juan Dela Cruz", type: "Administrator", loggedOn: auditTimestamp(2026, 7, 29, 9, 5, 44), loggedOff: auditTimestamp(2026, 7, 29, 18, 20, 0) },
  { id: "000003", owner: "Juan Dela Cruz", type: "Barangay Captain", loggedOn: auditTimestamp(2026, 7, 30, 7, 50, 30), loggedOff: auditTimestamp(2026, 7, 30, 16, 10, 5) },
  { id: "000004", owner: "Juan Dela Cruz", type: "Secretary", loggedOn: auditTimestamp(2026, 7, 30, 8, 0, 0), loggedOff: auditTimestamp(2026, 7, 30, 17, 0, 0) },
  { id: "000005", owner: "Juan Dela Cruz", type: "Investigator", loggedOn: auditTimestamp(2026, 7, 28, 13, 25, 12), loggedOff: auditTimestamp(2026, 7, 28, 20, 5, 50) },
  { id: "000006", owner: "Juan Dela Cruz", type: "Investigator", loggedOn: auditTimestamp(2026, 7, 30, 9, 30, 0), loggedOff: auditTimestamp(2026, 7, 30, 18, 45, 22) },
  { id: "000007", owner: "Juan Dela Cruz", type: "Investigator", loggedOn: auditTimestamp(2026, 7, 27, 10, 10, 10), loggedOff: auditTimestamp(2026, 7, 27, 19, 15, 35) },
  { id: "000008", owner: "Juan Dela Cruz", type: "Barangay Citizen", loggedOn: auditTimestamp(2026, 7, 30, 11, 0, 0), loggedOff: auditTimestamp(2026, 7, 30, 14, 30, 0) },
  { id: "000009", owner: "Juan Dela Cruz", type: "Barangay Citizen", loggedOn: auditTimestamp(2026, 7, 26, 15, 45, 0), loggedOff: auditTimestamp(2026, 7, 26, 21, 0, 0) },
];
