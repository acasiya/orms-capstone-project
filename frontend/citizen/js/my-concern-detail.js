// O.R.M.S. — My Concern/Suggestion detail: fetch the real concern by the ?id= query param.

document.addEventListener("DOMContentLoaded", async () => {
  const id = new URLSearchParams(window.location.search).get("id");
  let concern = null;
  try {
    concern = id ? await getConcernById(id) : null;
  } catch {
    concern = null;
  }

  if (!concern) {
    document.querySelector(".concern-detail__main").innerHTML =
      "<p>Suggestion/Concern not found.</p>";
    return;
  }

  document.title = "Concern/Suggestion — O.R.M.S.";
  document.getElementById("concernLocation").value = concern.location;
  document.getElementById("concernDescription").value = concern.description;
  document.getElementById("timelineDateTime").textContent = new Date(concern.created_at).toLocaleString("en-US", {
    month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
});
