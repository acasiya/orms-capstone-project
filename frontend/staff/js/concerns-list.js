// SafeSpace — Concerns/Suggestions list: search, status filter, folder
// filter/create/rename/delete, and pagination — all wired to the real API
// (concerns-data.js). Folder membership is a separate axis from status;
// selecting a folder narrows the list the same way the status dropdown does.

document.addEventListener("DOMContentLoaded", async () => {
  const PAGE_SIZE = 9;

  const searchForm = document.getElementById("concernSearchForm");
  const searchInput = document.getElementById("concernSearchInput");
  const statusFilter = document.getElementById("statusFilter");
  const list = document.getElementById("concernsList");
  const pagination = document.getElementById("concernsPagination");
  const foldersList = document.getElementById("foldersList");
  const allFoldersBtn = document.getElementById("allFoldersBtn");
  const addFolderBtn = document.getElementById("addFolderBtn");

  const folderNameModal = document.getElementById("folderNameModal");
  const folderNameModalTitle = document.getElementById("folderNameModalTitle");
  const folderNameInput = document.getElementById("folderNameInput");
  const folderNameConfirm = document.getElementById("folderNameConfirm");
  const folderNameCancel = document.getElementById("folderNameCancel");

  const folderDeleteModal = document.getElementById("folderDeleteModal");
  const folderDeleteName = document.getElementById("folderDeleteName");
  const folderDeleteConfirm = document.getElementById("folderDeleteConfirm");
  const folderDeleteCancel = document.getElementById("folderDeleteCancel");

  let page = 1;
  let activeFolderId = null; // null = "All Concerns/Suggestions"
  let folderModalMode = "create"; // "create" | "rename"
  let renameTargetId = null;
  let deleteTargetId = null;

  list.innerHTML = `<div class="ordinances-empty">Loading concerns/suggestions...</div>`;
  try {
    await Promise.all([ensureConcernsLoaded(), ensureFoldersLoaded()]);
  } catch (err) {
    list.innerHTML = `<div class="ordinances-empty">${err.message}</div>`;
    return;
  }

  const badgeClass = {
    Submitted: "status-badge--submitted",
    Resolved: "status-badge--resolved",
  };

  function truncate(text, max) {
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  // ---- Folders sidebar ----

  function renderFolders() {
    foldersList.innerHTML = liveFolders()
      .map(
        (f) => `
        <div class="folder-row">
          <button type="button" class="folder-chip${activeFolderId === f.id ? " active" : ""}" data-folder="${f.id}">
            <span>&#128193; ${f.name}</span>
            <span class="folder-chip__count">(${f.count})</span>
          </button>
          <button type="button" class="folder-icon-btn" data-rename="${f.id}" aria-label="Rename ${f.name}">&#9999;&#65039;</button>
          <button type="button" class="folder-icon-btn folder-icon-btn--delete" data-delete="${f.id}" aria-label="Delete ${f.name}">&#128465;&#65039;</button>
        </div>`
      )
      .join("");

    foldersList.querySelectorAll(".folder-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeFolderId = btn.dataset.folder;
        allFoldersBtn.classList.remove("active");
        page = 1;
        renderFolders();
        render();
      });
    });
    foldersList.querySelectorAll("[data-rename]").forEach((btn) => {
      btn.addEventListener("click", () => openRenameModal(btn.dataset.rename));
    });
    foldersList.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", () => openDeleteModal(btn.dataset.delete));
    });
  }

  allFoldersBtn.addEventListener("click", () => {
    activeFolderId = null;
    allFoldersBtn.classList.add("active");
    page = 1;
    renderFolders();
    render();
  });

  // ---- Create / rename folder modal ----

  function openCreateModal() {
    folderModalMode = "create";
    folderNameModalTitle.textContent = "Create Folder";
    folderNameConfirm.textContent = "Create";
    folderNameInput.value = "";
    folderNameModal.hidden = false;
    folderNameInput.focus();
  }

  function openRenameModal(id) {
    const folder = liveFolders().find((f) => f.id === id);
    if (!folder) return;
    folderModalMode = "rename";
    renameTargetId = id;
    folderNameModalTitle.textContent = "Rename Folder";
    folderNameConfirm.textContent = "Rename";
    folderNameInput.value = folder.name;
    folderNameModal.hidden = false;
    folderNameInput.focus();
  }

  addFolderBtn.addEventListener("click", openCreateModal);
  folderNameCancel.addEventListener("click", () => {
    folderNameModal.hidden = true;
  });
  folderNameConfirm.addEventListener("click", async () => {
    const name = folderNameInput.value.trim();
    if (!name) return;

    folderNameConfirm.disabled = true;
    try {
      if (folderModalMode === "create") {
        await createFolder(name);
      } else {
        await renameFolder(renameTargetId, name);
      }
      folderNameModal.hidden = true;
      renderFolders();
      render();
    } catch (err) {
      alert(err.message);
    } finally {
      folderNameConfirm.disabled = false;
    }
  });
  folderNameModal.addEventListener("click", (e) => {
    if (e.target === folderNameModal) folderNameModal.hidden = true;
  });
  folderNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      folderNameConfirm.click();
    }
  });

  // ---- Delete folder modal ----

  function openDeleteModal(id) {
    const folder = liveFolders().find((f) => f.id === id);
    if (!folder) return;
    deleteTargetId = id;
    folderDeleteName.textContent = folder.name;
    folderDeleteModal.hidden = false;
  }

  folderDeleteCancel.addEventListener("click", () => {
    folderDeleteModal.hidden = true;
  });
  folderDeleteConfirm.addEventListener("click", async () => {
    folderDeleteConfirm.disabled = true;
    try {
      await deleteFolder(deleteTargetId);
      if (activeFolderId === deleteTargetId) {
        activeFolderId = null;
        allFoldersBtn.classList.add("active");
      }
      folderDeleteModal.hidden = true;
      renderFolders();
      render();
    } catch (err) {
      alert(err.message);
    } finally {
      folderDeleteConfirm.disabled = false;
    }
  });
  folderDeleteModal.addEventListener("click", (e) => {
    if (e.target === folderDeleteModal) folderDeleteModal.hidden = true;
  });

  // ---- List: search, status filter, folder filter, paginate ----

  function buildPageList(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = [1];
    if (current > 3) pages.push("...");
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (current < total - 2) pages.push("...");
    pages.push(total);
    return pages;
  }

  function getFiltered() {
    let rows = liveConcerns();
    if (activeFolderId) {
      rows = rows.filter((c) => c.folderId === activeFolderId);
    }
    if (statusFilter.value !== "all") {
      rows = rows.filter((c) => c.status === statusFilter.value);
    }
    const query = searchInput.value.trim().toLowerCase();
    if (query) {
      rows = rows.filter(
        (c) =>
          c.concernText.toLowerCase().includes(query) ||
          (c.location && c.location.toLowerCase().includes(query)) ||
          c.reporter.toLowerCase().includes(query)
      );
    }
    return rows;
  }

  function render() {
    const rows = getFiltered();
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    page = Math.min(page, totalPages);
    const start = (page - 1) * PAGE_SIZE;
    const pageRows = rows.slice(start, start + PAGE_SIZE);

    list.innerHTML = pageRows.length
      ? pageRows
          .map(
            (c) => `
        <div class="concern-row">
          <span class="concern-row__title">${truncate(c.concernText, 60)}</span>
          <span class="concern-row__date">${formatConcernDate(c.dateSubmitted)}</span>
          <a class="concern-row__link" href="concern-detail.html?id=${encodeURIComponent(c.id)}">View Details</a>
          <span class="status-badge ${badgeClass[c.status] || ""}">${c.status}</span>
        </div>`
          )
          .join("")
      : `<div class="ordinances-empty">${liveConcerns().length ? "No concerns/suggestions match your search or filters." : "No concerns/suggestions submitted yet."}</div>`;

    const pages = buildPageList(page, totalPages);
    let html = `<button type="button" data-page="prev" ${page <= 1 ? "disabled" : ""} aria-label="Previous page">&#8249;</button>`;
    pages.forEach((p) => {
      html +=
        p === "..."
          ? `<span class="dash-pagination__ellipsis">&hellip;</span>`
          : `<button type="button" data-page="${p}" class="${p === page ? "active" : ""}">${p}</button>`;
    });
    html += `<button type="button" data-page="next" ${page >= totalPages ? "disabled" : ""} aria-label="Next page">&#8250;</button>`;
    pagination.innerHTML = html;

    pagination.querySelectorAll("button[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.page;
        page = val === "prev" ? page - 1 : val === "next" ? page + 1 : Number(val);
        render();
      });
    });
  }

  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    page = 1;
    render();
  });
  searchInput.addEventListener("input", () => {
    page = 1;
    render();
  });
  statusFilter.addEventListener("change", () => {
    page = 1;
    render();
  });

  renderFolders();
  render();
});
