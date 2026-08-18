// O.R.M.S. — mock concern/suggestion records for the Staff Concerns/Suggestions
// Dashboard (no backend wired up yet). Self-contained (doesn't load
// reports-data.js) so this page only pulls in what it actually needs.

const CONCERN_CATEGORIES = [
  { name: "No Vaping in Public", color: "#5b7fd1" },
  { name: "No Construction after 10 PM", color: "#2fd6c4" },
  { name: "No Roadside Parking", color: "#d13ec4" },
];

const CONCERN_LOCATIONS = [
  "First Street", "Katipunan Street", "Sunflower Street", "Kaliwang Street", "Sampaguita Street",
  "Rizal Street", "Bonifacio Street", "Mabuhay Street", "Zapote Street", "Ilang-Ilang Street",
];

const CONCERN_REPORTERS = [
  "Rene Baterbonia", "Jessika Sojo", "Mike Enriko", "Judy Ann Sta Teresa", "Paolo Pascual",
  "Liza Ramos", "Carlo Mendoza", "Ana Cruz", "Ferdinand Tan", "Grace Villanueva",
];

const CONCERN_STATUSES = ["New Submission", "In Folder"];

const CONCERN_NARRATIVE_TEMPLATES = {
  "No Vaping in Public": (loc) =>
    `Please create an ordinance to fix the vaping problem near ${loc}, my children are playing outside and there are people vaping I am worried about them getting second hand smoke.`,
  "No Construction after 10 PM": (loc) =>
    `There is ongoing construction work near ${loc} that continues past 10 PM, disturbing residents trying to sleep. Please regulate construction hours.`,
  "No Roadside Parking": (loc) =>
    `Vehicles are parked along ${loc} blocking the road and making it hard for others to pass. Please implement no-parking rules here.`,
};

function narrativeForCategory(category, loc) {
  return CONCERN_NARRATIVE_TEMPLATES[category]
    ? CONCERN_NARRATIVE_TEMPLATES[category](loc)
    : `A suggestion/concern regarding "${category}" was submitted near ${loc}.`;
}

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

const CONCERN_WEEKS_OF_HISTORY = 28;
const THIS_WEEK_START = startOfWeek(new Date());

const CONCERNS = (function generateConcerns() {
  const rows = [];
  let seq = 1;

  for (let w = CONCERN_WEEKS_OF_HISTORY - 1; w >= 0; w--) {
    const weekStart = addDays(THIS_WEEK_START, -7 * w);
    // Salted differently from the reports dataset's seed so the two mock
    // datasets don't happen to line up week-for-week.
    const rng = mulberry32(Number(`${weekStart.getFullYear()}${weekStart.getMonth()}${weekStart.getDate()}7`));
    const daysInWeek = w === 0 ? (new Date().getDay() === 0 ? 7 : new Date().getDay()) : 7;
    const count = 6 + Math.floor(rng() * 10);

    for (let i = 0; i < count; i++) {
      const dayOffset = Math.floor(rng() * daysInWeek);
      const date = addDays(weekStart, dayOffset);
      date.setHours(7 + Math.floor(rng() * 15), Math.floor(rng() * 60), 0, 0);
      const category = pick(rng, CONCERN_CATEGORIES);
      const status = pick(rng, CONCERN_STATUSES);
      const location = pick(rng, CONCERN_LOCATIONS);
      const contactNumber = `09${String(Math.floor(rng() * 1e9)).padStart(9, "0")}`;

      rows.push({
        id: `CS-${weekStart.getFullYear()}-${String(seq).padStart(5, "0")}`,
        category: category.name,
        categoryColor: category.color,
        folder: status === "In Folder" ? category.name : "-",
        location,
        reporter: pick(rng, CONCERN_REPORTERS),
        contactNumber,
        concernText: narrativeForCategory(category.name, location),
        remarks: "",
        status,
        dateSubmitted: date,
      });
      seq++;
    }
  }

  // Newest first.
  return rows.sort((a, b) => b.dateSubmitted - a.dateSubmitted);
})();

// ---- Date/period helpers (small local copies — see reports-data.js for the
// Reports Dashboard's equivalents; kept separate so the two pages don't have
// to load each other's dataset). ----

function formatConcernDate(date) {
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
  return { start, end, label: `${formatConcernDate(start)} - ${formatConcernDate(end)}` };
}

function getMonthRange(monthsBack) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 0);
  return { start, end };
}

// ---- Folder management (create/rename/delete), kept in localStorage since
// there's no backend. This is the single source of truth for which folders
// exist; CONCERN_CATEGORIES only seeds it the first time a page loads. ----

const FOLDERS_LIST_KEY = "orms_folders_list";
const FOLDER_RENAMES_KEY = "orms_folder_renames";
const FOLDER_DELETES_KEY = "orms_folder_deletes";
const CONCERN_OVERRIDES_KEY = "orms_concern_overrides";

function getFoldersList() {
  try {
    const stored = JSON.parse(localStorage.getItem(FOLDERS_LIST_KEY));
    if (Array.isArray(stored)) return stored;
  } catch {
    // fall through to seeding
  }
  const seeded = CONCERN_CATEGORIES.map((c) => c.name);
  localStorage.setItem(FOLDERS_LIST_KEY, JSON.stringify(seeded));
  return seeded;
}

function saveFoldersList(list) {
  localStorage.setItem(FOLDERS_LIST_KEY, JSON.stringify(list));
}

function getFolderRenames() {
  try {
    return JSON.parse(localStorage.getItem(FOLDER_RENAMES_KEY)) || {};
  } catch {
    return {};
  }
}

function getFolderDeletes() {
  try {
    return JSON.parse(localStorage.getItem(FOLDER_DELETES_KEY)) || [];
  } catch {
    return [];
  }
}

// Follows the rename chain (a folder can be renamed more than once) to the
// current name.
function resolveFolderName(name) {
  const renames = getFolderRenames();
  let current = name;
  const seen = new Set();
  while (renames[current] && !seen.has(current)) {
    seen.add(current);
    current = renames[current];
  }
  return current;
}

function addFolder(name) {
  const list = getFoldersList();
  if (list.some((n) => n.toLowerCase() === name.toLowerCase())) return false;
  list.push(name);
  saveFoldersList(list);
  return true;
}

function renameFolder(oldName, newName) {
  saveFoldersList(getFoldersList().map((n) => (n === oldName ? newName : n)));
  const renames = getFolderRenames();
  renames[oldName] = newName;
  localStorage.setItem(FOLDER_RENAMES_KEY, JSON.stringify(renames));
}

function deleteFolder(name) {
  saveFoldersList(getFoldersList().filter((n) => n !== name));
  const deletes = getFolderDeletes();
  if (!deletes.includes(name)) {
    deletes.push(name);
    localStorage.setItem(FOLDER_DELETES_KEY, JSON.stringify(deletes));
  }
}

// Applies rename/delete history to the freshly-generated CONCERNS (and any
// per-concern overrides saved from the detail page) so folder edits made on
// one page are reflected everywhere, every load — and immediately, if called
// again right after a rename/delete within the same page session.
function normalizeConcernFolders() {
  const deletes = getFolderDeletes();

  CONCERNS.forEach((c) => {
    if (c.folder === "-") return;
    const resolved = resolveFolderName(c.folder);
    if (deletes.includes(resolved)) {
      c.folder = "-";
      c.status = "New Submission";
    } else {
      c.folder = resolved;
      c.category = resolved;
    }
  });

  const overrides = getConcernOverrides();
  let overridesChanged = false;
  Object.values(overrides).forEach((o) => {
    if (!o.folder || o.folder === "-") return;
    const resolved = resolveFolderName(o.folder);
    if (deletes.includes(resolved)) {
      o.folder = "-";
      o.status = "New Submission";
      overridesChanged = true;
    } else if (o.folder !== resolved) {
      o.folder = resolved;
      o.status = "In Folder";
      overridesChanged = true;
    }
  });
  if (overridesChanged) localStorage.setItem(CONCERN_OVERRIDES_KEY, JSON.stringify(overrides));
}
normalizeConcernFolders();

// ---- Status/remarks/folder edits made on the concern detail page ----

function getConcernOverrides() {
  try {
    return JSON.parse(localStorage.getItem(CONCERN_OVERRIDES_KEY)) || {};
  } catch {
    return {};
  }
}

function saveConcernOverride(id, patch) {
  const overrides = getConcernOverrides();
  overrides[id] = { ...overrides[id], ...patch };
  localStorage.setItem(CONCERN_OVERRIDES_KEY, JSON.stringify(overrides));
}

function liveConcerns() {
  const overrides = getConcernOverrides();
  if (!Object.keys(overrides).length) return CONCERNS;
  return CONCERNS.map((c) => (overrides[c.id] ? { ...c, ...overrides[c.id] } : c));
}

function getConcernById(id) {
  const overrides = getConcernOverrides();
  const concern = CONCERNS.find((c) => c.id === id);
  if (!concern) return null;
  return overrides[id] ? { ...concern, ...overrides[id] } : concern;
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
