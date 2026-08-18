// O.R.M.S. — My Concern/Suggestion detail: populate the page from the ?id= query param.

document.addEventListener("DOMContentLoaded", () => {
  const id = new URLSearchParams(window.location.search).get("id");
  const concern = MY_CONCERNS.find((c) => c.id === id);

  if (!concern) {
    document.querySelector(".concern-detail__main").innerHTML =
      "<p>Suggestion/Concern not found.</p>";
    return;
  }

  document.title = `${concern.title} — O.R.M.S.`;
  document.getElementById("concernLocation").value = concern.location;
  document.getElementById("concernDescription").value = concern.description;
  document.getElementById("timelineDateTime").textContent =
    `${concern.timelineDate}, ${concern.timelineTime}`;
});
