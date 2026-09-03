// SafeSpace — Reports Dashboard: week filter, status filter, pagination,
// stat cards, the category pie, and the incident heatmap — all real, from
// reports-data.js's API-backed data (category comes from matching each
// report's ordinance against the real uploaded ordinances — see
// reports-data.js's categoryForOrdinance). The heatmap is a Leaflet +
// OpenStreetMap density map keyed on each report's street (geocoded to a
// centroid in street-coordinates.js) — see js/heatmap.js.

document.addEventListener("DOMContentLoaded", async () => {
  const PAGE_SIZE = 5;
  const WEEK_OPTIONS_COUNT = 8;
  const MONTHS_BACK_COUNT = 5;
  const CATEGORY_COLOR_PALETTE = [
    "#5b7fd1", "#2fd6c4", "#d13ec4", "#e8a33d",
    "#6fcf5b", "#e85b5b", "#8a6fd1", "#3ba3c9",
  ];

  const state = {
    weekOffset: 0,
    statusFilter: "all",
    page: 1,
    categoryPeriod: "week",
    heatmapPeriod: "week",
    statusChartPeriod: "week",
  };

  const dashboardMain = document.querySelector(".admin-content");

  const welcomeTitle = document.querySelector(".dash-header__title");
  if (welcomeTitle) {
    const currentUser = getAdminUser();
    welcomeTitle.textContent = `Welcome back, ${(currentUser && currentUser.name) || "Staff"}!`;
  }

  try {
    await ensureOrdinancesLoaded();
    await ensureReportsLoaded();
  } catch (err) {
    if (dashboardMain) {
      dashboardMain.innerHTML = `<div class="ordinances-empty">${err.message}</div>`;
    }
    return;
  }

  // Every category a real ordinance defines, plus "Other" only if some
  // report's ordinance text didn't match any of them — computed once so the
  // pie legend doesn't reshuffle as the period dropdown changes.
  const REPORT_CATEGORIES = Array.from(
    new Set([...liveOrdinances().map((o) => o.category), ...liveReports().map((r) => r.category)])
  );

  function categoryColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
    return CATEGORY_COLOR_PALETTE[Math.abs(hash) % CATEGORY_COLOR_PALETTE.length];
  }

  function formatDate(date) {
    return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
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

  // ---- Stats + delta ----

  // stats.process/remarks keep their old names to match the statProcess/
  // statRemarks element ids below, but now count "Under Review"/"In Action"
  // respectively.
  function computeStats(reports) {
    const stats = { total: reports.length, new: 0, process: 0, resolved: 0, remarks: 0 };
    reports.forEach((r) => {
      if (r.status === "New Submission") stats.new++;
      else if (r.status === "Under Review") stats.process++;
      else if (r.status === "Resolved") stats.resolved++;
      else if (r.status === "In Action") stats.remarks++;
    });
    return stats;
  }

  function deltaText(cur, prev) {
    let pct;
    if (prev === 0) pct = cur === 0 ? 0 : 100;
    else pct = Math.round(((cur - prev) / prev) * 100);
    const arrow = pct >= 0 ? "↗" : "↘";
    return { text: `${arrow} ${Math.abs(pct)}% vs last week`, isDown: pct < 0 };
  }

  function setStat(valueId, deltaId, cur, prev) {
    document.getElementById(valueId).textContent = cur;
    const { text, isDown } = deltaText(cur, prev);
    const deltaEl = document.getElementById(deltaId);
    deltaEl.textContent = text;
    deltaEl.classList.toggle("stat-card__delta--down", isDown);
  }

  function renderStats() {
    const cur = computeStats(getReportsForWeekOffset(state.weekOffset));
    const prev = computeStats(getReportsForWeekOffset(state.weekOffset + 1));
    setStat("statTotal", "statTotalDelta", cur.total, prev.total);
    setStat("statNew", "statNewDelta", cur.new, prev.new);
    setStat("statProcess", "statProcessDelta", cur.process, prev.process);
    setStat("statResolved", "statResolvedDelta", cur.resolved, prev.resolved);
    setStat("statRemarks", "statRemarksDelta", cur.remarks, prev.remarks);
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

  // ---- Recent reports table + View All status filter + pagination ----

  const viewAllMenu = document.getElementById("viewAllMenu");
  const viewAllLabel = document.getElementById("viewAllLabel");
  const recentReportsBody = document.getElementById("recentReportsBody");
  const recentReportsPagination = document.getElementById("recentReportsPagination");

  const STATUS_FILTER_LABELS = {
    all: "View All Reports",
    "New Submission": "New Submission Reports",
    "Under Review": "Under Review Reports",
    "In Action": "In Action Reports",
    Resolved: "Resolved Reports",
  };

  viewAllMenu.querySelectorAll("li").forEach((li) => {
    li.addEventListener("click", () => {
      state.statusFilter = li.dataset.status;
      state.page = 1;
      viewAllMenu.querySelectorAll("li").forEach((el) => el.classList.toggle("active", el === li));
      viewAllLabel.textContent = STATUS_FILTER_LABELS[state.statusFilter];
      renderRecentReports();
    });
  });

  function statusPillClass(status) {
    if (status === "New Submission") return "status-pill--new";
    if (status === "Under Review") return "status-pill--in-process";
    if (status === "In Action") return "status-pill--remarks";
    return "status-pill--resolved";
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

  function renderRecentReports() {
    let reports = getReportsForWeekOffset(state.weekOffset);
    if (state.statusFilter !== "all") {
      reports = reports.filter((r) => r.status === state.statusFilter);
    }

    const totalPages = Math.max(1, Math.ceil(reports.length / PAGE_SIZE));
    state.page = Math.min(state.page, totalPages);
    const start = (state.page - 1) * PAGE_SIZE;
    const pageRows = reports.slice(start, start + PAGE_SIZE);

    recentReportsBody.innerHTML = pageRows.length
      ? pageRows
          .map(
            (r) => `
        <tr>
          <td>${r.id.slice(0, 8).toUpperCase()}</td>
          <td>${r.incidentType}</td>
          <td>${r.location}</td>
          <td>${r.reporter}</td>
          <td><span class="status-pill ${statusPillClass(r.status)}">${r.status}</span></td>
          <td>${r.dateSubmitted.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}, ${r.dateSubmitted.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</td>
          <td><a class="recent-reports-table__action" href="report-detail.html?id=${encodeURIComponent(r.id)}" aria-label="View report">&#8594;</a></td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="7" class="ordinances-empty">No reports for this selection.</td></tr>`;

    const pages = buildPageList(state.page, totalPages);
    let html = `<button type="button" data-page="prev" ${state.page <= 1 ? "disabled" : ""} aria-label="Previous page">&#8249;</button>`;
    pages.forEach((p) => {
      html +=
        p === "..."
          ? `<span class="dash-pagination__ellipsis">&hellip;</span>`
          : `<button type="button" data-page="${p}" class="${p === state.page ? "active" : ""}">${p}</button>`;
    });
    html += `<button type="button" data-page="next" ${state.page >= totalPages ? "disabled" : ""} aria-label="Next page">&#8250;</button>`;
    recentReportsPagination.innerHTML = html;

    recentReportsPagination.querySelectorAll("button[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.page;
        state.page = val === "prev" ? state.page - 1 : val === "next" ? state.page + 1 : Number(val);
        renderRecentReports();
      });
    });
  }

  // ---- Reports by Category pie ----

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
    categoryPie.querySelectorAll(".pie-chart__label, .pie-chart__empty").forEach((el) => el.remove());

    const reports = getReportsForPeriod(state.categoryPeriod);
    if (!reports.length) {
      categoryPie.style.background = "var(--border)";
      categoryPie.insertAdjacentHTML("beforeend", `<div class="pie-chart__empty">No data yet</div>`);
      categoryLegend.innerHTML = "";
      return;
    }

    const counts = {};
    REPORT_CATEGORIES.forEach((c) => (counts[c] = 0));
    reports.forEach((r) => (counts[r.category] = (counts[r.category] || 0) + 1));
    const total = reports.length;

    let cumRaw = 0;
    const stops = [];
    const labels = [];
    REPORT_CATEGORIES.forEach((c) => {
      const startB = Math.round(cumRaw * 100);
      cumRaw += (counts[c] || 0) / total;
      const endB = Math.round(cumRaw * 100);
      stops.push(`${categoryColor(c)} ${startB}% ${endB}%`);
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

    categoryLegend.innerHTML = REPORT_CATEGORIES.map(
      (c) => `<li><span class="pie-legend__dot" style="background:${categoryColor(c)}"></span>${c} (${counts[c] || 0})</li>`
    ).join("");
  }

  renderPeriodMenu(
    categoryPeriodMenu,
    categoryPeriodLabel,
    () => state.categoryPeriod,
    (v) => (state.categoryPeriod = v),
    renderCategoryPie
  );

  // ---- Reports by Status bar chart ----

  const statusChartPeriodMenu = document.getElementById("statusChartPeriodMenu");
  const statusChartPeriodLabel = document.getElementById("statusChartPeriodLabel");
  const statusBarChart = document.getElementById("statusBarChart");

  const STATUS_BAR_DEFS = [
    { key: "new", label: "New Submission", modifier: "new" },
    { key: "process", label: "Under Review", modifier: "process" },
    { key: "remarks", label: "In Action", modifier: "remarks" },
    { key: "resolved", label: "Resolved", modifier: "resolved" },
  ];
  const MAX_BAR_HEIGHT = 168; // px — leaves room for the count label above it

  function renderStatusChart() {
    const stats = computeStats(getReportsForPeriod(state.statusChartPeriod));
    const maxCount = Math.max(stats.new, stats.process, stats.remarks, stats.resolved, 1);

    if (!stats.total) {
      statusBarChart.innerHTML = `<div class="status-bar-chart__empty">No reports for this period.</div>`;
      return;
    }

    statusBarChart.innerHTML = STATUS_BAR_DEFS.map(({ key, label, modifier }) => {
      const count = stats[key];
      const height = Math.max(Math.round((count / maxCount) * MAX_BAR_HEIGHT), count > 0 ? 6 : 2);
      return `
        <div class="status-bar-chart__col">
          <span class="status-bar-chart__count">${count}</span>
          <div class="status-bar-chart__bar status-bar-chart__bar--${modifier}" style="height:${height}px"></div>
          <span class="status-bar-chart__label">${label}</span>
        </div>`;
    }).join("");
  }

  renderPeriodMenu(
    statusChartPeriodMenu,
    statusChartPeriodLabel,
    () => state.statusChartPeriod,
    (v) => (state.statusChartPeriod = v),
    renderStatusChart
  );

  // ---- Incident heatmap (real Leaflet + OpenStreetMap density map) ----
  //
  // Intensity = number of reports per street for the selected period, placed
  // at that street's centroid (street-coordinates.js). The small card is a
  // static map that opens the enlarged, pannable/zoomable modal on click.

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

    const cardHeatmap = createIncidentHeatmap(heatmapCanvasEl, { interactive: false });
    let modalHeatmap = null;

    const heatmapCounts = () => countByLocation(getReportsForPeriod(state.heatmapPeriod));

    renderHeatmaps = () => {
      const counts = heatmapCounts();
      const unmapped = cardHeatmap.render(counts) || [];
      if (modalHeatmap) modalHeatmap.render(counts);
      if (unmapped.length) {
        console.warn("[heatmap] reports on streets with no known coordinates:", unmapped);
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
        modalHeatmap = createIncidentHeatmap(heatmapCanvasModalEl, { interactive: true });
      }
      // The modal container was display:none until now — Leaflet sized it as
      // 0×0. Wait two frames for the browser to lay the shown modal out, then
      // recalc size, repaint the heat, and frame it to the incident spread.
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
    renderRecentReports();
  }

  renderAll();
  renderCategoryPie();
  renderStatusChart();
});
