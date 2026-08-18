// O.R.M.S. — mock report records for the Staff Reports Dashboard (no backend wired up yet).
// Records are generated relative to today so the dashboard always has data to show
// for "this week" and the preceding weeks/months.

const INCIDENT_TYPES = [
  { name: "Public Drinking", color: "#e88ea0" },
  { name: "Noise Disturbance", color: "#6c7ae0" },
  { name: "Curfew for Minors", color: "#8fd19e" },
  { name: "Shirtless Loitering", color: "#f2c94c" },
  { name: "Others", color: "#9e9e9e" },
];

const LOCATIONS = [
  "Alberta Street", "Tapsilog Street", "Lucky Me Street", "Motorcentral Street",
  "Sto. Tomas Road", "Zapote Street", "Mabuhay Street", "Rizal Street",
  "Bonifacio Street", "Sampaguita Street", "Ilang-Ilang Street", "Purok 3",
];

const REPORTERS = [
  "John Cena", "Maria Santos", "Pedro Reyes", "Ana Cruz", "Carlo Mendoza",
  "Liza Ramos", "Ferdinand Tan", "Grace Villanueva", "Ronnie Bautista", "Corazon Dizon",
];

const STATUSES = ["New Submission", "In Process", "Resolved", "With Remarks"];
const SEVERITIES = ["low", "moderate", "high", "critical"];

const ORDINANCE_BY_TYPE = {
  "Public Drinking": "Anti-Public Drinking and Disorderly Conduct",
  "Noise Disturbance": "Noise Nuisance and Noise Pollution",
  "Curfew for Minors": "Minor Curfew Ordinance",
  "Shirtless Loitering": "Public Decency and Attire Ordinance",
  Others: "General Peace and Order Ordinance",
};

const NATURE_TEMPLATES = {
  "Public Drinking": (loc) => `Residents reported a group drinking alcohol in public near ${loc}, causing disturbance to nearby households.`,
  "Noise Disturbance": (loc) => `Loud noise (videoke/music) was reported coming from ${loc} late into the night.`,
  "Curfew for Minors": (loc) => `Minors were seen loitering past curfew hours near ${loc}.`,
  "Shirtless Loitering": (loc) => `An individual was seen shirtless and loitering in a public area near ${loc}, violating the barangay's public decency ordinance.`,
  Others: (loc) => `A miscellaneous ordinance violation was reported near ${loc}.`,
};

// Small seeded PRNG (mulberry32) so the mock data is stable within a day
// instead of reshuffling on every render.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Monday-based start of the week containing `date`.
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

const WEEKS_OF_HISTORY = 28;
const THIS_WEEK_START = startOfWeek(new Date());

const REPORTS = (function generateReports() {
  const rows = [];
  let seq = 1;

  for (let w = WEEKS_OF_HISTORY - 1; w >= 0; w--) {
    const weekStart = addDays(THIS_WEEK_START, -7 * w);
    const rng = mulberry32(Number(`${weekStart.getFullYear()}${weekStart.getMonth()}${weekStart.getDate()}`));
    const daysInWeek = w === 0 ? Math.min(7, new Date().getDay() === 0 ? 7 : new Date().getDay()) : 7;
    const count = 24 + Math.floor(rng() * 20);

    for (let i = 0; i < count; i++) {
      const dayOffset = Math.floor(rng() * daysInWeek);
      const date = addDays(weekStart, dayOffset);
      date.setHours(7 + Math.floor(rng() * 15), Math.floor(rng() * 60), 0, 0);
      const incidentType = pick(rng, INCIDENT_TYPES);

      const location = pick(rng, LOCATIONS);
      const contactNumber = `09${String(Math.floor(rng() * 1e9)).padStart(9, "0")}`;

      rows.push({
        id: `RP-${weekStart.getFullYear()}-${String(seq).padStart(5, "0")}`,
        incidentType: incidentType.name,
        incidentColor: incidentType.color,
        location,
        reporter: pick(rng, REPORTERS),
        contactNumber,
        ordinance: ORDINANCE_BY_TYPE[incidentType.name],
        natureOfViolation: NATURE_TEMPLATES[incidentType.name](location),
        status: pick(rng, STATUSES),
        severity: pick(rng, SEVERITIES),
        dateSubmitted: date,
      });
      seq++;
    }
  }

  // Newest first.
  return rows.sort((a, b) => b.dateSubmitted - a.dateSubmitted);
})();

// ---- Shared date/period helpers (used by the dashboard and the reports list) ----

function formatReportDate(date) {
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

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

// ---- Status/remarks edits (staff-side, kept in localStorage since there's no
// backend — edits made on the report detail page show up everywhere else). ----

const REPORT_OVERRIDES_KEY = "orms_report_overrides";

function getReportOverrides() {
  try {
    return JSON.parse(localStorage.getItem(REPORT_OVERRIDES_KEY)) || {};
  } catch {
    return {};
  }
}

function saveReportOverride(id, patch) {
  const overrides = getReportOverrides();
  overrides[id] = { ...overrides[id], ...patch };
  localStorage.setItem(REPORT_OVERRIDES_KEY, JSON.stringify(overrides));
}

// Reports with any staff edits (status/remarks) merged in.
function liveReports() {
  const overrides = getReportOverrides();
  if (!Object.keys(overrides).length) return REPORTS;
  return REPORTS.map((r) => (overrides[r.id] ? { ...r, ...overrides[r.id] } : r));
}

function getReportById(id) {
  const overrides = getReportOverrides();
  const report = REPORTS.find((r) => r.id === id);
  if (!report) return null;
  return overrides[id] ? { ...report, ...overrides[id] } : report;
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
