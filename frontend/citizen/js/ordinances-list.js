// O.R.M.S. — Ordinances list: filter, search, sort, paginate, render, and navigate to detail.

document.addEventListener("DOMContentLoaded", async () => {
  const tbody = document.getElementById("ordinanceRows");
  const sortSelect = document.getElementById("sortField");
  const searchInput = document.getElementById("ordinanceSearch");
  const searchForm = document.getElementById("ordinanceSearchForm");
  const paginationInfo = document.getElementById("paginationInfo");
  const paginationPrev = document.getElementById("paginationPrev");
  const paginationNext = document.getElementById("paginationNext");

  const PAGE_SIZE = 5;
  let currentPage = 1;

  tbody.innerHTML = `<tr><td colspan="4" class="ordinances-empty">Loading ordinances...</td></tr>`;
  try {
    await ensureOrdinancesLoaded();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="ordinances-empty">${err.message}</td></tr>`;
    return;
  }

  function getFiltered() {
    const query = searchInput.value.trim().toLowerCase();

    return liveOrdinances().filter((o) => {
      return (
        !query ||
        o.title.toLowerCase().includes(query) ||
        o.author.toLowerCase().includes(query) ||
        o.number.toLowerCase().includes(query)
      );
    });
  }

  function getSorted(list) {
    const sortKey = sortSelect.value;
    if (sortKey === "none") return list;
    return [...list].sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return -1;
      if (av > bv) return 1;
      return 0;
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function render() {
    const allRows = getSorted(getFiltered());
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
    paginationPrev.disabled = currentPage <= 1;
    paginationNext.disabled = currentPage >= totalPages;
  }

  sortSelect.addEventListener("change", () => {
    currentPage = 1;
    render();
  });
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    currentPage = 1;
    render();
  });
  searchInput.addEventListener("input", () => {
    currentPage = 1;
    render();
  });
  paginationPrev.addEventListener("click", () => {
    currentPage -= 1;
    render();
  });
  paginationNext.addEventListener("click", () => {
    currentPage += 1;
    render();
  });

  render();
});
