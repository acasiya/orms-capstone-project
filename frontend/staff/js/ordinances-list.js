// SafeSpace — Ordinances list: filter, search, sort, paginate, render,
// navigate to detail, plus (Staff/Admin only) uploading a new ordinance.

document.addEventListener("DOMContentLoaded", async () => {
  const tbody = document.getElementById("ordinanceRows");
  const filterField = document.getElementById("filterField");
  const searchInput = document.getElementById("ordinanceSearch");
  const searchForm = document.getElementById("ordinanceSearchForm");
  const paginationInfo = document.getElementById("paginationInfo");
  const pagination = document.getElementById("ordinancesPagination");
  const pageSizeSelect = document.getElementById("ordinancesPageSize");

  let pageSize = 5;
  let currentPage = 1;
  // Only re-filters on Search (or pressing Enter in the field), not on every
  // keystroke — this tracks the query that was actually searched for, kept
  // separate from whatever's currently typed in the box.
  let appliedQuery = "";
  let appliedField = filterField.value;

  tbody.innerHTML = `<tr><td colspan="6" class="ordinances-empty">Loading ordinances...</td></tr>`;
  try {
    await ensureOrdinancesLoaded();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="ordinances-empty">${err.message}</td></tr>`;
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
    const totalPages = Math.max(1, Math.ceil(allRows.length / pageSize));
    currentPage = Math.min(currentPage, totalPages);

    const start = (currentPage - 1) * pageSize;
    const rows = allRows.slice(start, start + pageSize);

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="ordinances-empty">${
        liveOrdinances().length ? "No ordinances match your search." : "No ordinances uploaded yet."
      }</td></tr>`;
    } else {
      tbody.innerHTML = rows
        .map(
          (o) => `
          <tr data-id="${o.id}" tabindex="0">
            <td><span class="ordinance-name">${escapeHtml(o.title)}</span></td>
            <td>${escapeHtml(o.author)}</td>
            <td>${escapeHtml(o.number)}</td>
            <td>${escapeHtml(o.dateApproved)}</td>
            <td>${escapeHtml(o.uploadedBy || "—")}</td>
            <td>${
              o.isArchived
                ? `<span class="status-badge status-badge--submitted">Archived</span>`
                : `<span class="status-badge status-badge--resolved">Active</span>`
            }</td>
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
      ? `Showing ${start + 1} to ${Math.min(start + pageSize, allRows.length)} of ${allRows.length} entries`
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

  if (pageSizeSelect) {
    pageSizeSelect.addEventListener("change", () => {
      pageSize = Number(pageSizeSelect.value);
      currentPage = 1;
      render();
    });
  }

  render();

  // ---- Upload Ordinance FAB ----
  // Ordinances is a full-edit section for the Secretary — Barangay Captain
  // (the only other role with nav access to this page) only gets to view it
  // (see OrdinanceListCreateView's IsSecretaryOrAdmin check on POST). The
  // FAB itself now just links to upload-ordinance.html — see that page's
  // own JS for the actual upload form.
  const currentUser = getAdminUser();
  const isSecretary = currentUser && currentUser.position === "Secretary";
  document.getElementById("uploadOrdinanceBtn").hidden = !isSecretary;
});
