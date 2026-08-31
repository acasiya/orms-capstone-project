// SafeSpace — Concerns/Suggestions Dashboard: week filter, status filter,
// pagination, stats, category pie, and the incident heatmap — all real,
// driven by concerns-data.js's API-backed concerns and folders. Folders
// (shared across every staff/admin account via the backend — see
// /api/concerns/folders/) stand in for "category" here, the same role
// Report.ordinance plays for Reports. The heatmap is a Leaflet +
// OpenStreetMap density map keyed on each concern's street — see
// js/heatmap.js (shared with the Reports dashboard).

document.addEventListener("DOMContentLoaded", async () => {
  const PAGE_SIZE = 5;
  const WEEK_OPTIONS_COUNT = 8;
  const MONTHS_BACK_COUNT = 5;
  const FOLDER_COLOR_PALETTE = [
    "#5b7fd1", "#2fd6c4", "#d13ec4", "#e8a33d",
    "#6fcf5b", "#e85b5b", "#8a6fd1", "#3ba3c9",
  ];

  const state = {
    weekOffset: 0,
    statusFilter: "all",
    page: 1,
    categoryPeriod: "week",
    heatmapPeriod: "week",
  };

  const dashboardMain = document.querySelector(".admin-content");

  const welcomeTitle = document.querySelector(".dash-header__title");
  if (welcomeTitle) {
    const currentUser = getAdminUser();
    welcomeTitle.textContent = `Welcome back, ${(currentUser && currentUser.name) || "Staff"}!`;
  }

  try {
    await Promise.all([ensureConcernsLoaded(), ensureFoldersLoaded()]);
  } catch (err) {
    if (dashboardMain) dashboardMain.innerHTML = `<div class="ordinances-empty">${err.message}</div>`;
    return;
  }

  // ---- Folder color + count helpers ----

  function folderColor(id) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
    return FOLDER_COLOR_PALETTE[Math.abs(hash) % FOLDER_COLOR_PALETTE.length];
  }

  // Unfoldered concerns don't count toward any folder's total — matches how
  // "not yet categorized" naturally falls out of any category breakdown.
  function countByFolder(concerns) {
    const counts = {};
    liveFolders().forEach((f) => (counts[f.id] = 0));
    concerns.forEach((c) => {
      if (c.folderId) counts[c.folderId] = (counts[c.folderId] || 0) + 1;
    });
    return counts;
  }

  function topFolder(counts) {
    let best = null;
    let bestCount = 0;
    liveFolders().forEach((f) => {
      const count = counts[f.id] || 0;
      if (count > bestCount) {
        bestCount = count;
        best = f;
      }
    });
    return best;
  }

  function buildPeriodOptions() {
    const opts = [{ value: "week", label: "This Week" }];
    for (let m = 0; m <= MONTHS_BACK_COUNT; m++) {
      const { start } = getMonthRange(m);
      opts.push({
        value: `month${m}`,
        label: m === 0 ? "This Month" : start.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      });
    }
    return opts;
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
    const weekConcerns = getConcernsForWeekOffset(state.weekOffset);
    document.getElementById("statTotal").textContent = weekConcerns.length;

    const topSubject = topFolder(countByFolder(weekConcerns));
    document.getElementById("statTopSubject").textContent = topSubject ? topSubject.name : "No data yet";

    const thisMonthCounts = countByFolder(getConcernsForPeriod("month0"));
    const lastMonthCounts = countByFolder(getConcernsForPeriod("month1"));
    let bestFolder = null;
    let bestDelta = 0;
    liveFolders().forEach((f) => {
      const delta = (thisMonthCounts[f.id] || 0) - (lastMonthCounts[f.id] || 0);
      if (delta > bestDelta) {
        bestDelta = delta;
        bestFolder = f;
      }
    });
    document.getElementById("statTopIncrease").textContent = bestFolder ? bestFolder.name : "No data yet";
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

  viewAllMenu.innerHTML = `
    <li data-status="all" class="active">All Concerns/Suggestions</li>
    <li data-status="Submitted">Submitted</li>
    <li data-status="Resolved">Resolved</li>`;

  const STATUS_FILTER_LABELS = {
    all: "View All Concerns/Suggestions",
    Submitted: "Submitted",
    Resolved: "Resolved",
  };

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
          <td>${c.id.slice(0, 8).toUpperCase()}</td>
          <td>${c.folderName || "Unfoldered"}</td>
          <td>${c.location || "—"}</td>
          <td>${c.reporter}</td>
          <td><span class="status-pill ${statusPillClass(c.status)}">${c.status}</span></td>
          <td>${c.dateSubmitted.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}, ${c.dateSubmitted.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</td>
          <td><a class="recent-reports-table__action" href="concern-detail.html?id=${encodeURIComponent(c.id)}" aria-label="View concern">&#8594;</a></td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="7" class="ordinances-empty">No concerns/suggestions for this selection.</td></tr>`;

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

  // ---- Concerns/Suggestions by Category (folder) pie ----

  const categoryPeriodMenu = document.getElementById("categoryPeriodMenu");
  const categoryPeriodLabel = document.getElementById("categoryPeriodLabel");
  const categoryPie = document.getElementById("categoryPie");
  const categoryLegend = document.getElementById("categoryLegend");

  // Rebuilds the menu's <li>s AND rewires their click handlers every call —
  // rebuilding innerHTML without redoing this leaves the fresh <li>s with no
  // listeners, so only the first selection would ever do anything.
  function renderPeriodMenu(menuEl, labelEl, getValue, setValue, onChange) {
    menuEl.innerHTML = buildPeriodOptions()
      .map((o) => `<li data-value="${o.value}" class="${o.value === getValue() ? "active" : ""}">${o.label}</li>`)
      .join("");
    menuEl.querySelectorAll("li").forEach((li) => {
      li.addEventListener("click", () => {
        setValue(li.dataset.value);
        labelEl.textContent = li.textContent;
        renderPeriodMenu(menuEl, labelEl, getValue, setValue, onChange);
        onChange();
      });
    });
  }

  function renderCategoryPie() {
    const folders = liveFolders();
    categoryPie.querySelectorAll(".pie-chart__label, .pie-chart__empty").forEach((el) => el.remove());

    if (!folders.length) {
      categoryPie.style.background = "var(--border)";
      categoryPie.insertAdjacentHTML("beforeend", `<div class="pie-chart__empty">No folders yet — create one on Concerns/Suggestions.</div>`);
      categoryLegend.innerHTML = "";
      return;
    }

    const concerns = getConcernsForPeriod(state.categoryPeriod);
    const counts = countByFolder(concerns);
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
      .map((f) => `<li><span class="pie-legend__dot" style="background:${folderColor(f.id)}"></span>${f.name} (${counts[f.id] || 0})</li>`)
      .join("");
  }

  // ---- Concerns/Suggestions heatmap (real Leaflet + OpenStreetMap density
  // map, keyed on each concern's street — see js/heatmap.js, shared with the
  // Reports dashboard). Concerns filed without a location just don't appear. ----

  const heatmapCanvasEl = document.getElementById("heatmapCanvas");
  const heatmapModal = document.getElementById("heatmapModal");
  const heatmapCanvasModalEl = document.getElementById("heatmapCanvasModal");
  const heatmapPeriodMenu = document.getElementById("heatmapPeriodMenu");
  const heatmapPeriodLabel = document.getElementById("heatmapPeriodLabel");
  const heatmapModalPeriodMenu = document.getElementById("heatmapModalPeriodMenu");
  const heatmapModalPeriodLabel = document.getElementById("heatmapModalPeriodLabel");

  // No-op unless setupHeatmap() succeeds — a failed map init (Leaflet or the
  // tile host unreachable) then just leaves an empty heatmap card instead of
  // taking down the stats, table, and pie with it.
  let renderHeatmaps = () => {};

  function setupHeatmap() {
    if (typeof L === "undefined" || typeof createIncidentHeatmap !== "function") {
      throw new Error("Leaflet / heatmap.js not loaded");
    }

    const cardHeatmap = createIncidentHeatmap(heatmapCanvasEl, {
      interactive: false,
      emptyMessage: "No located concerns in this period",
    });
    let modalHeatmap = null;

    const heatmapCounts = () => countByLocation(getConcernsForPeriod(state.heatmapPeriod));

    renderHeatmaps = () => {
      const counts = heatmapCounts();
      const unmapped = cardHeatmap.render(counts) || [];
      if (modalHeatmap) modalHeatmap.render(counts);
      if (unmapped.length) {
        console.warn("[heatmap] concerns on streets with no known coordinates:", unmapped);
      }
    };

    // Card and modal each have their own period dropdown; both drive
    // state.heatmapPeriod and are rebuilt together so their active row and
    // button label stay in sync.
    function renderHeatmapMenus() {
      const opts = buildPeriodOptions();
      [
        [heatmapPeriodMenu, heatmapPeriodLabel],
        [heatmapModalPeriodMenu, heatmapModalPeriodLabel],
      ].forEach(([menu, label]) => {
        if (!menu) return;
        menu.innerHTML = opts
          .map((o) => `<li data-value="${o.value}" class="${o.value === state.heatmapPeriod ? "active" : ""}">${o.label}</li>`)
          .join("");
        const cur = opts.find((o) => o.value === state.heatmapPeriod) || opts[0];
        if (label) label.textContent = cur.label;
        menu.querySelectorAll("li").forEach((li) => {
          li.addEventListener("click", () => {
            state.heatmapPeriod = li.dataset.value;
            renderHeatmapMenus();
            renderHeatmaps();
          });
        });
      });
    }

    function openHeatmapModal() {
      heatmapModal.hidden = false;
      if (!modalHeatmap) {
        modalHeatmap = createIncidentHeatmap(heatmapCanvasModalEl, {
          interactive: true,
          emptyMessage: "No located concerns in this period",
        });
      }
      // The modal container was display:none until now — Leaflet sized it as
      // 0×0. Wait two frames for the browser to lay the shown modal out, then
      // recalc size, repaint the heat, and frame it to the concern spread.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          modalHeatmap.invalidate();
          modalHeatmap.render(heatmapCounts());
          modalHeatmap.fit();
        })
      );
    }

    heatmapCanvasEl.addEventListener("click", openHeatmapModal);
    heatmapCanvasEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openHeatmapModal();
      }
    });

    window.addEventListener("resize", () => {
      cardHeatmap.invalidate();
      if (modalHeatmap) modalHeatmap.invalidate();
    });

    renderHeatmapMenus();
    // Defer the first paint: during DOMContentLoaded the card hasn't been
    // laid out yet, so Leaflet would measure it at 0×0 and mis-fit the view.
    requestAnimationFrame(() => {
      cardHeatmap.invalidate();
      renderHeatmaps();
    });
  }

  // ---- Wire up period dropdowns ----

  renderPeriodMenu(
    categoryPeriodMenu,
    categoryPeriodLabel,
    () => state.categoryPeriod,
    (v) => (state.categoryPeriod = v),
    renderCategoryPie
  );

  try {
    setupHeatmap();
  } catch (err) {
    console.error("[heatmap] disabled:", err);
    heatmapCanvasEl.classList.remove("heatmap-canvas");
    heatmapCanvasEl.innerHTML = `<div class="ordinances-empty">Map unavailable</div>`;
  }

  // ---- Wire up ----

  function renderAll() {
    dateRangeLabel.textContent = getWeekRange(state.weekOffset).label;
    renderDateRangeMenu();
    renderStats();
    renderRecentConcerns();
  }

  renderAll();
  renderCategoryPie();
});
