// SafeSpace — Upload Ordinance: a dedicated page (not a modal) for the
// Secretary to add a new ordinance. Ordinances is a full-edit section for
// the Secretary only — Barangay Captain/Investigator (the other roles with
// nav access to ordinances.html) get redirected back if they land here
// directly, same reasoning as OrdinanceListCreateView's IsSecretaryOrAdmin
// check on the backend.

document.addEventListener("DOMContentLoaded", () => {
  const currentUser = getAdminUser();
  if (!currentUser || currentUser.position !== "Secretary") {
    window.location.href = "ordinances.html";
    return;
  }

  const form = document.getElementById("uploadOrdinanceForm");
  const numberInput = document.getElementById("ordNumberInput");
  const titleInput = document.getElementById("ordTitleInput");
  const authorInput = document.getElementById("ordAuthorInput");
  const categoryInput = document.getElementById("ordCategoryInput");
  const dateInput = document.getElementById("ordDateInput");
  const descriptionInput = document.getElementById("ordDescriptionInput");
  const pdfInput = document.getElementById("ordPdfInput");
  const pdfLabelText = document.getElementById("ordPdfLabelText");
  const uploadConfirm = document.getElementById("uploadOrdinanceConfirm");
  const uploadError = document.getElementById("uploadOrdinanceError");

  pdfInput.addEventListener("change", () => {
    pdfLabelText.textContent = pdfInput.files[0] ? pdfInput.files[0].name : "Click to browse for the ordinance PDF";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    uploadError.hidden = true;

    const fields = {
      number: numberInput.value.trim(),
      title: titleInput.value.trim(),
      author: authorInput.value.trim(),
      category: categoryInput.value.trim(),
      dateApproved: dateInput.value,
      description: descriptionInput.value.trim(),
      pdfFile: pdfInput.files[0],
    };

    if (!fields.pdfFile) {
      uploadError.textContent = "Please attach the ordinance PDF.";
      uploadError.hidden = false;
      return;
    }
    if (fields.pdfFile.size > MAX_ORDINANCE_PDF_MB * 1024 * 1024) {
      uploadError.textContent = `That PDF is too large — please use one under ${MAX_ORDINANCE_PDF_MB}MB.`;
      uploadError.hidden = false;
      return;
    }

    uploadConfirm.disabled = true;
    uploadConfirm.textContent = "Uploading...";
    try {
      await createOrdinance(fields);
      window.location.href = "ordinances.html";
    } catch (err) {
      uploadError.textContent = err.message;
      uploadError.hidden = false;
      uploadConfirm.disabled = false;
      uploadConfirm.textContent = "Upload";
    }
  });
});
