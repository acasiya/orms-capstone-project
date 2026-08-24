// O.R.M.S. — Concerns/Suggestions data, backed by the real API
// (GET /api/concerns/staff/). Replaces the previous randomly-generated
// mock dataset and its localStorage-based folder system — there's no
// backend concept of folders, so concerns/suggestions now just carry a
// plain Submitted/Resolved status + remarks, the same shape as Reports.

const CONCERN_STATUS_TO_LABEL = {
  submitted: "Submitted",
  resolved: "Resolved",
};
const CONCERN_LABEL_TO_STATUS = {
  Submitted: "submitted",
  Resolved: "resolved",
};

let _concernsCache = null;

function mapConcern(c) {
  return {
    id: c.id,
    location: c.location,
    reporter: c.reporter,
    contactNumber: c.contact_number,
    concernText: c.description,
    status: CONCERN_STATUS_TO_LABEL[c.status] || c.status,
    remarks: c.remarks,
    dateSubmitted: new Date(c.created_at),
    attachments: c.attachments,
  };
}

async function ensureConcernsLoaded() {
  if (_concernsCache) return _concernsCache;
  const response = await authFetch("/api/concerns/staff/");
  if (!response.ok) throw new Error("Could not load concerns/suggestions.");
  const data = await response.json();
  _concernsCache = data.map(mapConcern);
  return _concernsCache;
}

function liveConcerns() {
  return _concernsCache || [];
}

function getConcernById(id) {
  return (_concernsCache || []).find((c) => c.id === id) || null;
}

async function refreshConcernInCache(id) {
  const response = await authFetch(`/api/concerns/staff/${encodeURIComponent(id)}/`);
  if (!response.ok) throw new Error("Could not reload this concern/suggestion.");
  const updated = mapConcern(await response.json());
  if (_concernsCache) {
    const idx = _concernsCache.findIndex((c) => c.id === id);
    if (idx !== -1) _concernsCache[idx] = updated;
  }
  return updated;
}

// patch: { status?: <display label>, remarks?: <string> }
async function updateConcernStatus(id, patch) {
  const body = {};
  if (patch.status !== undefined) body.status = CONCERN_LABEL_TO_STATUS[patch.status] || patch.status;
  if (patch.remarks !== undefined) body.remarks = patch.remarks;

  const response = await authFetch(`/api/concerns/staff/${encodeURIComponent(id)}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const firstError = Object.values(data)[0];
    throw new Error(Array.isArray(firstError) ? firstError[0] : "Could not update this concern/suggestion.");
  }
  return refreshConcernInCache(id);
}

// ---- Date helpers (small local copies — see reports-data.js for the
// Reports Dashboard's equivalents; kept separate so the two pages don't
// have to load each other's dataset). ----

function formatConcernDate(date) {
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
  return { start, end, label: `${formatConcernDate(start)} - ${formatConcernDate(end)}` };
}

function getMonthRange(monthsBack) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 0);
  return { start, end };
}

function getConcernsForWeekOffset(offset) {
  const { start, end } = getWeekRange(offset);
  const endDate = endOfDay(end);
  return liveConcerns().filter((c) => c.dateSubmitted >= start && c.dateSubmitted <= endDate);
}

function getConcernsForPeriod(periodValue) {
  if (periodValue === "all") return liveConcerns();
  if (periodValue === "week") return getConcernsForWeekOffset(0);
  if (periodValue.startsWith("week")) return getConcernsForWeekOffset(Number(periodValue.slice(4)));
  const monthsBack = Number(periodValue.replace("month", ""));
  const { start, end } = getMonthRange(monthsBack);
  const endDate = endOfDay(end);
  return liveConcerns().filter((c) => c.dateSubmitted >= start && c.dateSubmitted <= endDate);
}
