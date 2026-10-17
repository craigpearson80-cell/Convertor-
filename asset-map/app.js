// ---- Configuration ---------------------------------------------------------
// Where the map reads its assets from. Leave SHEET_CSV_URL empty to use the
// assets.csv file next to this page, or paste a Google Sheet "Publish to web"
// CSV link so edits in the sheet show up for everyone on reload.
const CONFIG = {
  SHEET_CSV_URL: "",
  LOCAL_CSV: "assets.csv",
  // Map view used when there are no assets yet.
  DEFAULT_CENTER: [51.505, -0.09],
  DEFAULT_ZOOM: 12,
};

const COLUMNS = ["id", "name", "category", "lat", "lng", "status", "notes", "links"];
const DRAFT_KEY = "assetMap.draft.v1";
const PALETTE = ["#1f6feb", "#d1495b", "#2a9d8f", "#e9a03b", "#8e5bd6", "#3d8b37",
                 "#c2572b", "#0f8fb3", "#b5407e", "#6b7a8f"];

// ---- State -----------------------------------------------------------------
let assets = [];
let editing = false;
const markers = new Map();
const categoryColors = new Map();

// ---- Map -------------------------------------------------------------------
const map = L.map("map").setView(CONFIG.DEFAULT_CENTER, CONFIG.DEFAULT_ZOOM);
const streets = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);
const satellite = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19, attribution: "Imagery &copy; Esri" });
L.control.layers({ Streets: streets, Satellite: satellite }).addTo(map);
const layer = L.layerGroup().addTo(map);

// ---- Helpers ---------------------------------------------------------------
const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function safeUrl(u) {
  try {
    const url = new URL(u.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch { return null; }
}

// links column: "Label|https://… ; Other|https://…" (label optional).
function parseLinks(text) {
  return String(text || "").split(/[;\n]/).map((part) => {
    const p = part.trim();
    if (!p) return null;
    const bar = p.lastIndexOf("|");
    const label = bar > -1 ? p.slice(0, bar).trim() : "";
    const url = safeUrl(bar > -1 ? p.slice(bar + 1) : p);
    return url ? { label: label || url, url } : null;
  }).filter(Boolean);
}

function colorFor(category) {
  const key = category || "Uncategorised";
  if (!categoryColors.has(key)) categoryColors.set(key, PALETTE[categoryColors.size % PALETTE.length]);
  return categoryColors.get(key);
}

function icon(color) {
  return L.divIcon({
    className: "",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -10],
    html: `<div style="width:18px;height:18px;border-radius:50%;background:${color};
           border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)"></div>`,
  });
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2200);
}

function normalise(row) {
  const a = {};
  for (const c of COLUMNS) a[c] = String(row[c] ?? row[c[0].toUpperCase() + c.slice(1)] ?? "").trim();
  a.lat = parseFloat(a.lat);
  a.lng = parseFloat(a.lng);
  if (!a.id) a.id = "a-" + Math.random().toString(36).slice(2, 9);
  return a;
}

function parseCsv(text) {
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
  return data.map(normalise).filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng));
}

function toCsv() {
  return Papa.unparse({ fields: COLUMNS, data: assets.map((a) => COLUMNS.map((c) => a[c] ?? "")) });
}

function saveDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(assets)); } catch {}
}

function loadDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch { return null; }
}

// ---- Rendering -------------------------------------------------------------
function viewHtml(a) {
  const links = parseLinks(a.links);
  return `<div class="pop">
    <h3>${esc(a.name || "Untitled asset")}</h3>
    <div class="meta">${esc(a.category || "Uncategorised")}${a.status ? " · " + esc(a.status) : ""}</div>
    ${a.notes ? `<div>${esc(a.notes)}</div>` : ""}
    ${links.length ? `<ul>${links.map((l) =>
      `<li><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a></li>`).join("")}</ul>` : ""}
    ${editing ? `<div class="actions">
      <button data-act="edit" data-id="${esc(a.id)}">Edit</button>
      <button class="danger" data-act="delete" data-id="${esc(a.id)}">Delete</button></div>` : ""}
  </div>`;
}

function formHtml(a) {
  const field = (name, label, type = "text") =>
    `<label>${label}<input name="${name}" type="${type}" value="${esc(a[name])}"></label>`;
  return `<div class="pop"><form data-id="${esc(a.id)}">
    ${field("name", "Name")}
    ${field("category", "Category")}
    ${field("status", "Status")}
    <label>Notes<textarea name="notes" rows="2">${esc(a.notes)}</textarea></label>
    <label>Links (one per line, optional label: <code>Manual|https://…</code>)
      <textarea name="links" rows="3">${esc(String(a.links || "").split(/\s*;\s*/).join("\n"))}</textarea></label>
    <div class="actions"><button type="submit" class="primary">Save</button>
      <button type="button" data-act="cancel" data-id="${esc(a.id)}">Cancel</button></div>
  </form></div>`;
}

function render() {
  layer.clearLayers();
  markers.clear();
  for (const a of assets) {
    const m = L.marker([a.lat, a.lng], { icon: icon(colorFor(a.category)), draggable: editing, title: a.name })
      .bindPopup(() => viewHtml(a));
    m.on("dragend", () => {
      const p = m.getLatLng();
      a.lat = +p.lat.toFixed(6);
      a.lng = +p.lng.toFixed(6);
      saveDraft();
      toast("Moved " + (a.name || "asset"));
    });
    m.addTo(layer);
    markers.set(a.id, m);
  }
  renderFilters();
  renderList();
}

function renderFilters() {
  const sel = $("category");
  const current = sel.value;
  const cats = [...new Set(assets.map((a) => a.category || "Uncategorised"))].sort();
  sel.innerHTML = `<option value="">All categories</option>` +
    cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  sel.value = cats.includes(current) ? current : "";
}

function matches(a) {
  const q = $("search").value.trim().toLowerCase();
  const cat = $("category").value;
  if (cat && (a.category || "Uncategorised") !== cat) return false;
  if (!q) return true;
  return [a.name, a.category, a.status, a.notes, a.links].join(" ").toLowerCase().includes(q);
}

function renderList() {
  const visible = assets.filter(matches).sort((x, y) => x.name.localeCompare(y.name));
  for (const a of assets) {
    const m = markers.get(a.id);
    if (!m) continue;
    const show = visible.includes(a);
    if (show && !layer.hasLayer(m)) layer.addLayer(m);
    if (!show && layer.hasLayer(m)) layer.removeLayer(m);
  }
  $("count").textContent = `${visible.length} of ${assets.length}`;
  $("list").innerHTML = visible.map((a) => `<li data-id="${esc(a.id)}">
      <span class="dot" style="background:${colorFor(a.category)}"></span>
      <div><div class="li-name">${esc(a.name || "Untitled asset")}</div>
      <div class="li-meta">${esc(a.category || "Uncategorised")}${a.status ? " · " + esc(a.status) : ""}</div></div>
    </li>`).join("") || `<li style="cursor:default;color:var(--muted)">No assets match.</li>`;
}

function fitAll() {
  if (!assets.length) return;
  map.fitBounds(L.latLngBounds(assets.map((a) => [a.lat, a.lng])).pad(0.15));
}

function focusAsset(id) {
  const m = markers.get(id);
  if (!m) return;
  map.setView(m.getLatLng(), Math.max(map.getZoom(), 15));
  m.openPopup();
}

// ---- Editing ---------------------------------------------------------------
function setEditing(on) {
  editing = on;
  document.body.classList.toggle("editing", on);
  $("editTools").hidden = !on;
  $("editToggle").textContent = on ? "Done editing" : "Edit assets";
  map.closePopup();
  render();
}

function openForm(a) {
  const m = markers.get(a.id);
  m.setPopupContent(formHtml(a)).openPopup();
}

map.on("click", (e) => {
  if (!editing) return;
  const a = normalise({ lat: e.latlng.lat.toFixed(6), lng: e.latlng.lng.toFixed(6), name: "New asset" });
  a.isNew = true;
  assets.push(a);
  render();
  openForm(a);
});

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const a = assets.find((x) => x.id === btn.dataset.id);
  if (!a) return;
  const act = btn.dataset.act;
  if (act === "edit") openForm(a);
  if (act === "cancel") {
    if (a.isNew) { assets = assets.filter((x) => x !== a); render(); }
    else markers.get(a.id).setPopupContent(viewHtml(a));
  }
  if (act === "delete") {
    if (btn.dataset.confirm) {
      assets = assets.filter((x) => x !== a);
      saveDraft();
      render();
      toast("Deleted " + (a.name || "asset"));
    } else {
      btn.dataset.confirm = "1";
      btn.textContent = "Click again to delete";
    }
  }
});

document.addEventListener("submit", (e) => {
  const form = e.target.closest(".pop form");
  if (!form) return;
  e.preventDefault();
  const a = assets.find((x) => x.id === form.dataset.id);
  const fd = new FormData(form);
  for (const k of ["name", "category", "status", "notes"]) a[k] = String(fd.get(k) || "").trim();
  a.links = String(fd.get("links") || "").split("\n").map((s) => s.trim())
    .filter((s) => parseLinks(s).length).join("; ");
  delete a.isNew;
  saveDraft();
  render();
  focusAsset(a.id);
  toast("Saved " + (a.name || "asset"));
});

$("editToggle").onclick = () => setEditing(!editing);

$("exportBtn").onclick = () => {
  const blob = new Blob([toCsv()], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "assets.csv";
  link.click();
  URL.revokeObjectURL(link.href);
  toast("Exported assets.csv");
};

$("importBtn").onclick = () => $("importFile").click();
$("importFile").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  assets = parseCsv(await file.text());
  saveDraft();
  render();
  fitAll();
  toast(`Imported ${assets.length} assets`);
  e.target.value = "";
};

$("resetBtn").onclick = async () => {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
  await loadSource();
  toast("Changes discarded");
};

$("search").oninput = renderList;
$("category").onchange = renderList;
$("list").onclick = (e) => {
  const li = e.target.closest("li[data-id]");
  if (li) focusAsset(li.dataset.id);
};

// ---- Load ------------------------------------------------------------------
async function loadSource() {
  const url = CONFIG.SHEET_CSV_URL || CONFIG.LOCAL_CSV;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status + " " + res.statusText);
    assets = parseCsv(await res.text());
  } catch (err) {
    console.error(err);
    assets = [];
    toast("Couldn't load assets: " + err.message);
  }
  render();
  fitAll();
}

(async function init() {
  const draft = loadDraft();
  if (Array.isArray(draft) && draft.length) {
    assets = draft;
    render();
    fitAll();
    toast("Showing your unsaved changes. Export CSV to keep them.");
  } else {
    await loadSource();
  }
})();
