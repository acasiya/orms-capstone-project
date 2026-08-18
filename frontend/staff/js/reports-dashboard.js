// O.R.M.S. — Reports Dashboard behavior: week filter, status filter, pagination,
// and period-based category/heatmap views. Everything runs against the mock
// REPORTS data from reports-data.js (no backend wired up yet).

document.addEventListener("DOMContentLoaded", () => {
  const PAGE_SIZE = 5;
  const WEEK_OPTIONS_COUNT = 8;
  const MONTHS_BACK_COUNT = 5;

  const state = {
    weekOffset: 0,
    statusFilter: "all",
    page: 1,
    categoryPeriod: "week",
    heatmapPeriod: "week0",
  };

  // ---- Date helpers ----

  function formatDate(date) {
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
    return { start, end, label: `${formatDate(start)} - ${formatDate(end)}` };
  }

  function getMonthRange(monthsBack) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 0);
    return { start, end };
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

  function getReportsForWeekOffset(offset) {
    const { start, end } = getWeekRange(offset);
    const endDate = endOfDay(end);
    return REPORTS.filter((r) => r.dateSubmitted >= start && r.dateSubmitted <= endDate);
  }

  function getReportsForPeriod(periodValue) {
    if (periodValue === "week") return getReportsForWeekOffset(0);
    if (periodValue.startsWith("week")) return getReportsForWeekOffset(Number(periodValue.slice(4)));
    const monthsBack = Number(periodValue.replace("month", ""));
    const { start, end } = getMonthRange(monthsBack);
    const endDate = endOfDay(end);
    return REPORTS.filter((r) => r.dateSubmitted >= start && r.dateSubmitted <= endDate);
  }

  // Heatmap dropdown offers per-week AND per-month granularity; category stays month-only.
  function buildHeatmapPeriodOptions() {
    const opts = [];
    for (let i = 0; i < WEEK_OPTIONS_COUNT; i++) {
      const { label } = getWeekRange(i);
      const short = i === 0 ? "This Week" : i === 1 ? "Last Week" : `Week of ${formatDate(getWeekRange(i).start)}`;
      const full = i === 0 ? `This Week — ${label}` : i === 1 ? `Last Week — ${label}` : label;
      opts.push({ value: `week${i}`, label: full, short });
    }
    for (let m = 0; m <= MONTHS_BACK_COUNT; m++) {
      const { start } = getMonthRange(m);
      const short = m === 0 ? "This Month" : start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      opts.push({ value: `month${m}`, label: short, short });
    }
    return opts;
  }

  function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return h;
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

  function computeStats(reports) {
    const stats = { total: reports.length, new: 0, process: 0, resolved: 0, remarks: 0 };
    reports.forEach((r) => {
      if (r.status === "New Submission") stats.new++;
      else if (r.status === "In Process") stats.process++;
      else if (r.status === "Resolved") stats.resolved++;
      else if (r.status === "With Remarks") stats.remarks++;
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
    "In Process": "In Process Reports",
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
    if (status === "In Process") return "status-pill--in-process";
    if (status === "Resolved") return "status-pill--resolved";
    return "status-pill--remarks";
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
          <td>${r.id}</td>
          <td>${r.incidentType}</td>
          <td>${r.location}</td>
          <td>${r.reporter}</td>
          <td><span class="status-pill ${statusPillClass(r.status)}">${r.status}</span></td>
          <td>${r.dateSubmitted.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}, ${r.dateSubmitted.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</td>
          <td><a class="recent-reports-table__action" href="report-detail.html?id=${encodeURIComponent(r.id)}" aria-label="View report ${r.id}">&#8594;</a></td>
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

  function renderPeriodMenu(menuEl, selectedValue) {
    menuEl.innerHTML = buildPeriodOptions()
      .map((o) => `<li data-value="${o.value}" class="${o.value === selectedValue ? "active" : ""}">${o.label}</li>`)
      .join("");
  }

  function renderCategoryPie() {
    const reports = getReportsForPeriod(state.categoryPeriod);
    const total = reports.length || 1;
    const counts = {};
    INCIDENT_TYPES.forEach((t) => (counts[t.name] = 0));
    reports.forEach((r) => (counts[r.incidentType] = (counts[r.incidentType] || 0) + 1));

    let cumRaw = 0;
    const stops = [];
    const labels = [];
    INCIDENT_TYPES.forEach((t) => {
      const startB = Math.round(cumRaw * 100);
      cumRaw += counts[t.name] / total;
      const endB = Math.round(cumRaw * 100);
      stops.push(`${t.color} ${startB}% ${endB}%`);
      if (endB > startB) labels.push({ mid: (startB + endB) / 2, pct: endB - startB });
    });

    categoryPie.style.background = `conic-gradient(${stops.join(", ")})`;
    categoryPie.querySelectorAll(".pie-chart__label").forEach((el) => el.remove());

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

    categoryLegend.innerHTML = INCIDENT_TYPES.map(
      (t) => `<li><span class="pie-legend__dot" style="background:${t.color}"></span>${t.name}</li>`
    ).join("");
  }

  // ---- Incident heatmap (stylized placeholder driven by mock severity mix) ----

  const heatmapPeriodMenu = document.getElementById("heatmapPeriodMenu");
  const heatmapPeriodLabel = document.getElementById("heatmapPeriodLabel");
  const heatmapCanvas = document.getElementById("heatmapCanvas");
  const heatmapCanvasModal = document.getElementById("heatmapCanvasModal");
  const heatmapModal = document.getElementById("heatmapModal");
  const heatmapModalPeriodMenu = document.getElementById("heatmapModalPeriodMenu");
  const heatmapModalPeriodLabel = document.getElementById("heatmapModalPeriodLabel");

  const HEATMAP_PATHS = [
    "M30,70 C110,30 170,100 250,60 S350,40 380,80",
    "M25,150 C90,120 150,180 220,140 S320,110 375,160",
    "M55,220 C140,200 190,240 260,210 S345,190 385,230",
    "M20,110 C80,150 140,100 200,130 S300,160 365,120",
    "M45,35 C100,75 160,45 210,85 S300,65 355,45",
    "M65,190 C130,160 170,210 230,180 S325,225 375,195",
  ];
  const SEVERITY_COLORS = { low: "#4caf50", moderate: "#f2c94c", high: "#f2994a", critical: "#e63946" };
  const SEVERITY_ORDER = ["critical", "high", "moderate", "low"];

  function renderHeatmap() {
    const reports = getReportsForPeriod(state.heatmapPeriod);
    const sevCounts = { low: 0, moderate: 0, high: 0, critical: 0 };
    reports.forEach((r) => sevCounts[r.severity]++);
    const total = reports.length || 1;

    let pool = [];
    SEVERITY_ORDER.forEach((s) => {
      const weight = Math.max(1, Math.round((sevCounts[s] / total) * HEATMAP_PATHS.length));
      for (let k = 0; k < weight; k++) pool.push(s);
    });
    while (pool.length < HEATMAP_PATHS.length) pool.push(SEVERITY_ORDER[0]);
    pool = pool.slice(0, HEATMAP_PATHS.length);

    const rng = mulberry32(hashString(state.heatmapPeriod));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const paths = HEATMAP_PATHS.map(
      (d, i) => `<path d="${d}" fill="none" stroke="${SEVERITY_COLORS[pool[i]]}" stroke-width="4" stroke-linecap="round" opacity="0.85" />`
    ).join("");
    const svg = `<svg viewBox="0 0 400 260" preserveAspectRatio="none">${paths}</svg>`;

    [heatmapCanvas, heatmapCanvasModal].forEach((canvas) => {
      const oldSvg = canvas.querySelector("svg");
      if (oldSvg) oldSvg.remove();
      canvas.insertAdjacentHTML("beforeend", svg);
    });
  }

  // Both the card's dropdown and the enlarged modal's dropdown drive the same
  // state.heatmapPeriod, so selecting a period in either place keeps both in sync.
  function wireHeatmapPeriodDropdowns() {
    const sets = [
      { menu: heatmapPeriodMenu, label: heatmapPeriodLabel },
      { menu: heatmapModalPeriodMenu, label: heatmapModalPeriodLabel },
    ];

    function renderMenus() {
      const opts = buildHeatmapPeriodOptions();
      sets.forEach(({ menu }) => {
        menu.innerHTML = opts
          .map(
            (o) =>
              `<li data-value="${o.value}" data-short="${o.short}" class="${o.value === state.heatmapPeriod ? "active" : ""}">${o.label}</li>`
          )
          .join("");
        menu.querySelectorAll("li").forEach((li) => {
          li.addEventListener("click", () => {
            state.heatmapPeriod = li.dataset.value;
            sets.forEach((s) => (s.label.textContent = li.dataset.short));
            renderMenus();
            renderHeatmap();
          });
        });
      });
    }

    renderMenus();
  }

  function openHeatmapModal() {
    heatmapModal.hidden = false;
    renderHeatmap();
  }

  heatmapCanvas.addEventListener("click", openHeatmapModal);
  heatmapCanvas.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openHeatmapModal();
    }
  });

  // ---- Wire up period dropdowns (shared shape, distinct state) ----

  function wirePeriodDropdown(menuEl, labelEl, getValue, setValue, onChange) {
    renderPeriodMenu(menuEl, getValue());
    menuEl.querySelectorAll("li").forEach((li) => {
      li.addEventListener("click", () => {
        setValue(li.dataset.value);
        labelEl.textContent = li.textContent;
        renderPeriodMenu(menuEl, getValue());
        onChange();
      });
    });
  }

  wirePeriodDropdown(
    categoryPeriodMenu,
    categoryPeriodLabel,
    () => state.categoryPeriod,
    (v) => (state.categoryPeriod = v),
    renderCategoryPie
  );
  wireHeatmapPeriodDropdowns();

  // Re-attach date range menu listeners each render since options are rebuilt.
  function renderAll() {
    dateRangeLabel.textContent = getWeekRange(state.weekOffset).label;
    renderDateRangeMenu();
    renderStats();
    renderRecentReports();
  }

  renderAll();
  renderCategoryPie();
  renderHeatmap();

  // ---- Notification bell dropdown ----

  const notifBell = document.getElementById("notifBell");
  const notifDropdown = document.getElementById("notifDropdown");
  if (notifBell && notifDropdown) {
    notifBell.addEventListener("click", (e) => {
      e.stopPropagation();
      notifDropdown.hidden = !notifDropdown.hidden;
    });
    document.addEventListener("click", () => {
      notifDropdown.hidden = true;
    });
  }
});
