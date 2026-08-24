// O.R.M.S. — Reports data, backed by the real API (GET /api/reports/staff/).
// Replaces the previous randomly-generated 28-week mock dataset. The rest
// of the dashboard/list/detail code was written assuming a synchronously-
// available array, so this loads once per page into a cache — call
// `await ensureReportsLoaded()` before using liveReports()/getReportById().

const REPORT_STATUS_TO_LABEL = {
  submitted: "New Submission",
  in_process: "In Process",
  resolved: "Resolved",
  with_remarks: "With Remarks",
};
const REPORT_LABEL_TO_STATUS = {
  "New Submission": "submitted",
  "In Process": "in_process",
  Resolved: "resolved",
  "With Remarks": "with_remarks",
};

let _reportsCache = null;

// Reports store the exact ordinance text the citizen picked (see
// file-report.js) — that's matched back against liveOrdinances()
// (ordinances-data.js) to get its category. Report.ordinance stays free
// text rather than a foreign key, since a report should keep showing what
// ordinance it cited even if that ordinance is later edited or removed.
// Callers must await ensureOrdinancesLoaded() before ensureReportsLoaded().
function categoryForOrdinance(ordinanceText) {
  const match = liveOrdinances().find((o) => `${o.number} — ${o.title}` === ordinanceText);
  return match ? match.category : "Other";
}

function mapReport(r) {
  return {
    id: r.id,
    incidentType: r.ordinance, // closest real analog to the old mock "category" — Ordinances aren't a separate model yet
    ordinance: r.ordinance,
    category: categoryForOrdinance(r.ordinance),
    location: r.location,
    reporter: r.reporter,
    contactNumber: r.contact_number,
    natureOfViolation: r.nature_of_violation,
    status: REPORT_STATUS_TO_LABEL[r.status] || r.status,
    remarks: r.remarks,
    dateSubmitted: new Date(r.created_at),
    incidentDate: r.incident_date,
    incidentTimeRaw: r.incident_time,
    attachments: r.attachments,
  };
}

async function ensureReportsLoaded() {
  if (_reportsCache) return _reportsCache;
  const response = await authFetch("/api/reports/staff/");
  if (!response.ok) throw new Error("Could not load reports.");
  const data = await response.json();
  _reportsCache = data.map(mapReport);
  return _reportsCache;
}

function liveReports() {
  return _reportsCache || [];
}

function getReportById(id) {
  return (_reportsCache || []).find((r) => r.id === id) || null;
}

// Refetches just the one report and patches it into the cache — used after
// a status/remarks save so the dashboard/list reflect it without a full reload.
async function refreshReportInCache(id) {
  const response = await authFetch(`/api/reports/staff/${encodeURIComponent(id)}/`);
  if (!response.ok) throw new Error("Could not reload this report.");
  const updated = mapReport(await response.json());
  if (_reportsCache) {
    const idx = _reportsCache.findIndex((r) => r.id === id);
    if (idx !== -1) _reportsCache[idx] = updated;
  }
  return updated;
}

// patch: { status?: <display label>, remarks?: <string> }
async function updateReportStatus(id, patch) {
  const body = {};
  if (patch.status !== undefined) body.status = REPORT_LABEL_TO_STATUS[patch.status] || patch.status;
  if (patch.remarks !== undefined) body.remarks = patch.remarks;

  const response = await authFetch(`/api/reports/staff/${encodeURIComponent(id)}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const firstError = Object.values(data)[0];
    throw new Error(Array.isArray(firstError) ? firstError[0] : "Could not update this report.");
  }
  return refreshReportInCache(id);
}

// ---- Date/period helpers — kept from the old mock generator, since
// filtering real created_at timestamps by week/month is still legitimate,
// just no longer feeding fabricated numbers. ----

function formatReportDate(date) {
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

const THIS_WEEK_START = startOfWeek(new Date());

function getWeekRange(offset) {
  const start = addDays(THIS_WEEK_START, -7 * offset);
  const end = addDays(start, 6);
  return { start, end, label: `${formatReportDate(start)} - ${formatReportDate(end)}` };
}

function getMonthRange(monthsBack) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 0);
  return { start, end };
}

function getReportsForWeekOffset(offset) {
  const { start, end } = getWeekRange(offset);
  const endDate = endOfDay(end);
  return liveReports().filter((r) => r.dateSubmitted >= start && r.dateSubmitted <= endDate);
}

function getReportsForPeriod(periodValue) {
  if (periodValue === "all") return liveReports();
  if (periodValue === "week") return getReportsForWeekOffset(0);
  if (periodValue.startsWith("week")) return getReportsForWeekOffset(Number(periodValue.slice(4)));
  const monthsBack = Number(periodValue.replace("month", ""));
  const { start, end } = getMonthRange(monthsBack);
  const endDate = endOfDay(end);
  return liveReports().filter((r) => r.dateSubmitted >= start && r.dateSubmitted <= endDate);
}
