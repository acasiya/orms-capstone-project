// SafeSpace — Ordinances & Resolutions list: type filter, search, paginate,
// render, navigate to detail, plus uploading (the Secretary uploads
// ordinances, the Barangay Treasurer resolutions — see ordinances-data.js's
// managedDocumentKinds).

document.addEventListener("DOMContentLoaded", async () => {
  const tbody = document.getElementById("ordinanceRows");
  const filterField = document.getElementById("filterField");
  const searchInput = document.getElementById("ordinanceSearch");
  const searchForm = document.getElementById("ordinanceSearchForm");
  const paginationInfo = document.getElementById("paginationInfo");
  const pagination = document.getElementById("ordinancesPagination");
  const pageSizeSelect = document.getElementById("ordinancesPageSize");
  const kindFilter = document.getElementById("kindFilter");

  let pageSize = 5;
  let currentPage = 1;
  // Only re-filters on Search (or pressing Enter in the field), not on every
  // keystroke — this tracks the query that was actually searched for, kept
  // separate from whatever's currently typed in the box.
  let appliedQuery = "";
  let appliedField = filterField.value;

  // Search box placeholder follows the selected filter, suggesting example
  // keywords for that field. Author/No./Category examples are pulled from the
  // loaded ordinances so they always match real data; the static lists are
  // just the fallback while loading (or when there's nothing loaded yet).
  const PLACEHOLDER_FALLBACKS = {
    title: ["curfew", "business permit", "garbage"],
    author: ["Hon. Dela Cruz"],
    number: ["No. 1-(2026)"],
    category: ["Public Order", "Business"],
  };

  function placeholderExamples(field) {
    if (field === "title") return PLACEHOLDER_FALLBACKS.title;
    const seen = [];
    for (const o of liveOrdinances()) {
      const value = String(o[field] || "").trim();
      if (value && value.length <= 30 && !seen.includes(value)) seen.push(value);
      if (seen.length === 2) break;
    }
    return seen.length ? seen : PLACEHOLDER_FALLBACKS[field] || [];
  }

  function updateSearchPlaceholder() {
    const examples = placeholderExamples(filterField.value);
    searchInput.placeholder = examples.length ? `e.g. ${examples.join(", ")}` : "Search...";
  }

  filterField.addEventListener("change", updateSearchPlaceholder);
  updateSearchPlaceholder();

  wireFiltersDropdown(document.getElementById("filtersToggleBtn"), document.getElementById("filtersPanel"));

  tbody.innerHTML = `<tr><td colspan="5" class="ordinances-empty">Loading ordinances...</td></tr>`;
  try {
    await ensureOrdinancesLoaded();
    updateSearchPlaceholder();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="ordinances-empty">${err.message}</td></tr>`;
    return;
  }

  // Type filter applies immediately (it's a view choice, not a search).
  function ofSelectedKind() {
    const kind = kindFilter.value;
    return kind === "all" ? liveOrdinances() : liveOrdinances().filter((o) => o.kind === kind);
  }

  function getFiltered() {
    const rows = ofSelectedKind();
    if (!appliedQuery) return rows;
    return rows.filter((o) => String(o[appliedField] || "").toLowerCase().includes(appliedQuery));
  }

  function emptyMessage() {
    const noun = { all: "ordinances or resolutions", ordinance: "ordinances", resolution: "resolutions" }[kindFilter.value];
    return ofSelectedKind().length ? `No ${noun} match your search.` : `No ${noun} uploaded yet.`;
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
      tbody.innerHTML = `<tr><td colspan="5" class="ordinances-empty">${emptyMessage()}</td></tr>`;
    } else {
      tbody.innerHTML = rows
        .map(
          (o) => `
          <tr data-id="${o.id}" tabindex="0">
            <td><span class="doc-kind doc-kind--${o.kind}">${o.kindLabel}</span></td>
            <td>${escapeHtml(o.number)}</td>
            <td>${escapeHtml(o.dateApprovedRaw)}</td>
            <td><span class="ordinance-name">${escapeHtml(o.title)}</span></td>
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

  kindFilter.addEventListener("change", () => {
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

  // ---- Upload FAB ----
  // Only for whoever manages a kind: Secretary (ordinances) and Barangay
  // Treasurer (resolutions); everyone else with access here views only (the
  // server enforces this too — see OrdinanceListCreateView). Links to
  // upload-ordinance.html, which files the uploader's own kind.
  const kinds = managedDocumentKinds(getAdminUser());
  const uploadBtn = document.getElementById("uploadOrdinanceBtn");
  uploadBtn.hidden = !kinds.length;
  if (kinds.length === 1) {
    const label = `Upload ${DOCUMENT_KIND_LABELS[kinds[0]]}`;
    uploadBtn.title = label;
    uploadBtn.setAttribute("aria-label", label);
  }
});
