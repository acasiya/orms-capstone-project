// SafeSpace — Ordinances list: filter, search, sort, paginate, render,
// navigate to detail, plus (Staff/Admin only) uploading a new ordinance.

document.addEventListener("DOMContentLoaded", async () => {
  const tbody = document.getElementById("ordinanceRows");
  const sortSelect = document.getElementById("sortField");
  const searchInput = document.getElementById("ordinanceSearch");
  const searchForm = document.getElementById("ordinanceSearchForm");
  const paginationInfo = document.getElementById("paginationInfo");
  const paginationPrev = document.getElementById("paginationPrev");
  const paginationNext = document.getElementById("paginationNext");

  const PAGE_SIZE = 5;
  let currentPage = 1;

  tbody.innerHTML = `<tr><td colspan="4" class="ordinances-empty">Loading ordinances...</td></tr>`;
  try {
    await ensureOrdinancesLoaded();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="ordinances-empty">${err.message}</td></tr>`;
    return;
  }

  function getFiltered() {
    const query = searchInput.value.trim().toLowerCase();

    return liveOrdinances().filter((o) => {
      return (
        !query ||
        o.title.toLowerCase().includes(query) ||
        o.author.toLowerCase().includes(query) ||
        o.number.toLowerCase().includes(query)
      );
    });
  }

  function getSorted(list) {
    const sortKey = sortSelect.value;
    if (sortKey === "none") return list;
    return [...list].sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return -1;
      if (av > bv) return 1;
      return 0;
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function render() {
    const allRows = getSorted(getFiltered());
    const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, totalPages);

    const start = (currentPage - 1) * PAGE_SIZE;
    const rows = allRows.slice(start, start + PAGE_SIZE);

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="ordinances-empty">${
        liveOrdinances().length ? "No ordinances match your search." : "No ordinances uploaded yet."
      }</td></tr>`;
    } else {
      tbody.innerHTML = rows
        .map(
          (o) => `
          <tr data-id="${o.id}" tabindex="0">
            <td><span class="ordinance-name">${escapeHtml(o.title)}</span></td>
            <td>${escapeHtml(o.author)}</td>
            <td>${escapeHtml(o.number)}</td>
            <td>${escapeHtml(o.dateApproved)}</td>
          </tr>`
        )
        .join("");

      tbody.querySelectorAll("tr[data-id]").forEach((row) => {
        const goToDetail = () => {
          window.location.href = `ordinance-detail.html?id=${encodeURIComponent(row.dataset.id)}`;
        };
        row.addEventListener("click", goToDetail);
        row.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            goToDetail();
          }
        });
      });
    }

    paginationInfo.textContent = allRows.length
      ? `Showing ${start + 1} to ${Math.min(start + PAGE_SIZE, allRows.length)} of ${allRows.length} entries`
      : "Showing 0 entries";
    paginationPrev.disabled = currentPage <= 1;
    paginationNext.disabled = currentPage >= totalPages;
  }

  sortSelect.addEventListener("change", () => {
    currentPage = 1;
    render();
  });
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    currentPage = 1;
    render();
  });
  searchInput.addEventListener("input", () => {
    currentPage = 1;
    render();
  });
  paginationPrev.addEventListener("click", () => {
    currentPage -= 1;
    render();
  });
  paginationNext.addEventListener("click", () => {
    currentPage += 1;
    render();
  });

  render();

  // ---- Upload Ordinance modal ----

  const uploadBtn = document.getElementById("uploadOrdinanceBtn");
  const uploadModal = document.getElementById("uploadOrdinanceModal");
  const numberInput = document.getElementById("ordNumberInput");
  const titleInput = document.getElementById("ordTitleInput");
  const authorInput = document.getElementById("ordAuthorInput");
  const categoryInput = document.getElementById("ordCategoryInput");
  const dateInput = document.getElementById("ordDateInput");
  const descriptionInput = document.getElementById("ordDescriptionInput");
  const pdfInput = document.getElementById("ordPdfInput");
  const pdfLabelText = document.getElementById("ordPdfLabelText");
  const uploadConfirm = document.getElementById("uploadOrdinanceConfirm");
  const uploadCancel = document.getElementById("uploadOrdinanceCancel");
  const uploadError = document.getElementById("uploadOrdinanceError");

  function resetUploadForm() {
    [numberInput, titleInput, authorInput, categoryInput, dateInput, descriptionInput].forEach((el) => (el.value = ""));
    pdfInput.value = "";
    pdfLabelText.textContent = "Click to browse for the ordinance PDF";
    uploadError.hidden = true;
  }

  uploadBtn.addEventListener("click", () => {
    resetUploadForm();
    uploadModal.hidden = false;
  });
  uploadCancel.addEventListener("click", () => {
    uploadModal.hidden = true;
  });
  uploadModal.addEventListener("click", (e) => {
    if (e.target === uploadModal) uploadModal.hidden = true;
  });
  pdfInput.addEventListener("change", () => {
    pdfLabelText.textContent = pdfInput.files[0] ? pdfInput.files[0].name : "Click to browse for the ordinance PDF";
  });

  uploadConfirm.addEventListener("click", async () => {
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
      uploadError.textContent = "Please fill in every field.";
      uploadError.hidden = false;
      return;
    }
    if (!fields.pdfFile) {
      uploadError.textContent = "Please attach the ordinance PDF.";
      uploadError.hidden = false;
      return;
    }

    uploadConfirm.disabled = true;
    uploadConfirm.textContent = "Uploading...";
    try {
      await createOrdinance(fields);
      uploadModal.hidden = true;
      currentPage = 1;
      render();
    } catch (err) {
      uploadError.textContent = err.message;
      uploadError.hidden = false;
    } finally {
      uploadConfirm.disabled = false;
      uploadConfirm.textContent = "Upload";
    }
  });
});
