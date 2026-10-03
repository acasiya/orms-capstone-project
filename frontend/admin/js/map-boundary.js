// SafeSpace — Map Boundary (Admin Portal): draw, upload or edit the
// barangay outline shown on the staff incident heatmap. Backed by
// GET/PUT /api/site/boundary/ (see siteinfo/views.py's BoundaryView), which
// stores one ring of [lat, lng] points.
//
// Depends (load order): /staff/vendor/leaflet/leaflet.js,
// /staff/js/street-coordinates.js — then this file, then admin.js.

const BOUNDARY_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
const BOUNDARY_TILE_ATTRIBUTION = '&copy; <a href="https://www.esri.com">Esri</a> &mdash; Esri, HERE, Garmin, OpenStreetMap contributors';
const BOUNDARY_DEFAULT_CENTER = [14.3225, 121.0905];
// Matches siteinfo/serializers.py's MAX_BOUNDARY_POINTS.
const BOUNDARY_MAX_POINTS = 2000;

async function fetchBoundary() {
  const response = await fetch("/api/site/boundary/");
  if (!response.ok) throw new Error("Could not load the saved boundary.");
  return (await response.json()).boundary || [];
}

async function saveBoundary(points) {
  const response = await authFetch("/api/site/boundary/", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ boundary: points }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const first = data && (data.detail || (Array.isArray(data.boundary) ? data.boundary[0] : null));
    throw new Error(typeof first === "string" ? first : "Could not save the boundary. Check the points and try again.");
  }
  return data.boundary;
}

// ---- File import (GeoJSON / KML) ----
// Both formats list coordinates as lng,lat — flipped to [lat, lng] here.
// A file with several polygons (e.g. a whole city's barangays) keeps only
// the largest one, which is almost always the one meant.

function ringArea(points) {
  // Shoelace on a local equirectangular projection — plenty for comparing
  // rings and showing an approximate km² figure.
  if (points.length < 3) return 0;
  const cos = Math.cos((points[0][0] * Math.PI) / 180);
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [y1, x1] = points[i === 0 ? points.length - 1 : i - 1];
    const [y2, x2] = points[i];
    sum += (x1 * cos * y2 - x2 * cos * y1);
  }
  return Math.abs(sum / 2) * 111.32 * 111.32; // deg² -> km²
}

function ringsFromGeoJSON(data) {
  const rings = [];
  const visit = (node) => {
    if (!node) return;
    if (node.type === "FeatureCollection") node.features.forEach(visit);
    else if (node.type === "Feature") visit(node.geometry);
    else if (node.type === "GeometryCollection") node.geometries.forEach(visit);
    else if (node.type === "Polygon") rings.push(node.coordinates[0]);
    else if (node.type === "MultiPolygon") node.coordinates.forEach((poly) => rings.push(poly[0]));
    else if (node.type === "LineString") rings.push(node.coordinates);
  };
  visit(data);
  return rings.map((ring) => ring.map(([lng, lat]) => [lat, lng]));
}

function ringsFromKML(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("That KML file couldn't be read.");
  const parse = (el) =>
    el.textContent
      .trim()
      .split(/\s+/)
      .map((triple) => triple.split(",").map(Number))
      .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat))
      .map(([lng, lat]) => [lat, lng]);
  let rings = Array.from(doc.getElementsByTagName("outerBoundaryIs")).flatMap((outer) =>
    Array.from(outer.getElementsByTagName("coordinates")).map(parse)
  );
  // A boundary drawn as a path (Google My Maps "Draw a line") instead of a shape.
  if (!rings.length) rings = Array.from(doc.getElementsByTagName("LineString")).map((ls) => parse(ls.getElementsByTagName("coordinates")[0]));
  return rings;
}

function pointsFromFile(name, text) {
  const lower = name.toLowerCase();
  let rings;
  if (lower.endsWith(".kml")) {
    rings = ringsFromKML(text);
  } else {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("That file isn't valid GeoJSON. Use a .geojson/.json or .kml file.");
    }
    rings = ringsFromGeoJSON(data);
  }
  rings = rings.filter((r) => r.length >= 3);
  if (!rings.length) throw new Error("No outline (polygon) was found in that file.");
  let points = rings.sort((a, b) => ringArea(b) - ringArea(a))[0];
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length > 3 && first[0] === last[0] && first[1] === last[1]) points = points.slice(0, -1);
  // Very detailed survey files can have tens of thousands of points; thin
  // them evenly to what the server accepts.
  if (points.length > BOUNDARY_MAX_POINTS) {
    const step = points.length / BOUNDARY_MAX_POINTS;
    points = Array.from({ length: BOUNDARY_MAX_POINTS }, (_, i) => points[Math.floor(i * step)]);
  }
  return { points, polygonCount: rings.length };
}

// ---- Page ----

document.addEventListener("DOMContentLoaded", () => {
  const mapEl = document.getElementById("boundaryMap");
  const statusEl = document.getElementById("boundaryStatus");
  const errorForm = document.getElementById("boundaryForm");
  const undoBtn = document.getElementById("boundaryUndo");
  const clearBtn = document.getElementById("boundaryClear");
  const resetBtn = document.getElementById("boundaryReset");
  const saveBtn = document.getElementById("boundarySave");
  const fileInput = document.getElementById("boundaryFile");
  const streetsToggle = document.getElementById("boundaryShowStreets");

  const map = L.map(mapEl, { doubleClickZoom: false }).setView(BOUNDARY_DEFAULT_CENTER, 15);
  L.tileLayer(BOUNDARY_TILE_URL, { maxZoom: 19, attribution: BOUNDARY_TILE_ATTRIBUTION }).addTo(map);
  map.attributionControl.setPrefix("");

  // The app's street list, as a tracing reference — the outline should
  // take these in.
  const streetsLayer = L.layerGroup(
    Object.entries(typeof STREET_COORDINATES === "object" ? STREET_COORDINATES : {}).map(([name, coord]) =>
      L.circleMarker(coord, { radius: 4, color: "#1f2430", weight: 1, fillColor: "#f2c94c", fillOpacity: 0.9 }).bindTooltip(name)
    )
  ).addTo(map);
  streetsToggle.addEventListener("change", () => {
    if (streetsToggle.checked) streetsLayer.addTo(map);
    else streetsLayer.remove();
  });

  const outline = L.polygon([], {
    color: "#057a12",
    weight: 2.5,
    dashArray: "6 5",
    fillColor: "#057a12",
    fillOpacity: 0.08,
    interactive: false,
  }).addTo(map);
  const handles = L.layerGroup().addTo(map);

  let points = [];
  let saved = [];
  const history = [];

  const samePoints = (a, b) => a.length === b.length && a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1]);
  const isDirty = () => !samePoints(points, saved);

  function pushHistory() {
    history.push(points.map((p) => p.slice()));
    if (history.length > 100) history.shift();
  }

  function updateStatus(message) {
    const parts = [];
    if (message) parts.push(message);
    if (points.length) {
      parts.push(`${points.length} point${points.length === 1 ? "" : "s"}`);
      if (points.length >= 3) parts.push(`about ${ringArea(points).toFixed(2)} km²`);
    } else {
      parts.push("No outline — click the map to start drawing");
    }
    if (isDirty()) parts.push("unsaved changes");
    statusEl.textContent = parts.join(" · ");
    undoBtn.disabled = !history.length;
    clearBtn.disabled = !points.length;
    resetBtn.disabled = !isDirty();
    saveBtn.disabled = !isDirty() || (points.length > 0 && points.length < 3);
  }

  const handleIcon = L.divIcon({ className: "boundary-handle", iconSize: [12, 12] });

  function redraw(message) {
    outline.setLatLngs(points);
    handles.clearLayers();
    points.forEach((p, i) => {
      const handle = L.marker(p, { icon: handleIcon, draggable: true, keyboard: false });
      handle.bindTooltip("Drag to move · right-click to remove", { direction: "top", offset: [0, -6] });
      handle.on("dragstart", pushHistory);
      handle.on("drag", (e) => {
        const { lat, lng } = e.target.getLatLng();
        points[i] = [lat, lng];
        outline.setLatLngs(points);
      });
      handle.on("dragend", () => {
        points[i] = points[i].map((v) => +v.toFixed(6));
        updateStatus();
      });
      handle.on("contextmenu", (e) => {
        L.DomEvent.preventDefault(e.originalEvent);
        pushHistory();
        points.splice(i, 1);
        redraw();
      });
      handles.addLayer(handle);
    });
    updateStatus(message);
  }

  // Squared distance from point p to segment a-b, in screen pixels — used to
  // insert a new point into the edge nearest the click, so clicking near
  // an edge refines it instead of stretching a spike across the shape.
  function segmentDistance(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
    const x = a.x + t * dx - p.x;
    const y = a.y + t * dy - p.y;
    return x * x + y * y;
  }

  map.on("click", (e) => {
    if (points.length >= BOUNDARY_MAX_POINTS) return;
    pushHistory();
    const point = [+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)];
    if (points.length < 3) {
      points.push(point);
    } else {
      const click = map.latLngToContainerPoint(e.latlng);
      const screen = points.map((pt) => map.latLngToContainerPoint(pt));
      let best = 0;
      let bestDist = Infinity;
      screen.forEach((a, i) => {
        const d = segmentDistance(click, a, screen[(i + 1) % screen.length]);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      points.splice(best + 1, 0, point);
    }
    redraw();
  });

  undoBtn.addEventListener("click", () => {
    if (!history.length) return;
    points = history.pop();
    redraw();
  });

  clearBtn.addEventListener("click", () => {
    pushHistory();
    points = [];
    redraw("Cleared — click the map to draw a new outline, or Save to remove it");
  });

  resetBtn.addEventListener("click", () => {
    pushHistory();
    points = saved.map((p) => p.slice());
    redraw("Back to the saved outline");
    fitOutline();
  });

  function fitOutline() {
    if (points.length >= 3) map.fitBounds(L.latLngBounds(points).pad(0.15));
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    clearFormError(errorForm);
    try {
      const { points: imported, polygonCount } = pointsFromFile(file.name, await file.text());
      pushHistory();
      points = imported.map(([lat, lng]) => [+lat.toFixed(6), +lng.toFixed(6)]);
      redraw(
        `Loaded ${file.name}${polygonCount > 1 ? ` (largest of ${polygonCount} shapes)` : ""} — check it, then Save`
      );
      fitOutline();
    } catch (err) {
      showFormError(errorForm, err.message);
    }
  });

  saveBtn.addEventListener("click", async () => {
    clearFormError(errorForm);
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    try {
      saved = await saveBoundary(points);
      points = saved.map((p) => p.slice());
      history.length = 0;
      redraw(saved.length ? "Saved — the heatmap now shows this outline" : "Saved — the outline is removed");
    } catch (err) {
      showFormError(errorForm, err.message);
      updateStatus();
    } finally {
      saveBtn.textContent = "Save Boundary";
    }
  });

  window.addEventListener("beforeunload", (e) => {
    if (isDirty()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  fetchBoundary()
    .then((boundary) => {
      saved = boundary;
      points = boundary.map((p) => p.slice());
      redraw();
      fitOutline();
    })
    .catch((err) => {
      showFormError(errorForm, err.message);
      redraw();
    });
});
