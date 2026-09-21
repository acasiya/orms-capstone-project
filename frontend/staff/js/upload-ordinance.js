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

  const extractStatus = document.getElementById("ordExtractStatus");

  // Picking a PDF triggers an OCR pass that prefills the form. It's a
  // convenience only: it fills fields that are still empty (never overwrites
  // anything the Secretary already typed), and any failure just leaves the
  // form as it was — manual entry always works. A newer pick supersedes an
  // in-flight one so a slow scan can't fill in the wrong document's details.
  let extractRun = 0;

  async function prefillFromPdf(file) {
    const run = ++extractRun;
    extractStatus.className = "field-hint";
    extractStatus.textContent = "Reading the PDF to fill in the details... this can take up to a minute.";
    extractStatus.hidden = false;
    try {
      const guesses = await extractOrdinanceFields(file);
      if (run !== extractRun) return;

      const targets = [
        [numberInput, guesses.number],
        [titleInput, guesses.title],
        [authorInput, guesses.author],
        [categoryInput, guesses.category],
        [dateInput, guesses.dateApproved],
        [descriptionInput, guesses.description],
      ];
      let filled = 0;
      for (const [input, value] of targets) {
        if (value && !input.value.trim()) {
          input.value = value;
          filled++;
        }
      }
      extractStatus.textContent = filled
        ? `Filled in ${filled} field${filled === 1 ? "" : "s"} from the scan. Please check them against the document — scanned text can be misread.`
        : "Couldn't read details from this scan — please fill them in manually.";
    } catch (err) {
      if (run !== extractRun) return;
      extractStatus.textContent = "Couldn't read details from this scan — please fill them in manually.";
    }
  }

  pdfInput.addEventListener("change", () => {
    const file = pdfInput.files[0];
    pdfLabelText.textContent = file ? file.name : "Click to browse for the ordinance PDF";
    if (!file) {
      extractRun++;
      extractStatus.hidden = true;
    } else if (file.size <= MAX_ORDINANCE_PDF_MB * 1024 * 1024) {
      prefillFromPdf(file);
    }
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
