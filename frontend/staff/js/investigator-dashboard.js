// SafeSpace — Investigator Dashboard: a personal worklist, not an oversight
// view (that's the Captain's Reports Dashboard) — everything here is scoped
// to reports the signed-in Investigator has claimed, plus the size of the
// shared unclaimed queue. No date-range filter: this is "what's on my plate
// right now," not a historical trend.

document.addEventListener("DOMContentLoaded", async () => {
  const AGING_LIST_LIMIT = 8;
  const MAX_BAR_HEIGHT = 168; // px — matches reports-dashboard.js's status chart

  const dashboardMain = document.querySelector(".admin-content");
  const currentUser = getAdminUser();

  const welcomeTitle = document.querySelector(".dash-header__title");
  if (welcomeTitle) {
    welcomeTitle.textContent = `Welcome back, ${(currentUser && currentUser.name) || "Staff"}!`;
  }

  try {
    await ensureReportsLoaded();
  } catch (err) {
    if (dashboardMain) {
      dashboardMain.innerHTML = `<div class="ordinances-empty">${err.message}</div>`;
    }
    return;
  }

  function statusPillClass(status) {
    if (status === "Resolved") return "status-pill--resolved";
    if (status === "Under Review") return "status-pill--in-process";
    if (status === "In Action") return "status-pill--remarks";
    return "status-pill--new";
  }

  function daysBetween(from, to) {
    return Math.max(0, Math.floor((to - from) / (1000 * 60 * 60 * 24)));
  }

  const myId = currentUser && currentUser.id;
  const myReports = () => liveReports().filter((r) => r.assignedInvestigatorId === myId);
  const unclaimedReports = () => liveReports().filter((r) => !r.assignedInvestigatorId && r.status !== "Resolved");

  // ---- Stat cards ----

  function renderStats() {
    const mine = myReports();
    const active = mine.filter((r) => r.status !== "Resolved");
    const resolved = mine.filter((r) => r.status === "Resolved");

    document.getElementById("statMyActive").textContent = active.length;
    document.getElementById("statMyResolved").textContent = resolved.length;
    document.getElementById("statUnclaimed").textContent = unclaimedReports().length;

    const oldest = active.slice().sort((a, b) => a.dateSubmitted - b.dateSubmitted)[0];
    document.getElementById("statOldestCase").textContent = oldest
      ? `${daysBetween(oldest.dateSubmitted, new Date())} days`
      : "—";
  }

  // ---- My Reports by Status ----

  const STATUS_BAR_DEFS = [
    { label: "New Submission", modifier: "new" },
    { label: "Under Review", modifier: "process" },
    { label: "In Action", modifier: "remarks" },
    { label: "Resolved", modifier: "resolved" },
  ];

  function renderStatusChart() {
    const chart = document.getElementById("myStatusBarChart");
    const mine = myReports();
    if (!mine.length) {
      chart.innerHTML = `<div class="status-bar-chart__empty">You haven't claimed any reports yet.</div>`;
      return;
    }

    const counts = { "New Submission": 0, "Under Review": 0, "In Action": 0, Resolved: 0 };
    mine.forEach((r) => {
      if (counts[r.status] !== undefined) counts[r.status]++;
    });
    const maxCount = Math.max(...Object.values(counts), 1);

    chart.innerHTML = STATUS_BAR_DEFS.map(({ label, modifier }) => {
      const count = counts[label];
      const height = Math.max(Math.round((count / maxCount) * MAX_BAR_HEIGHT), count > 0 ? 6 : 2);
      return `
        <div class="status-bar-chart__col">
          <span class="status-bar-chart__count">${count}</span>
          <div class="status-bar-chart__bar status-bar-chart__bar--${modifier}" style="height:${height}px"></div>
          <span class="status-bar-chart__label">${label}</span>
        </div>`;
    }).join("");
  }

  // ---- Oldest Open Reports (mine) ----

  function renderAgingList() {
    const body = document.getElementById("myAgingReportsBody");
    const now = new Date();
    const open = myReports()
      .filter((r) => r.status !== "Resolved")
      .slice()
      .sort((a, b) => a.dateSubmitted - b.dateSubmitted)
      .slice(0, AGING_LIST_LIMIT);

    body.innerHTML = open.length
      ? open
          .map((r) => {
            const days = daysBetween(r.dateSubmitted, now);
            return `
        <tr>
          <td>${r.id.slice(0, 8).toUpperCase()}</td>
          <td>${r.location || "—"}</td>
          <td>${days} ${days === 1 ? "day" : "days"}</td>
          <td><span class="status-pill ${statusPillClass(r.status)}">${r.status}</span></td>
          <td><a class="recent-reports-table__action" href="report-detail.html?id=${encodeURIComponent(r.id)}" aria-label="View report">&#8594;</a></td>
        </tr>`;
          })
          .join("")
      : `<tr><td colspan="5" class="ordinances-empty">Nothing open on your plate right now.</td></tr>`;
  }

  renderStats();
  renderStatusChart();
  renderAgingList();
});
