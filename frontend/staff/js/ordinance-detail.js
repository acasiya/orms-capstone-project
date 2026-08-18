// O.R.M.S. — Ordinance detail: populate the page from the ?id= query param.

document.addEventListener("DOMContentLoaded", () => {
  const id = new URLSearchParams(window.location.search).get("id");
  const ordinance = ORDINANCES.find((o) => o.id === id);

  if (!ordinance) {
    document.getElementById("detailTitle").textContent = "Ordinance not found";
    document.getElementById("detailBody").hidden = true;
    return;
  }

  document.title = `${ordinance.number} — O.R.M.S.`;
  document.getElementById("detailTitle").textContent = `City Ordinance ${ordinance.number}`;
  document.getElementById("detailAuthor").textContent = ordinance.author;
  document.getElementById("detailDate").textContent = ordinance.dateApproved;
  document.getElementById("detailOrdinanceTitle").textContent = ordinance.title;

  const descriptionEl = document.getElementById("detailDescription");
  descriptionEl.innerHTML = "";
  ordinance.description.split("\n\n").forEach((para) => {
    const p = document.createElement("p");
    p.textContent = para;
    p.style.margin = "0 0 12px";
    descriptionEl.appendChild(p);
  });

  const downloadBtn = document.getElementById("detailDownload");
  downloadBtn.href = ordinance.pdf;
  downloadBtn.textContent = `Download ${ordinance.number}`;
});
