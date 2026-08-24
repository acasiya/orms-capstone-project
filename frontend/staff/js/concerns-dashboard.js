// O.R.M.S. — Concerns/Suggestions Dashboard: week filter, status filter,
// pagination, and the Total stat — all real, from concerns-data.js's
// API-backed data. The category-based stats (top subject / biggest
// increase) and the heatmap/pie need a category concept real concerns
// don't have (no folders anymore — see concerns-data.js), so they're left
// as an honest "No data yet" rather than fabricated.

document.addEventListener("DOMContentLoaded", async () => {
  const PAGE_SIZE = 5;
  const WEEK_OPTIONS_COUNT = 8;

  const state = {
    weekOffset: 0,
    statusFilter: "all",
    page: 1,
  };

  const dashboardMain = document.querySelector(".admin-content");

  const welcomeTitle = document.querySelector(".dash-header__title");
  if (welcomeTitle) {
    const currentUser = getAdminUser();
    welcomeTitle.textContent = `Welcome back, ${(currentUser && currentUser.name) || "Staff"}!`;
  }

  try {
    await ensureConcernsLoaded();
  } catch (err) {
    if (dashboardMain) dashboardMain.innerHTML = `<div class="ordinances-empty">${err.message}</div>`;
    return;
  }

  // ---- Dropdown open/close ----

  const allDropdowns = Array.from(document.querySelectorAll(".dash-dropdown"));

  function closeAllDropdowns() {
    allDropdowns.forEach((d) => {
      const menu = d.querySelector(".dash-dropdown-menu");
      if (menu) menu.hidden = true;
    });
  }

  allDropdowns.forEach((dropdown) => {
    const btn = dropdown.querySelector(".dash-dropdown__btn");
    const menu = dropdown.querySelector(".dash-dropdown-menu");
    if (!btn || !menu) return;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const wasHidden = menu.hidden;
      closeAllDropdowns();
      menu.hidden = !wasHidden;
    });
  });

  document.addEventListener("click", () => closeAllDropdowns());

  // ---- Stats ----

  function renderStats() {
    document.getElementById("statTotal").textContent = getConcernsForWeekOffset(state.weekOffset).length;
    document.getElementById("statTopSubject").textContent = "No data yet";
    document.getElementById("statTopIncrease").textContent = "No data yet";
  }

  // ---- Date range dropdown ----

  const dateRangeLabel = document.getElementById("dateRangeLabel");
  const dateRangeMenu = document.getElementById("dateRangeMenu");

  function renderDateRangeMenu() {
    const items = [];
    for (let i = 0; i < WEEK_OPTIONS_COUNT; i++) {
      const { label } = getWeekRange(i);
      const prefix = i === 0 ? "This Week — " : i === 1 ? "Last Week — " : "";
      items.push(
        `<li data-offset="${i}" class="${i === state.weekOffset ? "active" : ""}">${prefix}${label}</li>`
      );
    }
    dateRangeMenu.innerHTML = items.join("");
    dateRangeMenu.querySelectorAll("li").forEach((li) => {
      li.addEventListener("click", () => {
        state.weekOffset = Number(li.dataset.offset);
        state.page = 1;
        renderAll();
      });
    });
  }

  // ---- Recent concerns table + View All status filter + pagination ----

  const viewAllMenu = document.getElementById("viewAllMenu");
  const viewAllLabel = document.getElementById("viewAllLabel");
  const recentConcernsBody = document.getElementById("recentConcernsBody");
  const recentConcernsPagination = document.getElementById("recentConcernsPagination");

  // Relabels the old folder-based filter menu to the real Submitted/Resolved
  // statuses, and the table's "Folder" column to a short text preview.
  viewAllMenu.innerHTML = `
    <li data-status="all" class="active">All Concerns/Suggestions</li>
    <li data-status="Submitted">Submitted</li>
    <li data-status="Resolved">Resolved</li>`;
  const folderHeader = document.querySelector(".recent-reports-table thead th:nth-child(2)");
  if (folderHeader) folderHeader.textContent = "Details";

  const STATUS_FILTER_LABELS = {
    all: "View All Concerns/Suggestions",
    Submitted: "Submitted",
    Resolved: "Resolved",
  };

  function truncate(text, max) {
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  viewAllMenu.querySelectorAll("li").forEach((li) => {
    li.addEventListener("click", () => {
      state.statusFilter = li.dataset.status;
      state.page = 1;
      viewAllMenu.querySelectorAll("li").forEach((el) => el.classList.toggle("active", el === li));
      viewAllLabel.textContent = STATUS_FILTER_LABELS[state.statusFilter];
      renderRecentConcerns();
    });
  });

  function statusPillClass(status) {
    return status === "Resolved" ? "status-pill--resolved" : "status-pill--in-process";
  }

  function buildPageList(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = [1];
    if (current > 3) pages.push("...");
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (current < total - 2) pages.push("...");
    pages.push(total);
    return pages;
  }

  function renderRecentConcerns() {
    let concerns = getConcernsForWeekOffset(state.weekOffset);
    if (state.statusFilter !== "all") {
      concerns = concerns.filter((c) => c.status === state.statusFilter);
    }

    const totalPages = Math.max(1, Math.ceil(concerns.length / PAGE_SIZE));
    state.page = Math.min(state.page, totalPages);
    const start = (state.page - 1) * PAGE_SIZE;
    const pageRows = concerns.slice(start, start + PAGE_SIZE);

    recentConcernsBody.innerHTML = pageRows.length
      ? pageRows
          .map(
            (c) => `
        <tr>
          <td>${truncate(c.concernText, 40)}</td>
          <td>${c.location || "—"}</td>
          <td>${c.reporter}</td>
          <td><span class="status-pill ${statusPillClass(c.status)}">${c.status}</span></td>
          <td>${c.dateSubmitted.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}, ${c.dateSubmitted.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</td>
          <td><a class="recent-reports-table__action" href="concern-detail.html?id=${encodeURIComponent(c.id)}" aria-label="View concern">&#8594;</a></td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="6" class="ordinances-empty">No concerns/suggestions for this selection.</td></tr>`;

    const pages = buildPageList(state.page, totalPages);
    let html = `<button type="button" data-page="prev" ${state.page <= 1 ? "disabled" : ""} aria-label="Previous page">&#8249;</button>`;
    pages.forEach((p) => {
      html +=
        p === "..."
          ? `<span class="dash-pagination__ellipsis">&hellip;</span>`
          : `<button type="button" data-page="${p}" class="${p === state.page ? "active" : ""}">${p}</button>`;
    });
    html += `<button type="button" data-page="next" ${state.page >= totalPages ? "disabled" : ""} aria-label="Next page">&#8250;</button>`;
    recentConcernsPagination.innerHTML = html;

    recentConcernsPagination.querySelectorAll("button[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.page;
        state.page = val === "prev" ? state.page - 1 : val === "next" ? state.page + 1 : Number(val);
        renderRecentConcerns();
      });
    });
  }

  // ---- Category pie + heatmap: honest "No data yet" placeholders — see
  // reports-dashboard.js for the same treatment and why. ----

  const categoryCard = document.getElementById("categoryPie")?.closest(".dash-card");
  if (categoryCard) {
    categoryCard.innerHTML = `<h2 class="dash-card__title">Concerns/Suggestions by Category</h2><div class="ordinances-empty">No data yet</div>`;
  }
  const heatmapCard = document.getElementById("heatmapCanvas")?.closest(".dash-card");
  if (heatmapCard) {
    heatmapCard.innerHTML = `<h2 class="dash-card__title">Concerns/Suggestions Heatmap</h2><div class="ordinances-empty">No data yet</div>`;
  }

  // ---- Wire up ----

  function renderAll() {
    dateRangeLabel.textContent = getWeekRange(state.weekOffset).label;
    renderDateRangeMenu();
    renderStats();
    renderRecentConcerns();
  }

  renderAll();
});
