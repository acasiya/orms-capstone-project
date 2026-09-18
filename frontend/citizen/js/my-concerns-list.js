// SafeSpace — My Concerns/Suggestions: render + filter the citizen's
// submitted list by status, paginated. Data comes from the real API (see
// my-concerns-data.js) instead of a hardcoded array, so this file is async
// where it fetches concerns.

document.addEventListener("DOMContentLoaded", async () => {
  let pageSize = 5;

  const list = document.getElementById("concernsList");
  const statusFilter = document.getElementById("statusFilter");
  const pagination = document.getElementById("concernsPagination");
  const pageSizeSelect = document.getElementById("concernsPageSize");

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  // There's no separate title/category field on Submit Suggestion — it's
  // just a free-text description — so the list row's "title" is a
  // truncated snippet of that text, same idea as an email client deriving
  // a preview line when there's no subject.
  function titleFor(description) {
    return description.length > 60 ? `${description.slice(0, 60)}…` : description;
  }

  let concerns = [];
  let page = 1;
  // Resolved concerns are hidden until the citizen actually picks a filter
  // themselves — even re-selecting "All" counts, since that's an explicit
  // "yes, show everything" action. Only the untouched initial load (which
  // happens to also show "All" selected) excludes Resolved by default.
  let filterTouched = false;

  function getFiltered() {
    const filterValue = statusFilter.value;
    return concerns.filter((c) => {
      const label = c.status === "resolved" ? "Resolved" : "Submitted";
      if (!filterTouched && filterValue === "All") return label !== "Resolved";
      return filterValue === "All" || label === filterValue;
    });
  }

  function render() {
    const rows = getFiltered();
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    page = Math.min(page, totalPages);
    const start = (page - 1) * pageSize;
    const pageRows = rows.slice(start, start + pageSize);

    list.innerHTML = pageRows.length
      ? pageRows
          .map(
            (c) => `
      <div class="concern-row">
        <span class="concern-row__title">${titleFor(c.description)}</span>
        <span class="concern-row__date">${formatDate(c.created_at)}</span>
        <a class="concern-row__link" href="my-concern-detail.html?id=${encodeURIComponent(c.id)}">View Details</a>
        <span class="status-badge ${c.status === "resolved" ? "status-badge--resolved" : "status-badge--submitted"}">${c.status === "resolved" ? "Resolved" : "Submitted"}</span>
      </div>`
          )
          .join("")
      : `<div class="ordinances-empty">${concerns.length ? "No concerns/suggestions match this status." : "You haven't submitted any concerns or suggestions yet."}</div>`;

    if (pagination) {
      renderPaginationControls(pagination, page, totalPages, (n) => {
        page = n;
        render();
      });
    }
  }

  statusFilter.addEventListener("change", () => {
    filterTouched = true;
    page = 1;
    render();
  });

  if (pageSizeSelect) {
    pageSizeSelect.addEventListener("change", () => {
      pageSize = Number(pageSizeSelect.value);
      page = 1;
      render();
    });
  }

  list.innerHTML = `<div class="ordinances-empty">Loading your concerns/suggestions...</div>`;
  try {
    concerns = await getMyConcerns();
    render();
  } catch (err) {
    list.innerHTML = `<div class="ordinances-empty">${err.message}</div>`;
  }
});
