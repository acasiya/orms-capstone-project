// SafeSpace — shared pagination controls: First/Prev/[page numbers with
// ellipsis]/Next/Last, plus a "Page X of Y" button that prompts for a
// specific page to jump to. Used by every paginated list on this portal.

function buildPageNumberList(current, total) {
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

// container: element to render the controls into.
// page/totalPages: current pagination state (1-indexed).
// goToPage(n): callback that changes to page n and re-renders.
function renderPaginationControls(container, page, totalPages, goToPage) {
  const safeTotal = Math.max(1, totalPages);
  const pages = buildPageNumberList(page, safeTotal);

  let html = `<button type="button" data-goto="first" ${page <= 1 ? "disabled" : ""} aria-label="First page">&#171;</button>`;
  html += `<button type="button" data-goto="prev" ${page <= 1 ? "disabled" : ""} aria-label="Previous page">&#8249;</button>`;
  pages.forEach((p) => {
    html +=
      p === "..."
        ? `<span class="dash-pagination__ellipsis">&hellip;</span>`
        : `<button type="button" data-goto="${p}" class="${p === page ? "active" : ""}">${p}</button>`;
  });
  html += `<button type="button" data-goto="next" ${page >= safeTotal ? "disabled" : ""} aria-label="Next page">&#8250;</button>`;
  html += `<button type="button" data-goto="last" ${page >= safeTotal ? "disabled" : ""} aria-label="Last page">&#187;</button>`;
  html += `<button type="button" class="pagination-jump-btn" data-goto="jump">Page ${page} of ${safeTotal}</button>`;
  container.innerHTML = html;

  container.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = btn.dataset.goto;
      if (val === "jump") {
        const input = window.prompt(`Go to page (1-${safeTotal}):`, String(page));
        if (input === null) return;
        const n = Number(input);
        if (!Number.isInteger(n) || n < 1 || n > safeTotal) {
          alert(`Please enter a whole number between 1 and ${safeTotal}.`);
          return;
        }
        goToPage(n);
        return;
      }
      if (val === "first") return goToPage(1);
      if (val === "prev") return goToPage(page - 1);
      if (val === "next") return goToPage(page + 1);
      if (val === "last") return goToPage(safeTotal);
      goToPage(Number(val));
    });
  });
}
