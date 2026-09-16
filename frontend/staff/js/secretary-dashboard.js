// SafeSpace — Secretary Dashboard: a workload overview across the three
// things a Secretary maintains — concerns/suggestions, the ordinance
// repository, and citizen questions — rather than the incident-geography
// view Barangay Captain gets on the Reports Dashboard. No date-range
// filter: this is today's backlog, not a historical trend.

document.addEventListener("DOMContentLoaded", async () => {
  const AGING_LIST_LIMIT = 8;
  const FOLDER_COLOR_PALETTE = [
    "#5b7fd1", "#2fd6c4", "#d13ec4", "#e8a33d",
    "#6fcf5b", "#e85b5b", "#8a6fd1", "#3ba3c9",
  ];

  const dashboardMain = document.querySelector(".admin-content");
  const currentUser = getAdminUser();

  const welcomeTitle = document.querySelector(".dash-header__title");
  if (welcomeTitle) {
    welcomeTitle.textContent = `Welcome back, ${(currentUser && currentUser.name) || "Staff"}!`;
  }

  let questions = [];
  try {
    const [, , loadedQuestions] = await Promise.all([
      ensureConcernsLoaded(),
      ensureFoldersLoaded(),
      getQuestions(),
      ensureOrdinancesLoaded(),
    ]);
    questions = loadedQuestions;
  } catch (err) {
    if (dashboardMain) {
      dashboardMain.innerHTML = `<div class="ordinances-empty">${err.message}</div>`;
    }
    return;
  }

  function daysBetween(from, to) {
    return Math.max(0, Math.floor((to - from) / (1000 * 60 * 60 * 24)));
  }

  function folderColor(id) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
    return FOLDER_COLOR_PALETTE[Math.abs(hash) % FOLDER_COLOR_PALETTE.length];
  }

  // ---- Stat cards ----

  function renderStats() {
    const concerns = liveConcerns();
    document.getElementById("statOpenConcerns").textContent = concerns.filter((c) => c.status === "Submitted").length;
    document.getElementById("statResolvedConcerns").textContent = concerns.filter((c) => c.status === "Resolved").length;
    document.getElementById("statUnansweredQuestions").textContent = questions.filter((q) => !q.is_answered).length;
    document.getElementById("statActiveOrdinances").textContent = liveOrdinances().filter((o) => !o.isArchived).length;
  }

  // ---- Concerns by Folder pie (same technique as concerns-dashboard.js's
  // Captain-only Concerns/Suggestions by Category, scoped to all concerns
  // since this page has no date filter) ----

  function countByFolder(concerns) {
    const counts = {};
    liveFolders().forEach((f) => (counts[f.id] = 0));
    concerns.forEach((c) => {
      if (c.folderId) counts[c.folderId] = (counts[c.folderId] || 0) + 1;
    });
    return counts;
  }

  function renderCategoryPie() {
    const categoryPie = document.getElementById("categoryPie");
    const categoryLegend = document.getElementById("categoryLegend");
    const folders = liveFolders();
    categoryPie.querySelectorAll(".pie-chart__label, .pie-chart__empty").forEach((el) => el.remove());

    if (!folders.length) {
      categoryPie.style.background = "var(--border)";
      categoryPie.insertAdjacentHTML("beforeend", `<div class="pie-chart__empty">No folders yet — create one on Concerns/Suggestions.</div>`);
      categoryLegend.innerHTML = "";
      return;
    }

    const counts = countByFolder(liveConcerns());
    const total = folders.reduce((sum, f) => sum + (counts[f.id] || 0), 0) || 1;

    let cumRaw = 0;
    const stops = [];
    const labels = [];
    folders.forEach((f) => {
      const startB = Math.round(cumRaw * 100);
      cumRaw += (counts[f.id] || 0) / total;
      const endB = Math.round(cumRaw * 100);
      stops.push(`${folderColor(f.id)} ${startB}% ${endB}%`);
      if (endB > startB) labels.push({ mid: (startB + endB) / 2, pct: endB - startB });
    });

    categoryPie.style.background = `conic-gradient(${stops.join(", ")})`;

    const R = 30;
    labels.forEach(({ mid, pct }) => {
      const theta = (mid / 100) * 2 * Math.PI;
      const x = 50 + R * Math.sin(theta);
      const y = 50 - R * Math.cos(theta);
      const span = document.createElement("span");
      span.className = "pie-chart__label";
      span.style.left = `${x}%`;
      span.style.top = `${y}%`;
      span.textContent = `${pct}%`;
      categoryPie.appendChild(span);
    });

    categoryLegend.innerHTML = folders
      .map((f) => `<li title="${f.name} (${counts[f.id] || 0})"><span class="pie-legend__dot" style="background:${folderColor(f.id)}"></span><span class="pie-legend__label">${f.name} (${counts[f.id] || 0})</span></li>`)
      .join("");
  }

  // ---- Oldest Open Concerns ----

  function renderAgingList() {
    const body = document.getElementById("agingConcernsBody");
    const now = new Date();
    const open = liveConcerns()
      .filter((c) => c.status === "Submitted")
      .slice()
      .sort((a, b) => a.dateSubmitted - b.dateSubmitted)
      .slice(0, AGING_LIST_LIMIT);

    body.innerHTML = open.length
      ? open
          .map((c) => {
            const days = daysBetween(c.dateSubmitted, now);
            return `
        <tr>
          <td>${c.id.slice(0, 8).toUpperCase()}</td>
          <td>${c.folderName || "Unfoldered"}</td>
          <td>${days} ${days === 1 ? "day" : "days"}</td>
          <td><a class="recent-reports-table__action" href="concern-detail.html?id=${encodeURIComponent(c.id)}" aria-label="View concern">&#8594;</a></td>
        </tr>`;
          })
          .join("")
      : `<tr><td colspan="4" class="ordinances-empty">Nothing open — every concern has been resolved.</td></tr>`;
  }

  renderStats();
  renderCategoryPie();
  renderAgingList();
});
