// O.R.M.S. — Concerns/Suggestions Dashboard behavior: week filter, status
// filter, pagination, category pie, and an enlargeable heatmap. Mirrors
// reports-dashboard.js but runs against the CONCERNS mock data.

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

  function buildHeatmapPeriodOptions() {
    const opts = [];
    for (let i = 0; i < WEEK_OPTIONS_COUNT; i++) {
      const { label, start } = getWeekRange(i);
      const short = i === 0 ? "This Week" : i === 1 ? "Last Week" : `Week of ${formatConcernDate(start)}`;
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

  // ---- Stats ----

  function countByCategory(concerns) {
    const counts = {};
    CONCERN_CATEGORIES.forEach((c) => (counts[c.name] = 0));
    concerns.forEach((c) => (counts[c.category] = (counts[c.category] || 0) + 1));
    return counts;
  }

  function topCategory(counts) {
    let best = null;
    CONCERN_CATEGORIES.forEach((c) => {
      if (!best || counts[c.name] > counts[best]) best = c.name;
    });
    return best;
  }

  function renderStats() {
    const weekConcerns = getConcernsForWeekOffset(state.weekOffset);
    document.getElementById("statTotal").textContent = weekConcerns.length;

    const weekCounts = countByCategory(weekConcerns);
    document.getElementById("statTopSubject").textContent = weekConcerns.length ? topCategory(weekCounts) : "—";

    const thisMonthCounts = countByCategory(getConcernsForPeriod("month0"));
    const lastMonthCounts = countByCategory(getConcernsForPeriod("month1"));
    let bestCategory = null;
    let bestDelta = -Infinity;
    CONCERN_CATEGORIES.forEach((c) => {
      const delta = (thisMonthCounts[c.name] || 0) - (lastMonthCounts[c.name] || 0);
      if (delta > bestDelta) {
        bestDelta = delta;
        bestCategory = c.name;
      }
    });
    document.getElementById("statTopIncrease").textContent = bestCategory || "—";
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

  const STATUS_FILTER_LABELS = {
    all: "View All Concerns/Suggestions",
    "New Submission": "New Submission",
    "In Folder": "In Folder",
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
    return status === "In Folder" ? "status-pill--resolved" : "status-pill--in-process";
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
          <td>${c.id}</td>
          <td>${c.folder}</td>
          <td>${c.location}</td>
          <td>${c.reporter}</td>
          <td><span class="status-pill ${statusPillClass(c.status)}">${c.status}</span></td>
          <td>${c.dateSubmitted.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}, ${c.dateSubmitted.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</td>
          <td><a class="recent-reports-table__action" href="concern-detail.html?id=${encodeURIComponent(c.id)}" aria-label="View concern ${c.id}">&#8594;</a></td>
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

  // ---- Concerns/Suggestions by Category pie ----

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
    const concerns = getConcernsForPeriod(state.categoryPeriod);
    const total = concerns.length || 1;
    const counts = countByCategory(concerns);

    let cumRaw = 0;
    const stops = [];
    const labels = [];
    CONCERN_CATEGORIES.forEach((c) => {
      const startB = Math.round(cumRaw * 100);
      cumRaw += counts[c.name] / total;
      const endB = Math.round(cumRaw * 100);
      stops.push(`${c.color} ${startB}% ${endB}%`);
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

    categoryLegend.innerHTML = CONCERN_CATEGORIES.map(
      (c) => `<li><span class="pie-legend__dot" style="background:${c.color}"></span>${c.name}</li>`
    ).join("");
  }

  // ---- Concerns/Suggestions heatmap (stylized placeholder, colored by category) ----

  const heatmapPeriodMenu = document.getElementById("heatmapPeriodMenu");
  const heatmapPeriodLabel = document.getElementById("heatmapPeriodLabel");
  const heatmapCanvas = document.getElementById("heatmapCanvas");
  const heatmapCanvasModal = document.getElementById("heatmapCanvasModal");
  const heatmapModal = document.getElementById("heatmapModal");
  const heatmapModalPeriodMenu = document.getElementById("heatmapModalPeriodMenu");
  const heatmapModalPeriodLabel = document.getElementById("heatmapModalPeriodLabel");
  const heatmapLegend = document.getElementById("heatmapLegend");
  const heatmapModalLegend = document.getElementById("heatmapModalLegend");

  const HEATMAP_PATHS = [
    "M30,70 C110,30 170,100 250,60 S350,40 380,80",
    "M25,150 C90,120 150,180 220,140 S320,110 375,160",
    "M55,220 C140,200 190,240 260,210 S345,190 385,230",
    "M20,110 C80,150 140,100 200,130 S300,160 365,120",
    "M45,35 C100,75 160,45 210,85 S300,65 355,45",
    "M65,190 C130,160 170,210 230,180 S325,225 375,195",
  ];

  function renderHeatmapLegend() {
    const html = CONCERN_CATEGORIES.map(
      (c) => `<span><i class="legend-dot" style="background:${c.color}"></i>${c.name}</span>`
    ).join("");
    heatmapLegend.innerHTML = html;
    heatmapModalLegend.innerHTML = html;
  }

  function renderHeatmap() {
    const concerns = getConcernsForPeriod(state.heatmapPeriod);
    const counts = countByCategory(concerns);
    const total = concerns.length || 1;

    let pool = [];
    CONCERN_CATEGORIES.forEach((c) => {
      const weight = Math.max(1, Math.round((counts[c.name] / total) * HEATMAP_PATHS.length));
      for (let k = 0; k < weight; k++) pool.push(c.color);
    });
    while (pool.length < HEATMAP_PATHS.length) pool.push(CONCERN_CATEGORIES[0].color);
    pool = pool.slice(0, HEATMAP_PATHS.length);

    const rng = mulberry32(hashString(state.heatmapPeriod));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const paths = HEATMAP_PATHS.map(
      (d, i) => `<path d="${d}" fill="none" stroke="${pool[i]}" stroke-width="4" stroke-linecap="round" opacity="0.85" />`
    ).join("");
    const svg = `<svg viewBox="0 0 400 260" preserveAspectRatio="none">${paths}</svg>`;

    [heatmapCanvas, heatmapCanvasModal].forEach((canvas) => {
      const oldSvg = canvas.querySelector("svg");
      if (oldSvg) oldSvg.remove();
      canvas.insertAdjacentHTML("beforeend", svg);
    });
  }

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

  // ---- Wire up period dropdowns ----

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

  function renderAll() {
    dateRangeLabel.textContent = getWeekRange(state.weekOffset).label;
    renderDateRangeMenu();
    renderStats();
    renderRecentConcerns();
  }

  renderAll();
  renderHeatmapLegend();
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
