// SafeSpace — Upload Ordinance/Resolution: a dedicated page (not a modal).
// The Secretary uploads ordinances, the Barangay Treasurer resolutions (see
// ordinances-data.js's managedDocumentKinds); the page relabels itself for
// whichever the uploader files. Everyone else with access to
// ordinances.html is sent back, same as OrdinanceListCreateView's
// IsDocumentManager check on the backend.

document.addEventListener("DOMContentLoaded", async () => {
  const kinds = managedDocumentKinds(getAdminUser());
  if (!kinds.length) {
    window.location.href = "ordinances.html";
    return;
  }
  const kind = kinds[0];
  const kindLabel = DOCUMENT_KIND_LABELS[kind];
  const kindWord = kindLabel.toLowerCase();

  document.title = `SafeSpace — Upload ${kindLabel}`;
  document.getElementById("uploadHeading").textContent = `Upload ${kindLabel}`;
  document.getElementById("ordNumberLabel").textContent = `${kindLabel} No.`;
  document.getElementById("ordNumberInput").placeholder =
    kind === "resolution" ? "e.g. Res. No. 12-(2026)" : "e.g. No. 31-(2026)";
  document.getElementById("ordTitleInput").placeholder = `${kindLabel} title`;
  document.getElementById("ordDescriptionInput").placeholder = `Full ${kindWord} text/summary...`;
  document.getElementById("ordPdfLabelText").textContent = `Click to browse for the ${kindWord} PDF`;

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
  const authorSuggestions = document.getElementById("ordAuthorSuggestions");

  // Author stays free text (see ordAuthorSuggestions' datalist) — the roster
  // is just an autocomplete aid. Category IS a controlled dropdown (an
  // Administrator maintains that list — see accounts.views.IsAdmin and
  // ordinances/models.py's OrdinanceCategory), so it needs loading before
  // the form is usable; a failed author-suggestions fetch isn't fatal the
  // same way, since typing still works with no suggestions at all.
  try {
    populateCategorySelect(categoryInput, await fetchOrdinanceCategories());
  } catch (err) {
    uploadError.textContent = err.message;
    uploadError.hidden = false;
    uploadConfirm.disabled = true;
  }
  try {
    populateAuthorDatalist(authorSuggestions, await fetchOrdinanceAuthors());
  } catch {
    // No suggestions is a minor loss, not worth blocking the form over.
  }

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

      const simpleTargets = [
        [numberInput, guesses.number],
        [titleInput, guesses.title],
        [authorInput, guesses.author],
        [dateInput, guesses.dateApproved],
        [descriptionInput, guesses.description],
      ];
      let filled = 0;
      for (const [input, value] of simpleTargets) {
        if (value && !input.value.trim()) {
          input.value = value;
          filled++;
        }
      }

      // Category's guess is one of the current dropdown's exact strings (see
      // extraction.py's OCR-category test, checked against the *starting*
      // list — an Administrator may since have renamed/removed one), so it's
      // a direct <option> match rather than anything fuzzy.
      if (guesses.category && !categoryInput.value) {
        const hasOption = Array.from(categoryInput.options).some((o) => o.value === guesses.category);
        if (hasOption) {
          categoryInput.value = guesses.category;
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
    pdfLabelText.textContent = file ? file.name : `Click to browse for the ${kindWord} PDF`;
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
      kind,
      number: numberInput.value.trim(),
      title: titleInput.value.trim(),
      author: authorInput.value.trim(),
      category: categoryInput.value,
      dateApproved: dateInput.value,
      description: descriptionInput.value.trim(),
      pdfFile: pdfInput.files[0],
    };

    if (!fields.author || !fields.category) {
      uploadError.textContent = "Please fill in the author and select a category.";
      uploadError.hidden = false;
      return;
    }

    if (!fields.pdfFile) {
      uploadError.textContent = `Please attach the ${kindWord} PDF.`;
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
