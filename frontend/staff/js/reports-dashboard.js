// SafeSpace — Reports Dashboard: a single date-range filter drives every
// card (stats, heatmap, category pie, status chart, investigator chart) —
// all real, from reports-data.js's API-backed data (category comes from
// matching each report's ordinance against the real uploaded ordinances —
// see reports-data.js's categoryForOrdinance). The heatmap is a Leaflet +
// OpenStreetMap density map keyed on each report's street (geocoded to a
// centroid in street-coordinates.js) — see js/heatmap.js.

document.addEventListener("DOMContentLoaded", async () => {
  const MONTHS_BACK_COUNT = 5;
  const QUARTERS_BACK_COUNT = 3;
  const YEARS_BACK_COUNT = 2;
  const CATEGORY_COLOR_PALETTE = [
    "#5b7fd1", "#2fd6c4", "#d13ec4", "#e8a33d",
    "#6fcf5b", "#e85b5b", "#8a6fd1", "#3ba3c9",
  ];

  // A single period drives every card on the dashboard — the stats,
  // heatmap, and all three charts — so the top date-range dropdown filters
  // the whole page instead of each card tracking its own period.
  const state = {
    period: "week",
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
    for (let q = 0; q <= QUARTERS_BACK_COUNT; q++) {
      const { quarter, year } = getQuarterRange(q);
      opts.push({ value: `quarter${q}`, label: q === 0 ? `This Quarter (Q${quarter} ${year})` : `Q${quarter} ${year}` });
    }
    for (let y = 0; y <= YEARS_BACK_COUNT; y++) {
      const { year } = getYearRange(y);
      opts.push({ value: `year${y}`, label: y === 0 ? `This Year (${year})` : `${year}` });
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

  // The comparison period for a delta — one week/month/quarter/year further
  // back than the selected one. "all" has no previous period to compare
  // against.
  function getPreviousPeriodValue(period) {
    if (period === "week") return "week1";
    const match = period.match(/^(week|month|quarter|year)(\d+)$/);
    if (!match) return null;
    return `${match[1]}${Number(match[2]) + 1}`;
  }

  function periodDeltaSuffix(period) {
    if (period.startsWith("week")) return "vs last week";
    if (period.startsWith("month")) return "vs last month";
    if (period.startsWith("quarter")) return "vs last quarter";
    if (period.startsWith("year")) return "vs last year";
    return "";
  }

  function deltaText(cur, prev, suffix) {
    let pct;
    if (prev === 0) pct = cur === 0 ? 0 : 100;
    else pct = Math.round(((cur - prev) / prev) * 100);
    const arrow = pct >= 0 ? "↗" : "↘";
    return { text: `${arrow} ${Math.abs(pct)}% ${suffix}`, isDown: pct < 0 };
  }

  function setStat(valueId, deltaId, cur, prev, suffix) {
    document.getElementById(valueId).textContent = cur;
    const deltaEl = document.getElementById(deltaId);
    if (prev === null) {
      deltaEl.textContent = "";
      deltaEl.classList.remove("stat-card__delta--down");
      return;
    }
    const { text, isDown } = deltaText(cur, prev, suffix);
    deltaEl.textContent = text;
    deltaEl.classList.toggle("stat-card__delta--down", isDown);
  }

  function renderStats() {
    const cur = computeStats(getReportsForPeriod(state.period));
    const prevPeriod = getPreviousPeriodValue(state.period);
    const prev = prevPeriod ? computeStats(getReportsForPeriod(prevPeriod)) : null;
    const suffix = periodDeltaSuffix(state.period);
    setStat("statTotal", "statTotalDelta", cur.total, prev && prev.total, suffix);
    setStat("statNew", "statNewDelta", cur.new, prev && prev.new, suffix);
    setStat("statProcess", "statProcessDelta", cur.process, prev && prev.process, suffix);
    setStat("statResolved", "statResolvedDelta", cur.resolved, prev && prev.resolved, suffix);
    setStat("statRemarks", "statRemarksDelta", cur.remarks, prev && prev.remarks, suffix);
  }

  // ---- Date range dropdown (drives the whole dashboard) ----

  const dateRangeLabel = document.getElementById("dateRangeLabel");
  const dateRangeMenu = document.getElementById("dateRangeMenu");

  function currentPeriodLabel() {
    const opt = buildPeriodOptions().find((o) => o.value === state.period);
    return opt ? opt.label : "";
  }

  function renderDateRangeMenu() {
    dateRangeMenu.innerHTML = buildPeriodOptions()
      .map((o) => `<li data-value="${o.value}" class="${o.value === state.period ? "active" : ""}">${o.label}</li>`)
      .join("");
    dateRangeMenu.querySelectorAll("li").forEach((li) => {
      li.addEventListener("click", () => {
        state.period = li.dataset.value;
        renderAll();
      });
    });
  }

  // ---- Reports by Category pie ----

  const categoryPie = document.getElementById("categoryPie");
  const categoryLegend = document.getElementById("categoryLegend");

  function renderCategoryPie() {
    categoryPie.querySelectorAll(".pie-chart__label, .pie-chart__empty").forEach((el) => el.remove());

    const reports = getReportsForPeriod(state.period);
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

  // ---- Reports by Status bar chart ----

  const statusBarChart = document.getElementById("statusBarChart");

  const STATUS_BAR_DEFS = [
    { key: "new", label: "New Submission", modifier: "new" },
    { key: "process", label: "Under Review", modifier: "process" },
    { key: "remarks", label: "In Action", modifier: "remarks" },
    { key: "resolved", label: "Resolved", modifier: "resolved" },
  ];
  const MAX_BAR_HEIGHT = 168; // px — leaves room for the count label above it

  function renderStatusChart() {
    const stats = computeStats(getReportsForPeriod(state.period));
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

  // ---- Investigator Performance bar chart (Barangay Captain only — this
  // whole dashboard is Captain-only, see admin.js's STAFF_NAV_ACCESS) ----
  // Counts how many reports each Investigator currently has claimed (see
  // reports-data.js's assignedInvestigator) within the selected period —
  // built from whichever Investigators show up claiming a report, since
  // there's no separate "list every Investigator" endpoint available here.

  const investigatorBarChart = document.getElementById("investigatorBarChart");
  const INVESTIGATOR_BAR_COLORS = [
    "#5b7fd1", "#2fd6c4", "#d13ec4", "#e8a33d",
    "#6fcf5b", "#e85b5b", "#8a6fd1", "#3ba3c9",
  ];

  function renderInvestigatorChart() {
    const reports = getReportsForPeriod(state.period).filter((r) => r.assignedInvestigator);
    const counts = {};
    reports.forEach((r) => {
      counts[r.assignedInvestigator] = (counts[r.assignedInvestigator] || 0) + 1;
    });
    const names = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

    if (!names.length) {
      investigatorBarChart.innerHTML = `<div class="status-bar-chart__empty">No claimed reports for this period.</div>`;
      return;
    }

    const maxCount = Math.max(...names.map((n) => counts[n]), 1);
    investigatorBarChart.innerHTML = names
      .map((name, i) => {
        const count = counts[name];
        const height = Math.max(Math.round((count / maxCount) * MAX_BAR_HEIGHT), 6);
        const color = INVESTIGATOR_BAR_COLORS[i % INVESTIGATOR_BAR_COLORS.length];
        return `
        <div class="status-bar-chart__col">
          <span class="status-bar-chart__count">${count}</span>
          <div class="status-bar-chart__bar" style="height:${height}px;background:${color}"></div>
          <span class="status-bar-chart__label">${name}</span>
        </div>`;
      })
      .join("");
  }

  // ---- Oldest Open Reports (aging list) ----
  //
  // Deliberately NOT filtered by state.period — an old report shouldn't
  // vanish from this list just because the selected date range has moved
  // past its submission date. Report has no resolved_at (see reports/
  // models.py), so "days open" is measured from created_at to now for
  // anything not yet Resolved, which is the closest honest proxy available.
  const AGING_LIST_LIMIT = 8;
  const agingReportsBody = document.getElementById("agingReportsBody");

  function daysBetween(from, to) {
    return Math.max(0, Math.floor((to - from) / (1000 * 60 * 60 * 24)));
  }

  function renderAgingReports() {
    if (!agingReportsBody) return;
    const now = new Date();
    const open = liveReports()
      .filter((r) => r.status !== "Resolved")
      .slice()
      .sort((a, b) => a.dateSubmitted - b.dateSubmitted)
      .slice(0, AGING_LIST_LIMIT);

    agingReportsBody.innerHTML = open.length
      ? open
          .map((r) => {
            const days = daysBetween(r.dateSubmitted, now);
            return `
        <tr>
          <td>${r.id.slice(0, 8).toUpperCase()}</td>
          <td>${r.ordinance || "—"}</td>
          <td>${r.location || "—"}</td>
          <td>${days} ${days === 1 ? "day" : "days"}</td>
          <td><span class="status-pill ${statusPillClass(r.status)}">${r.status}</span></td>
          <td>${r.assignedInvestigator || "Unclaimed"}</td>
          <td><a class="recent-reports-table__action" href="report-detail.html?id=${encodeURIComponent(r.id)}" aria-label="View report">&#8594;</a></td>
        </tr>`;
          })
          .join("")
      : `<tr><td colspan="7" class="ordinances-empty">Nothing open — every report has been resolved.</td></tr>`;
  }

  function statusPillClass(status) {
    if (status === "Resolved") return "status-pill--resolved";
    if (status === "Under Review") return "status-pill--in-process";
    if (status === "In Action") return "status-pill--remarks";
    return "status-pill--new";
  }

  // ---- Incident heatmap (real Leaflet + OpenStreetMap density map) ----
  //
  // Intensity = number of reports per street for the selected period, placed
  // at that street's centroid (street-coordinates.js). The small card is a
  // static map that opens the enlarged, pannable/zoomable modal on click.

  const heatmapCanvasEl = document.getElementById("heatmapCanvas");
  const heatmapModal = document.getElementById("heatmapModal");
  const heatmapCanvasModalEl = document.getElementById("heatmapCanvasModal");

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

    const heatmapCounts = () => countByLocation(getReportsForPeriod(state.period));

    renderHeatmaps = () => {
      const counts = heatmapCounts();
      const unmapped = cardHeatmap.render(counts) || [];
      if (modalHeatmap) modalHeatmap.render(counts);
      if (unmapped.length) {
        console.warn("[heatmap] reports on streets with no known coordinates:", unmapped);
      }
    };

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

  // ---- Wire up — one period, every card ----

  function renderAll() {
    dateRangeLabel.textContent = currentPeriodLabel();
    renderDateRangeMenu();
    renderStats();
    renderCategoryPie();
    renderStatusChart();
    renderInvestigatorChart();
    renderHeatmaps();
    renderAgingReports();
  }

  // Deferred two frames, same as setupHeatmap()'s own first paint above —
  // at DOMContentLoaded the heatmap card hasn't been laid out yet, so
  // calling renderHeatmaps() (via renderAll) synchronously here would
  // measure its canvas at 0×0. Later calls (dropdown selection) run
  // renderAll() directly since layout is already settled by then.
  requestAnimationFrame(() => requestAnimationFrame(renderAll));
});
