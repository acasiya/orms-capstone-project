// SafeSpace — Ordinances data, backed by the real API (GET /api/ordinances/,
// AllowAny — guests can browse without an account, but this Staff Portal
// copy always sends the caller's token anyway so Secretary/Admin also see
// archived ordinances; see ensureOrdinancesLoaded). createOrdinance/
// updateOrdinanceById/archiveOrdinanceById/unarchiveOrdinanceById all
// require Secretary/Admin, enforced server-side.

let _ordinancesCache = null;

// Keeps a safety margin under the server's DATA_UPLOAD_MAX_MEMORY_SIZE
// (25MB, see settings.py) so an oversize PDF fails fast with a clear
// message instead of a network round trip that ends in a generic 400.
const MAX_ORDINANCE_PDF_MB = 20;

// Mobile Chrome (and most mobile browsers) has no built-in PDF plugin for
// <iframe src="some.pdf">, so it just shows a bare "Open" fallback instead
// of rendering the PDF — desktop Chrome's built-in viewer hid this on every
// platform this was tested on until then. Routing through Google's PDF
// viewer (a normal HTML page that rasterizes the PDF itself) renders
// consistently everywhere instead of depending on the browser's own PDF
// support. Needs an absolute, publicly-fetchable URL — pdf_url already is
// one (see ordinances/serializers.py's get_pdf_url).
function pdfViewerUrl(pdfUrl) {
  return `https://docs.google.com/viewer?embedded=true&url=${encodeURIComponent(pdfUrl)}`;
}

function mapOrdinance(o) {
  const numberMatch = o.number.match(/\d+/);
  return {
    id: o.id,
    number: o.number,
    numberSort: numberMatch ? parseInt(numberMatch[0], 10) : 0,
    title: o.title,
    author: o.author,
    category: o.category,
    dateApproved: new Date(`${o.date_approved}T00:00:00`).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    dateApprovedRaw: o.date_approved,
    dateSort: o.date_approved,
    description: o.description,
    pdf: o.pdf_url,
    uploadedBy: o.uploaded_by_name,
    isArchived: o.is_archived,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
  };
}

// Shared by refreshOrdinanceInCache/archiveOrdinanceById/unarchiveOrdinanceById —
// all three get back a full ordinance and just need it swapped into the cache.
function applyOrdinanceUpdate(updated) {
  if (_ordinancesCache) {
    const idx = _ordinancesCache.findIndex((o) => o.id === updated.id);
    if (idx !== -1) _ordinancesCache[idx] = updated;
  }
  return updated;
}

// Sent authenticated (unlike the citizen copy of this file) even though GET
// is AllowAny — the backend uses the caller's identity to decide whether
// archived ordinances are included (see OrdinanceListCreateView.get_queryset),
// so an unauthenticated request here would make Staff/Admin lose visibility
// into anything they'd archived.
async function ensureOrdinancesLoaded() {
  if (_ordinancesCache) return _ordinancesCache;
  const response = await authFetch("/api/ordinances/");
  if (!response.ok) throw new Error("Could not load ordinances.");
  const data = await response.json();
  _ordinancesCache = data.map(mapOrdinance);
  return _ordinancesCache;
}

function liveOrdinances() {
  return _ordinancesCache || [];
}

function getOrdinanceById(id) {
  return (_ordinancesCache || []).find((o) => o.id === id) || null;
}

async function refreshOrdinanceInCache(id) {
  const response = await authFetch(`/api/ordinances/${encodeURIComponent(id)}/`);
  if (!response.ok) throw new Error("Could not reload this ordinance.");
  return applyOrdinanceUpdate(mapOrdinance(await response.json()));
}

// DRF's own errors — permission denied, request-too-large, throttling,
// malformed multipart — come back as {"detail": "..."} (a string), not the
// {field: ["msg"]} shape field-validation errors use. The old version here
// only ever unwrapped the array shape, so any of those cases silently fell
// through to `fallback` with no indication of what actually went wrong
// (e.g. a PDF over DATA_UPLOAD_MAX_MEMORY_SIZE always read as a generic
// "Could not upload this ordinance."). A non-JSON body (a raw 500 page,
// most likely) still falls back, but now says which HTTP status it was.
async function readFirstError(response, fallback) {
  const data = await response.json().catch(() => null);
  if (data) {
    if (typeof data.detail === "string") throw new Error(data.detail);
    const firstError = Object.values(data)[0];
    if (Array.isArray(firstError)) throw new Error(firstError[0]);
    if (typeof firstError === "string") throw new Error(firstError);
  }
  throw new Error(`${fallback} (server responded ${response.status})`);
}

// fields: { number, title, author, category, dateApproved (YYYY-MM-DD), description, pdfFile }
async function createOrdinance(fields) {
  const formData = new FormData();
  formData.append("number", fields.number);
  formData.append("title", fields.title);
  formData.append("author", fields.author);
  formData.append("category", fields.category);
  formData.append("date_approved", fields.dateApproved);
  formData.append("description", fields.description);
  formData.append("pdf_file", fields.pdfFile);

  const response = await authFetch("/api/ordinances/", { method: "POST", body: formData });
  if (!response.ok) await readFirstError(response, "Could not upload this ordinance.");
  const created = mapOrdinance(await response.json());
  if (_ordinancesCache) _ordinancesCache.unshift(created);
  return created;
}

// Same field shape as createOrdinance, but pdfFile is optional — omit it to keep the existing PDF.
async function updateOrdinanceById(id, fields) {
  const formData = new FormData();
  if (fields.number !== undefined) formData.append("number", fields.number);
  if (fields.title !== undefined) formData.append("title", fields.title);
  if (fields.author !== undefined) formData.append("author", fields.author);
  if (fields.category !== undefined) formData.append("category", fields.category);
  if (fields.dateApproved !== undefined) formData.append("date_approved", fields.dateApproved);
  if (fields.description !== undefined) formData.append("description", fields.description);
  if (fields.pdfFile) formData.append("pdf_file", fields.pdfFile);

  const response = await authFetch(`/api/ordinances/${encodeURIComponent(id)}/`, { method: "PATCH", body: formData });
  if (!response.ok) await readFirstError(response, "Could not update this ordinance.");
  return refreshOrdinanceInCache(id);
}

// Secretary hides/restores an ordinance on the Citizen portal — see
// OrdinanceArchiveView/OrdinanceUnarchiveView.
async function archiveOrdinanceById(id) {
  const response = await authFetch(`/api/ordinances/${encodeURIComponent(id)}/archive/`, { method: "POST" });
  if (!response.ok) await readFirstError(response, "Could not archive this ordinance.");
  return applyOrdinanceUpdate(mapOrdinance(await response.json()));
}

async function unarchiveOrdinanceById(id) {
  const response = await authFetch(`/api/ordinances/${encodeURIComponent(id)}/unarchive/`, { method: "POST" });
  if (!response.ok) await readFirstError(response, "Could not unarchive this ordinance.");
  return applyOrdinanceUpdate(mapOrdinance(await response.json()));
}
