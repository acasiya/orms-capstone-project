// O.R.M.S. — Ordinance storage: persists Barangay Staff uploads/edits/deletes
// in localStorage (there's no backend Ordinance model yet), seeded from the
// placeholder list in ordinances-data.js. Used by both ordinances.html
// (list + upload) and ordinance-detail.html (view + edit/delete).

const ORDINANCES_STORAGE_KEY = "orms_staff_ordinances";

function getOrdinances() {
  let stored;
  try {
    stored = JSON.parse(localStorage.getItem(ORDINANCES_STORAGE_KEY));
  } catch {
    stored = null;
  }
  if (!Array.isArray(stored)) {
    stored = ORDINANCES.slice();
    localStorage.setItem(ORDINANCES_STORAGE_KEY, JSON.stringify(stored));
  }
  return stored;
}

function saveOrdinances(list) {
  localStorage.setItem(ORDINANCES_STORAGE_KEY, JSON.stringify(list));
}

function ordinanceNumberSort(number) {
  const match = String(number).match(/\d+/);
  return match ? Number(match[0]) : 0;
}

// Date Approved comes from a <input type="date"> field ("YYYY-MM-DD"), which
// already sorts correctly as a plain string, and is reformatted for display.
function formatDateApproved(isoDate) {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "2-digit" });
}

function addOrdinance(data) {
  const list = getOrdinances();
  const ordinance = {
    id: `ord-${Date.now()}`,
    number: data.number,
    numberSort: ordinanceNumberSort(data.number),
    title: data.title,
    author: data.author,
    category: data.category,
    dateApproved: formatDateApproved(data.dateApproved),
    dateSort: data.dateApproved,
    description: data.description,
    pdf: data.pdf || "#",
  };
  list.unshift(ordinance);
  saveOrdinances(list);
  return ordinance;
}

function updateOrdinance(id, data) {
  const list = getOrdinances();
  const index = list.findIndex((o) => o.id === id);
  if (index === -1) return null;
  list[index] = {
    ...list[index],
    number: data.number,
    numberSort: ordinanceNumberSort(data.number),
    title: data.title,
    author: data.author,
    category: data.category,
    dateApproved: formatDateApproved(data.dateApproved),
    dateSort: data.dateApproved,
    description: data.description,
    pdf: data.pdf || list[index].pdf,
  };
  saveOrdinances(list);
  return list[index];
}

function deleteOrdinance(id) {
  saveOrdinances(getOrdinances().filter((o) => o.id !== id));
}
