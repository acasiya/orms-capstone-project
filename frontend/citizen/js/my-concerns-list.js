// O.R.M.S. — My Concerns/Suggestions: render the citizen's submitted list.

document.addEventListener("DOMContentLoaded", () => {
  const list = document.getElementById("concernsList");

  list.innerHTML = MY_CONCERNS.map(
    (c) => `
    <div class="concern-row">
      <span class="concern-row__title">${c.title}</span>
      <span class="concern-row__date">${c.dateSubmitted}</span>
      <a class="concern-row__link" href="my-concern-detail.html?id=${encodeURIComponent(c.id)}">View Details</a>
      <span class="status-badge status-badge--submitted">${c.status}</span>
    </div>`
  ).join("");
});
