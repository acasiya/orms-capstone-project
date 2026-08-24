// O.R.M.S. — Concerns/Suggestions list: search, status filter, and
// pagination across real concerns from concerns-data.js
// (GET /api/concerns/staff/). Replaces the previous folder-based browsing —
// there's no backend folder concept (see concerns-data.js).

document.addEventListener("DOMContentLoaded", async () => {
  const PAGE_SIZE = 9;

  const searchForm = document.getElementById("concernSearchForm");
  const searchInput = document.getElementById("concernSearchInput");
  const statusFilter = document.getElementById("statusFilter");
  const list = document.getElementById("concernsList");
  const pagination = document.getElementById("concernsPagination");

  let page = 1;

  list.innerHTML = `<div class="ordinances-empty">Loading concerns/suggestions...</div>`;
  try {
    await ensureConcernsLoaded();
  } catch (err) {
    list.innerHTML = `<div class="ordinances-empty">${err.message}</div>`;
    return;
  }

  const badgeClass = {
    Submitted: "status-badge--submitted",
    Resolved: "status-badge--resolved",
  };

  function truncate(text, max) {
    return text.length > max ? `${text.slice(0, max)}…` : text;
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

  function getFiltered() {
    let rows = liveConcerns();
    if (statusFilter.value !== "all") {
      rows = rows.filter((c) => c.status === statusFilter.value);
    }
    const query = searchInput.value.trim().toLowerCase();
    if (query) {
      rows = rows.filter(
        (c) =>
          c.concernText.toLowerCase().includes(query) ||
          (c.location && c.location.toLowerCase().includes(query)) ||
          c.reporter.toLowerCase().includes(query)
      );
    }
    return rows;
  }

  function render() {
    const rows = getFiltered();
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    page = Math.min(page, totalPages);
    const start = (page - 1) * PAGE_SIZE;
    const pageRows = rows.slice(start, start + PAGE_SIZE);

    list.innerHTML = pageRows.length
      ? pageRows
          .map(
            (c) => `
        <div class="concern-row">
          <span class="concern-row__title">${truncate(c.concernText, 60)}</span>
          <span class="concern-row__date">${formatConcernDate(c.dateSubmitted)}</span>
          <a class="concern-row__link" href="concern-detail.html?id=${encodeURIComponent(c.id)}">View Details</a>
          <span class="status-badge ${badgeClass[c.status] || ""}">${c.status}</span>
        </div>`
          )
          .join("")
      : `<div class="ordinances-empty">${liveConcerns().length ? "No concerns/suggestions match your search or filter." : "No concerns/suggestions submitted yet."}</div>`;

    const pages = buildPageList(page, totalPages);
    let html = `<button type="button" data-page="prev" ${page <= 1 ? "disabled" : ""} aria-label="Previous page">&#8249;</button>`;
    pages.forEach((p) => {
      html +=
        p === "..."
          ? `<span class="dash-pagination__ellipsis">&hellip;</span>`
          : `<button type="button" data-page="${p}" class="${p === page ? "active" : ""}">${p}</button>`;
    });
    html += `<button type="button" data-page="next" ${page >= totalPages ? "disabled" : ""} aria-label="Next page">&#8250;</button>`;
    pagination.innerHTML = html;

    pagination.querySelectorAll("button[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.page;
        page = val === "prev" ? page - 1 : val === "next" ? page + 1 : Number(val);
        render();
      });
    });
  }

  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    page = 1;
    render();
  });
  searchInput.addEventListener("input", () => {
    page = 1;
    render();
  });
  statusFilter.addEventListener("change", () => {
    page = 1;
    render();
  });

  render();
});
