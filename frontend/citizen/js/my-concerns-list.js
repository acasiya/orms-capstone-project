// O.R.M.S. — My Concerns/Suggestions: render the citizen's submitted list.
// Data now comes from the real API (see my-concerns-data.js) instead of a
// hardcoded array, so this file is async where it fetches concerns.

document.addEventListener("DOMContentLoaded", async () => {
  const list = document.getElementById("concernsList");

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

  list.innerHTML = `<div class="ordinances-empty">Loading your concerns/suggestions...</div>`;
  try {
    const concerns = await getMyConcerns();
    list.innerHTML = concerns.length
      ? concerns
          .map(
            (c) => `
      <div class="concern-row">
        <span class="concern-row__title">${titleFor(c.description)}</span>
        <span class="concern-row__date">${formatDate(c.created_at)}</span>
        <a class="concern-row__link" href="my-concern-detail.html?id=${encodeURIComponent(c.id)}">View Details</a>
        <span class="status-badge status-badge--submitted">${c.status === "resolved" ? "Resolved" : "Submitted"}</span>
      </div>`
          )
          .join("")
      : `<div class="ordinances-empty">You haven't submitted any concerns or suggestions yet.</div>`;
  } catch (err) {
    list.innerHTML = `<div class="ordinances-empty">${err.message}</div>`;
  }
});
