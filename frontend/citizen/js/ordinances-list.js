// SafeSpace — Ordinances list: filter, search, sort, paginate, render, and navigate to detail.

document.addEventListener("DOMContentLoaded", async () => {
  const tbody = document.getElementById("ordinanceRows");
  const filterField = document.getElementById("filterField");
  const searchInput = document.getElementById("ordinanceSearch");
  const searchForm = document.getElementById("ordinanceSearchForm");
  const paginationInfo = document.getElementById("paginationInfo");
  const pagination = document.getElementById("ordinancesPagination");

  const PAGE_SIZE = 5;
  let currentPage = 1;
  // Only re-filters on Search (or pressing Enter in the field), not on every
  // keystroke — this tracks the query that was actually searched for, kept
  // separate from whatever's currently typed in the box.
  let appliedQuery = "";
  let appliedField = filterField.value;

  tbody.innerHTML = `<tr><td colspan="4" class="ordinances-empty">Loading ordinances...</td></tr>`;
  try {
    await ensureOrdinancesLoaded();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="ordinances-empty">${err.message}</td></tr>`;
    return;
  }

  function getFiltered() {
    if (!appliedQuery) return liveOrdinances();
    return liveOrdinances().filter((o) => String(o[appliedField] || "").toLowerCase().includes(appliedQuery));
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function render() {
    const allRows = getFiltered();
    const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, totalPages);

    const start = (currentPage - 1) * PAGE_SIZE;
    const rows = allRows.slice(start, start + PAGE_SIZE);

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="ordinances-empty">${
        liveOrdinances().length ? "No ordinances match your search." : "No ordinances uploaded yet."
      }</td></tr>`;
    } else {
      tbody.innerHTML = rows
        .map(
          (o) => `
          <tr data-id="${o.id}" tabindex="0">
            <td data-label="Ordinance Name"><span class="ordinance-name">${escapeHtml(o.title)}</span></td>
            <td data-label="Author">${escapeHtml(o.author)}</td>
            <td data-label="Ordinance No.">${escapeHtml(o.number)}</td>
            <td data-label="Date Approved">${escapeHtml(o.dateApproved)}</td>
          </tr>`
        )
        .join("");

      tbody.querySelectorAll("tr[data-id]").forEach((row) => {
        const goToDetail = () => {
          window.location.href = `ordinance-detail.html?id=${encodeURIComponent(row.dataset.id)}`;
        };
        row.addEventListener("click", goToDetail);
        row.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            goToDetail();
          }
        });
      });
    }

    paginationInfo.textContent = allRows.length
      ? `Showing ${start + 1} to ${Math.min(start + PAGE_SIZE, allRows.length)} of ${allRows.length} entries`
      : "Showing 0 entries";
    renderPaginationControls(pagination, currentPage, totalPages, (n) => {
      currentPage = n;
      render();
    });
  }

  // Only actually filters when Search is pressed (or Enter in the field) —
  // not on every keystroke — and only searches whichever single field is
  // selected, not every column at once.
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    appliedField = filterField.value;
    appliedQuery = searchInput.value.trim().toLowerCase();
    currentPage = 1;
    render();
  });

  render();
});
