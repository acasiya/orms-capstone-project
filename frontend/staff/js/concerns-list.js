// O.R.M.S. — Concerns/Suggestions list: search, folder filter, and folder
// create/rename/delete. Folder state lives in concerns-data.js (localStorage).

document.addEventListener("DOMContentLoaded", () => {
  const PAGE_SIZE = 9;

  const searchForm = document.getElementById("concernSearchForm");
  const searchInput = document.getElementById("concernSearchInput");
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
  let activeFolder = null; // null = "All Concerns/Suggestions"
  let folderModalMode = "create"; // "create" | "rename"
  let renameTarget = null;
  let deleteTarget = null;

  const badgeClass = {
    "New Submission": "status-badge--submitted",
    "In Folder": "status-badge--resolved",
  };

  function folderCount(name) {
    return liveConcerns().filter((c) => c.status === "In Folder" && c.folder === name).length;
  }

  function renderFolders() {
    foldersList.innerHTML = getFoldersList()
      .map(
        (name) => `
        <div class="folder-row">
          <button type="button" class="folder-chip${activeFolder === name ? " active" : ""}" data-folder="${name}">
            <span>&#128193; ${name}</span>
            <span class="folder-chip__count">(${folderCount(name)})</span>
          </button>
          <button type="button" class="folder-icon-btn" data-rename="${name}" aria-label="Rename ${name}">&#9999;&#65039;</button>
          <button type="button" class="folder-icon-btn folder-icon-btn--delete" data-delete="${name}" aria-label="Delete ${name}">&#128465;&#65039;</button>
        </div>`
      )
      .join("");

    foldersList.querySelectorAll(".folder-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeFolder = btn.dataset.folder;
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
    activeFolder = null;
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

  function openRenameModal(name) {
    folderModalMode = "rename";
    renameTarget = name;
    folderNameModalTitle.textContent = "Rename Folder";
    folderNameConfirm.textContent = "Rename";
    folderNameInput.value = name;
    folderNameModal.hidden = false;
    folderNameInput.focus();
  }

  addFolderBtn.addEventListener("click", openCreateModal);
  folderNameCancel.addEventListener("click", () => {
    folderNameModal.hidden = true;
  });
  folderNameConfirm.addEventListener("click", () => {
    const name = folderNameInput.value.trim();
    if (!name) return;
    const isDuplicate = getFoldersList().some(
      (n) => n.toLowerCase() === name.toLowerCase() && n !== renameTarget
    );
    if (isDuplicate) {
      folderNameModal.hidden = true;
      return;
    }

    if (folderModalMode === "create") {
      addFolder(name);
    } else {
      renameFolder(renameTarget, name);
      normalizeConcernFolders();
      if (activeFolder === renameTarget) activeFolder = name;
    }

    folderNameModal.hidden = true;
    renderFolders();
    render();
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

  function openDeleteModal(name) {
    deleteTarget = name;
    folderDeleteName.textContent = name;
    folderDeleteModal.hidden = false;
  }

  folderDeleteCancel.addEventListener("click", () => {
    folderDeleteModal.hidden = true;
  });
  folderDeleteConfirm.addEventListener("click", () => {
    deleteFolder(deleteTarget);
    normalizeConcernFolders();
    if (activeFolder === deleteTarget) {
      activeFolder = null;
      allFoldersBtn.classList.add("active");
    }
    folderDeleteModal.hidden = true;
    renderFolders();
    render();
  });
  folderDeleteModal.addEventListener("click", (e) => {
    if (e.target === folderDeleteModal) folderDeleteModal.hidden = true;
  });

  // ---- List: search, filter, paginate ----

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
    if (activeFolder) {
      rows = rows.filter((c) => c.status === "In Folder" && c.folder === activeFolder);
    }
    const query = searchInput.value.trim().toLowerCase();
    if (query) {
      rows = rows.filter(
        (c) =>
          c.id.toLowerCase().includes(query) ||
          c.category.toLowerCase().includes(query) ||
          c.location.toLowerCase().includes(query) ||
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
          <span class="concern-row__title">#${c.id}</span>
          <span class="concern-row__date">${formatConcernDate(c.dateSubmitted)}</span>
          <a class="concern-row__link" href="concern-detail.html?id=${encodeURIComponent(c.id)}">View Details</a>
          <span class="status-badge ${badgeClass[c.status]}">${c.status}</span>
        </div>`
          )
          .join("")
      : `<div class="ordinances-empty">No concerns/suggestions match your search or folder.</div>`;

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

  renderFolders();
  render();
});
