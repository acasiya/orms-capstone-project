// SafeSpace — Ordinance detail: view real info, and (Staff/Admin) edit it —
// including optionally replacing the PDF — via PATCH /api/ordinances/<id>/.

document.addEventListener("DOMContentLoaded", async () => {
  const id = new URLSearchParams(window.location.search).get("id");

  try {
    await ensureOrdinancesLoaded();
  } catch (err) {
    document.getElementById("detailTitle").textContent = err.message;
    document.getElementById("detailBody").hidden = true;
    return;
  }

  let ordinance = getOrdinanceById(id);

  if (!ordinance) {
    document.getElementById("detailTitle").textContent = "Ordinance not found";
    document.getElementById("editOrdinanceBtn").hidden = true;
    return;
  }

  const detailTitle = document.getElementById("detailTitle");
  const detailMeta = document.getElementById("detailMeta");
  const detailDescription = document.getElementById("detailDescription");
  const detailDocPreview = document.getElementById("detailDocPreview");
  const pdfPreviewFrame = document.getElementById("pdfPreviewFrame");
  const pdfPreviewNote = document.getElementById("pdfPreviewNote");
  const detailDownload = document.getElementById("detailDownload");

  function renderDisplay() {
    document.title = `${ordinance.number} — SafeSpace`;
    detailTitle.textContent = `City Ordinance ${ordinance.number}`;
    document.getElementById("detailAuthor").textContent = ordinance.author;
    document.getElementById("detailDate").textContent = ordinance.dateApproved;
    document.getElementById("detailOrdinanceTitle").textContent = ordinance.title;

    detailDescription.innerHTML = "";
    ordinance.description.split("\n\n").forEach((para) => {
      const p = document.createElement("p");
      p.textContent = para;
      p.style.margin = "0 0 12px";
      detailDescription.appendChild(p);
    });

    if (ordinance.pdf) {
      pdfPreviewFrame.src = pdfViewerUrl(ordinance.pdf);
      detailDocPreview.hidden = false;
      pdfPreviewNote.hidden = false;
      detailDownload.href = ordinance.pdf;
      detailDownload.target = "_blank";
      detailDownload.rel = "noopener";
      detailDownload.textContent = `Download ${ordinance.number}`;
      detailDownload.hidden = false;
    } else {
      detailDocPreview.hidden = true;
      pdfPreviewNote.hidden = true;
      detailDownload.hidden = true;
    }
  }

  renderDisplay();

  // ---- Edit mode (Secretary only — see ordinances-list.js) ----

  const currentUser = getAdminUser();
  const isSecretary = currentUser && currentUser.position === "Secretary";

  const editBtn = document.getElementById("editOrdinanceBtn");
  editBtn.hidden = !isSecretary;
  if (!isSecretary) return;

  const editForm = document.getElementById("editOrdinanceForm");
  const numberInput = document.getElementById("editNumberInput");
  const titleInput = document.getElementById("editTitleInput");
  const authorInput = document.getElementById("editAuthorInput");
  const categoryInput = document.getElementById("editCategoryInput");
  const dateInput = document.getElementById("editDateInput");
  const descriptionInput = document.getElementById("editDescriptionInput");
  const pdfInput = document.getElementById("editPdfInput");
  const pdfLabelText = document.getElementById("editPdfLabelText");
  const saveBtn = document.getElementById("editOrdinanceSave");
  const cancelBtn = document.getElementById("editOrdinanceCancel");
  const editError = document.getElementById("editOrdinanceError");

  // detailDocPreview/detailDownload are excluded here — their visibility
  // depends on whether ordinance.pdf exists, which renderDisplay() already
  // handles; blindly un-hiding them on exit would show an empty PDF preview
  // for an ordinance with no PDF.
  const displayEls = [detailTitle, detailMeta, detailDescription];

  function enterEditMode() {
    numberInput.value = ordinance.number;
    titleInput.value = ordinance.title;
    authorInput.value = ordinance.author;
    categoryInput.value = ordinance.category;
    dateInput.value = ordinance.dateApprovedRaw;
    descriptionInput.value = ordinance.description;
    pdfInput.value = "";
    pdfLabelText.textContent = "Click to replace the PDF (optional)";
    editError.hidden = true;

    displayEls.forEach((el) => (el.hidden = true));
    detailDocPreview.hidden = true;
    pdfPreviewNote.hidden = true;
    detailDownload.hidden = true;
    editBtn.hidden = true;
    editForm.hidden = false;
  }

  function exitEditMode() {
    displayEls.forEach((el) => (el.hidden = false));
    detailDocPreview.hidden = !ordinance.pdf;
    pdfPreviewNote.hidden = !ordinance.pdf;
    detailDownload.hidden = !ordinance.pdf;
    editBtn.hidden = false;
    editForm.hidden = true;
  }

  editBtn.addEventListener("click", enterEditMode);
  cancelBtn.addEventListener("click", exitEditMode);
  pdfInput.addEventListener("change", () => {
    pdfLabelText.textContent = pdfInput.files[0] ? pdfInput.files[0].name : "Click to replace the PDF (optional)";
  });

  saveBtn.addEventListener("click", async () => {
    const fields = {
      number: numberInput.value.trim(),
      title: titleInput.value.trim(),
      author: authorInput.value.trim(),
      category: categoryInput.value.trim(),
      dateApproved: dateInput.value,
      description: descriptionInput.value.trim(),
      pdfFile: pdfInput.files[0],
    };

    if (!fields.number || !fields.title || !fields.author || !fields.category || !fields.dateApproved || !fields.description) {
      editError.textContent = "Please fill in every field.";
      editError.hidden = false;
      return;
    }
    if (fields.pdfFile && fields.pdfFile.size > MAX_ORDINANCE_PDF_MB * 1024 * 1024) {
      editError.textContent = `That PDF is too large — please use one under ${MAX_ORDINANCE_PDF_MB}MB.`;
      editError.hidden = false;
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    try {
      ordinance = await updateOrdinanceById(ordinance.id, fields);
      renderDisplay();
      exitEditMode();
    } catch (err) {
      editError.textContent = err.message;
      editError.hidden = false;
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Changes";
    }
  });
});
