// O.R.M.S. — Ordinance detail: populate the page from the ?id= query param.

document.addEventListener("DOMContentLoaded", async () => {
  const id = new URLSearchParams(window.location.search).get("id");

  try {
    await ensureOrdinancesLoaded();
  } catch (err) {
    document.getElementById("detailTitle").textContent = err.message;
    document.getElementById("detailBody").hidden = true;
    return;
  }

  const ordinance = getOrdinanceById(id);

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
  if (ordinance.pdf) {
    downloadBtn.href = ordinance.pdf;
    downloadBtn.target = "_blank";
    downloadBtn.rel = "noopener";
    downloadBtn.textContent = `Download ${ordinance.number}`;
  } else {
    downloadBtn.hidden = true;
  }
});
