// O.R.M.S. — Ordinance detail: populate the page from the ?id= query param,
// and handle the Edit/Delete actions (Barangay Staff only).

document.addEventListener("DOMContentLoaded", () => {
  const id = new URLSearchParams(window.location.search).get("id");

  const detailTitle = document.getElementById("detailTitle");
  const detailAuthor = document.getElementById("detailAuthor");
  const detailDate = document.getElementById("detailDate");
  const detailOrdinanceTitle = document.getElementById("detailOrdinanceTitle");
  const descriptionEl = document.getElementById("detailDescription");
  const downloadBtn = document.getElementById("detailDownload");
  const editBtn = document.getElementById("editOrdinanceBtn");
  const deleteBtn = document.getElementById("deleteOrdinanceBtn");

  function renderDetail(ordinance) {
    document.title = `${ordinance.number} — O.R.M.S.`;
    detailTitle.textContent = `City Ordinance ${ordinance.number}`;
    detailAuthor.textContent = ordinance.author;
    detailDate.textContent = ordinance.dateApproved;
    detailOrdinanceTitle.textContent = ordinance.title;

    descriptionEl.innerHTML = "";
    ordinance.description.split("\n\n").forEach((para) => {
      const p = document.createElement("p");
      p.textContent = para;
      p.style.margin = "0 0 12px";
      descriptionEl.appendChild(p);
    });

    downloadBtn.href = ordinance.pdf;
    downloadBtn.textContent = `Download ${ordinance.number}`;
  }

  let ordinance = getOrdinances().find((o) => o.id === id);

  if (!ordinance) {
    detailTitle.textContent = "Ordinance not found";
    document.getElementById("detailBody").hidden = true;
    editBtn.hidden = true;
    deleteBtn.hidden = true;
    return;
  }

  renderDetail(ordinance);

  // Edit Ordinance popup
  const editModal = document.getElementById("editOrdinanceModal");
  const editForm = document.getElementById("editOrdinanceForm");
  const updatedModal = document.getElementById("ordinanceUpdatedModal");
  const updatedConfirm = document.getElementById("ordinanceUpdatedConfirm");

  const numberInput = document.getElementById("ordNumber");
  const titleInput = document.getElementById("ordTitle");
  const authorInput = document.getElementById("ordAuthor");
  const categoryInput = document.getElementById("ordCategory");
  const dateInput = document.getElementById("ordDate");
  const descriptionInput = document.getElementById("ordDescription");
  const pdfInput = document.getElementById("ordPdf");
  const pdfFileName = document.getElementById("ordPdfFileName");
  const defaultPdfText = pdfFileName.textContent;

  pdfInput.addEventListener("change", () => {
    const file = pdfInput.files[0];
    pdfFileName.textContent = file ? file.name : defaultPdfText;
  });

  editBtn.addEventListener("click", () => {
    numberInput.value = ordinance.number;
    titleInput.value = ordinance.title;
    authorInput.value = ordinance.author;
    categoryInput.value = ordinance.category;
    dateInput.value = ordinance.dateSort;
    descriptionInput.value = ordinance.description;
    pdfInput.value = "";
    pdfFileName.textContent = ordinance.pdf !== "#" ? ordinance.pdf : defaultPdfText;
    editModal.hidden = false;
  });

  editForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!editForm.reportValidity()) return;

    ordinance = updateOrdinance(id, {
      number: numberInput.value.trim(),
      title: titleInput.value.trim(),
      author: authorInput.value.trim(),
      category: categoryInput.value.trim(),
      dateApproved: dateInput.value,
      description: descriptionInput.value.trim(),
      pdf: pdfInput.files[0] ? pdfInput.files[0].name : "",
    });

    renderDetail(ordinance);
    editModal.hidden = true;
    updatedModal.hidden = false;
  });

  updatedConfirm.addEventListener("click", () => {
    updatedModal.hidden = true;
  });

  // Delete Ordinance
  const deleteModal = document.getElementById("deleteOrdinanceModal");
  const deleteYes = document.getElementById("deleteOrdinanceYes");

  deleteBtn.addEventListener("click", () => {
    deleteModal.hidden = false;
  });

  deleteYes.addEventListener("click", () => {
    deleteOrdinance(id);
    window.location.href = "ordinances.html";
  });
});
