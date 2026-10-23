/**
 * Mask tool (dev server only): make one mask per object instance by clicking on the room
 * painting. Smart select uses Segment Anything; the magic wand fills flat-coloured areas;
 * the rectangle, points, and free-curve tools draw an area by hand. Saved masks can be
 * shown on demand, and the test mode lists the objects a tap detects, by the game's
 * rules. The room's words can be added, removed, and given a difficulty. Masks and words
 * are saved through the dev-server API in server.js.
 */
import { LOGICAL_HEIGHT as H, LOGICAL_WIDTH as W } from '../../src/core/display.js';
import {
  addInto,
  area,
  compose,
  floodFill,
  fillPolygon,
  iou,
  masksAt,
  masksOverlay,
  maskToRgba,
  nextInstanceName,
  overlayPixels,
  rectangleCorners,
  rgbaToMask,
} from './mask-ops.js';
import { loadSam } from './sam.js';
import { idFromLabel } from './word-names.js';

const API = '/__mask-tool';
const $ = (id) => document.getElementById(id);
const paintingCanvas = /** @type {HTMLCanvasElement} */ ($('painting'));
const overlayCanvas = /** @type {HTMLCanvasElement} */ ($('overlay'));
const previewCanvas = /** @type {HTMLCanvasElement} */ ($('preview'));
for (const canvas of [paintingCanvas, overlayCanvas, previewCanvas]) {
  canvas.width = W;
  canvas.height = H;
}
const overlayCtx = overlayCanvas.getContext('2d');
const previewCtx = previewCanvas.getContext('2d');

const empty = () => new Uint8Array(W * H);

/** Colours of the saved masks when shown (as in the build's review image). */
const PALETTE = [
  [230, 25, 75],
  [60, 180, 75],
  [0, 130, 200],
  [245, 130, 48],
  [145, 30, 180],
  [70, 200, 220],
  [240, 50, 230],
  [150, 190, 30],
  [0, 128, 128],
  [170, 110, 40],
  [128, 0, 0],
  [0, 0, 128],
];
/** Test mode: the most specific mask a tap detects, then the others there. */
const TEST_COLOURS = { first: [230, 110, 0], other: [250, 200, 40] };

/** Tools that draw an area by hand. */
const SHAPE_TOOLS = new Set(['rect', 'polygon', 'free']);
const TOOL_HINTS = {
  sam: 'Click the object; Shift+click a part to leave out.',
  wand: 'Click a flat-coloured area to add it; Shift+click to remove one.',
  rect: 'Drag a rectangle to add it; hold Shift to remove it instead.',
  polygon:
    'Click the corners one by one, then click the first one, double-click, or press Enter. ' +
    'Shift at the first corner removes the area. Esc cancels, Ctrl+Z removes the last corner.',
  free: 'Drag around the area to add it; hold Shift to remove it instead.',
};
/** Points closer than this to the first corner close the shape (image pixels). */
const CLOSE_DISTANCE = 24;
/** Free curve: minimum distance between recorded points (image pixels). */
const FREE_STEP = 4;

const state = {
  rooms: [],
  room: null,
  /** @type {Uint8ClampedArray | null} painting pixels for the magic wand */
  painting: null,
  /** @type {Map<string, Uint8Array>} saved masks of the current room */
  saved: new Map(),
  /**
   * Saved masks with what display and testing need: depth, area, colour, label anchor.
   * @type {{ name: string, pixels: Uint8Array, depth: number, area: number,
   *   colour: [number, number, number], anchor: { x: number, y: number } }[]}
   */
  savedInfo: [],
  /** @type {Uint8ClampedArray | null} the saved masks' colours, computed when first shown */
  savedOverlay: null,
  showMasks: false,
  testing: false,
  /** @type {{ x: number, y: number, names: string[] } | null} the last test tap */
  testHit: null,
  /** @type {{ kind: string, label: 0 | 1, points: { x: number, y: number }[],
   *   hover?: { x: number, y: number } } | null} the shape being drawn */
  shape: null,
  instance: null,
  rename: null,
  layers: { base: empty(), sam: null, added: empty(), removed: empty() },
  points: [],
  candidates: [],
  candidate: 0,
  history: [],
  dirty: false,
  mode: 'sam',
  /** @type {Record<string, { label: string, prompt: string, accepted: string[] }>} */
  lexicon: {},
  /** Whether the add-word form's ID was typed by hand (else it follows the word). */
  wordIdEdited: false,
};

// --- Status and Segment Anything -------------------------------------------------------

function setStatus(text) {
  $('status').textContent = text;
}

let samPromise = null;
let encoded = null;

function sam() {
  samPromise ??= loadSam((p) => {
    if (p.status === 'progress' && p.file?.endsWith('.onnx')) {
      setStatus(`Downloading the segmentation model… ${Math.round(p.progress ?? 0)}%`);
    }
  }).catch((error) => {
    samPromise = null;
    throw error;
  });
  return samPromise;
}

/** Image embeddings of the current room's painting, computed once per room. */
function encodedPainting() {
  const roomId = state.room.id;
  if (encoded?.roomId !== roomId) {
    encoded = {
      roomId,
      promise: (async () => {
        const model = await sam();
        setStatus(`Analysing the painting (${model.device})… this takes a few seconds.`);
        const image = await model.encode(`${API}/rooms/${roomId}/painting?t=${Date.now()}`);
        setStatus('Ready: click an object.');
        return image;
      })(),
    };
    encoded.promise.catch(() => {
      encoded = null;
    });
  }
  return encoded.promise;
}

let segmenting = Promise.resolve();

async function runSam() {
  const points = [...state.points];
  if (!points.length) {
    state.layers.sam = null;
    state.candidates = [];
    render();
    return;
  }
  segmenting = segmenting.then(async () => {
    try {
      setStatus('Finding the outline…');
      const image = await encodedPainting();
      const { masks, scores } = await image.segment(points);
      // Order outlines from smallest to largest and start on the middle one: on cartoon
      // rooms the smallest is usually a part (a window pane, an oven door) and the
      // largest often spills onto the wall or furniture around the object.
      const ranked = masks.map((mask, i) => ({ mask, score: scores[i], area: area(mask) }));
      ranked.sort((a, b) => a.area - b.area);
      state.candidates = ranked;
      state.candidate = Math.min(1, ranked.length - 1);
      state.layers.sam = ranked[state.candidate].mask;
      setStatus('Outline found. Shift+click to exclude parts, or try outlines 1–3.');
    } catch (error) {
      console.error(error);
      setStatus(`Smart select failed: ${error.message}. The magic wand still works.`);
    }
    render();
  });
  return segmenting;
}

// --- Loading rooms and masks -----------------------------------------------------------

async function api(path, options) {
  const response = await fetch(`${API}${path}`, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? response.statusText);
  return body;
}

async function loadImagePixels(url) {
  const blob = await (await fetch(url)).blob();
  const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none' });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  return { bitmap, data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data };
}

async function loadRooms(selectId) {
  state.rooms = await api('/rooms');
  const select = /** @type {HTMLSelectElement} */ ($('room'));
  select.replaceChildren(
    ...state.rooms.map(
      (r) => new Option(`${r.title} (${r.masks.length}/${r.objects.length})`, r.id),
    ),
  );
  select.value = selectId ?? state.room?.id ?? state.rooms[0]?.id;
}

async function openRoom(roomId) {
  state.room = state.rooms.find((r) => r.id === roomId);
  closeWordForm();
  setStatus(`Loading ${state.room.title}…`);
  let painting;
  try {
    painting = await loadImagePixels(`${API}/rooms/${roomId}/painting?t=${Date.now()}`);
  } catch {
    paintingCanvas.getContext('2d').clearRect(0, 0, W, H);
    state.painting = null;
    state.saved.clear();
    selectInstance(null);
    setStatus(`${state.room.title} has no painting yet: use “Load new painting…”.`);
    return;
  }
  const { bitmap, data } = painting;
  if (bitmap.width !== W || bitmap.height !== H) {
    setStatus(`room.png is ${bitmap.width} × ${bitmap.height}; it must be ${W} × ${H}.`);
  }
  paintingCanvas.getContext('2d').drawImage(bitmap, 0, 0, W, H);
  state.painting = data;
  await loadSavedMasks();
  selectInstance(null);
  encodedPainting().catch((error) => setStatus(`Could not start smart select: ${error.message}`));
}

/** Uploads an image as the room's new painting (resized and cropped to 4:3 by the server). */
async function loadNewPainting(file) {
  const room = state.room;
  const clearMasks = /** @type {HTMLInputElement} */ ($('clear-masks')).checked;
  const warning = clearMasks
    ? `Replace the ${room.title} painting and delete its ${room.masks.length} mask(s)?`
    : `Replace the ${room.title} painting? Its ${room.masks.length} mask(s) are kept; ` +
      'they only fit if the objects are in the same places.';
  if (!confirm(warning)) return;

  try {
    setStatus(`Uploading ${file.name}…`);
    const result = await api(`/rooms/${room.id}/painting${clearMasks ? '?clearMasks=1' : ''}`, {
      method: 'PUT',
      body: file,
    });
    // The painting changed: its Segment Anything analysis must be redone.
    encoded = null;
    state.dirty = false;
    await loadRooms(room.id);
    await openRoom(room.id);
    const { width, height } = result.original;
    const notes = [
      `Loaded ${file.name} (${width} × ${height})`,
      result.cropped ? 'cropped to 4:3 and resized to 2048 × 1536' : 'resized to 2048 × 1536',
      result.deletedMasks ? `${result.deletedMasks} mask(s) deleted` : null,
    ];
    setStatus(`${notes.filter(Boolean).join('; ')}. Analysing it for smart select…`);
  } catch (error) {
    setStatus(`Could not load the painting: ${error.message}`);
  }
}

async function loadSavedMasks() {
  state.saved.clear();
  await Promise.all(
    state.room.masks.map(async (name) => {
      const { data } = await loadImagePixels(
        `${API}/rooms/${state.room.id}/masks/${encodeURIComponent(name)}?t=${Date.now()}`,
      );
      state.saved.set(name, rgbaToMask(data));
    }),
  );
  const depth = new Map(state.room.objects.map((o) => [o.id, o.depth ?? 0]));
  state.savedInfo = [...state.saved.keys()].sort().map((name, i) => {
    const pixels = state.saved.get(name);
    return {
      name,
      pixels,
      depth: depth.get(name.split('@')[0]) ?? 0,
      area: area(pixels),
      colour: PALETTE[i % PALETTE.length],
      anchor: labelAnchor(pixels),
    };
  });
  state.savedOverlay = null;
  state.testHit = null;
}

/** Where to write a mask's name: the middle of its middle row. */
function labelAnchor(mask) {
  let top = -1;
  let bottom = -1;
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue;
    if (top < 0) top = Math.floor(p / W);
    bottom = Math.floor(p / W);
  }
  const y = Math.floor((top + bottom) / 2);
  let left = W;
  let right = -1;
  for (let x = 0; x < W; x++) {
    if (!mask[y * W + x]) continue;
    left = Math.min(left, x);
    right = x;
  }
  return { x: (left + right) / 2, y };
}

// --- Editing -----------------------------------------------------------------------------

function selectInstance(name, { rename = null } = {}) {
  if (state.dirty && !confirm('Discard the unsaved changes to this mask?')) return false;
  state.instance = name;
  state.rename = rename;
  state.layers = {
    base: name && state.saved.has(name) ? state.saved.get(name).slice() : empty(),
    sam: null,
    added: empty(),
    removed: empty(),
  };
  state.points = [];
  state.candidates = [];
  state.history = [];
  state.shape = null;
  state.dirty = false;

  /** @type {HTMLFieldSetElement} */ ($('editing')).disabled = !name;
  $('editing-label').textContent = name ? 'Editing' : 'Pick an object to edit its mask';
  $('instance-name').textContent = name ?? '';
  $('delete').disabled = !name || !state.saved.has(name);
  renderObjects();
  render();
  return true;
}

function startNewInstance(objectId) {
  const { name, rename } = nextInstanceName(objectId, state.room.masks);
  selectInstance(name, { rename });
  setStatus(`New mask "${name}": click the object.`);
}

function working() {
  return compose(state.layers);
}

/** Whether a mask can be edited now; says why not otherwise. */
function canEdit() {
  if (!state.painting) {
    setStatus('Load a painting first.');
    return false;
  }
  if (!state.instance) {
    setStatus('Pick an object in the list first.');
    return false;
  }
  return true;
}

/**
 * Adds an area to the mask (label 1) or removes it (label 0), as one undo step.
 * @param {Uint8Array} region
 * @param {0 | 1} label
 */
function applyRegion(region, label) {
  state.dirty = true;
  state.history.push({
    type: 'region',
    added: state.layers.added.slice(),
    removed: state.layers.removed.slice(),
  });
  if (label) {
    addInto(state.layers.added, region);
    for (let p = 0; p < region.length; p++) if (region[p]) state.layers.removed[p] = 0;
  } else {
    addInto(state.layers.removed, region);
  }
  render();
}

/** @param {number} x @param {number} y @param {0 | 1} label */
async function clickAt(x, y, label) {
  if (!canEdit()) return;
  if (state.mode === 'wand') {
    const tolerance = Number(/** @type {HTMLInputElement} */ ($('tolerance')).value);
    applyRegion(floodFill(state.painting, W, H, x, y, tolerance), label);
    return;
  }
  state.dirty = true;
  state.points.push({ x, y, label });
  state.history.push({ type: 'point' });
  render();
  await runSam();
}

async function undo() {
  // While drawing points, undo removes the last corner.
  if (state.shape?.kind === 'polygon') {
    state.shape.points.pop();
    if (!state.shape.points.length) state.shape = null;
    drawPreview();
    return;
  }
  const last = state.history.pop();
  if (!last) return;
  if (last.type === 'region') {
    state.layers.added = last.added;
    state.layers.removed = last.removed;
    render();
  } else {
    state.points.pop();
    await runSam();
  }
}

function clear() {
  const keep = state.instance;
  state.dirty = false;
  selectInstance(keep, { rename: state.rename });
  state.layers.base = empty();
  state.dirty = true;
  render();
}

async function save() {
  const mask = working();
  if (!area(mask)) {
    setStatus('The mask is empty: click the object first.');
    return;
  }
  const roomId = state.room.id;
  const name = state.instance;
  try {
    if (state.rename) {
      await api(`/rooms/${roomId}/masks/${state.rename.from}/rename?to=${state.rename.to}`, {
        method: 'POST',
      });
    }
    const canvas = new OffscreenCanvas(W, H);
    canvas.getContext('2d').putImageData(new ImageData(maskToRgba(mask), W, H), 0, 0);
    const png = await canvas.convertToBlob({ type: 'image/png' });
    await api(`/rooms/${roomId}/masks/${encodeURIComponent(name)}`, { method: 'PUT', body: png });
    state.dirty = false;
    await refreshRoom(name);
    setStatus(`Saved "${name}". Pick the next object.`);
  } catch (error) {
    setStatus(`Could not save: ${error.message}`);
  }
}

async function remove() {
  const name = state.instance;
  if (!name || !confirm(`Delete the mask "${name}"?`)) return;
  try {
    await api(`/rooms/${state.room.id}/masks/${encodeURIComponent(name)}`, { method: 'DELETE' });
    state.dirty = false;
    await refreshRoom(null);
    setStatus(`Deleted "${name}".`);
  } catch (error) {
    setStatus(`Could not delete: ${error.message}`);
  }
}

async function refreshRoom(selectName) {
  const roomId = state.room.id;
  await loadRooms(roomId);
  state.room = state.rooms.find((r) => r.id === roomId);
  await loadSavedMasks();
  selectInstance(selectName);
}

// --- Words of the room ---------------------------------------------------------------------

/** Whether unsaved changes to the mask may be dropped (asks if there are any). */
function mayDiscard() {
  if (state.dirty && !confirm('Discard the unsaved changes to this mask?')) return false;
  state.dirty = false;
  return true;
}

const wordField = (id) => /** @type {HTMLInputElement} */ ($(id));

/** The lexicon entry a typed word refers to, by label or ID, if there is one. */
function lexiconMatch(text) {
  const typed = text.trim().toLowerCase();
  if (!typed) return null;
  const id = idFromLabel(typed);
  if (state.lexicon[id]) return id;
  return Object.keys(state.lexicon).find((k) => state.lexicon[k].label === typed) ?? null;
}

async function openWordForm() {
  try {
    state.lexicon = await api('/lexicon');
  } catch (error) {
    setStatus(`Could not load the lexicon: ${error.message}`);
    return;
  }
  const inRoom = new Set(state.room.objects.map((o) => o.id));
  $('lexicon-words').replaceChildren(
    ...Object.entries(state.lexicon)
      .filter(([id]) => !inRoom.has(id))
      .map(([id, entry]) => new Option(id, entry.label)),
  );
  /** @type {HTMLFormElement} */ ($('word-form')).reset();
  state.wordIdEdited = false;
  updateWordForm();
  $('word-form').hidden = false;
  $('add-word').setAttribute('aria-expanded', 'true');
  wordField('word-label').focus();
}

function closeWordForm() {
  $('word-form').hidden = true;
  $('add-word').setAttribute('aria-expanded', 'false');
}

/** Shows whether the typed word reuses a lexicon entry, and fills in the derived fields. */
function updateWordForm() {
  const label = wordField('word-label').value.trim();
  const match = lexiconMatch(label);
  $('word-new').hidden = !!match;
  $('word-reuse').hidden = !match;
  if (match) {
    const entry = state.lexicon[match];
    $('word-reuse').textContent =
      `“${entry.label}” (${match}) is already in the lexicon and will be reused ` +
      `(accepts: ${entry.accepted.join(', ')}).`;
    return;
  }
  if (!state.wordIdEdited) wordField('word-id').value = idFromLabel(label);
  wordField('word-prompt').placeholder = label ? `Find the ${label}.` : '';
}

async function addWord() {
  if (!mayDiscard()) return;
  const label = wordField('word-label').value.trim();
  const match = lexiconMatch(label);
  const difficulty = Number(/** @type {HTMLSelectElement} */ ($('word-difficulty')).value);
  const word = match
    ? { id: match, difficulty }
    : {
        id: wordField('word-id').value.trim(),
        label,
        prompt: wordField('word-prompt').value.trim(),
        accepted: wordField('word-accepted').value.split(','),
        difficulty,
      };
  try {
    const { id, reused } = await api(`/rooms/${state.room.id}/words`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(word),
    });
    closeWordForm();
    await refreshRoom(null);
    startNewInstance(id);
    setStatus(
      `Added “${id}” to ${state.room.title}${reused ? ' (lexicon entry reused)' : ''}. ` +
        'Click it in the painting to make its mask.',
    );
  } catch (error) {
    setStatus(`Could not add the word: ${error.message}`);
  }
}

async function removeWord(object) {
  const masks = state.room.masks.filter((n) => n === object.id || n.startsWith(`${object.id}@`));
  const question =
    `Remove “${object.label}” from ${state.room.title}?` +
    (masks.length ? ` Its ${masks.length} mask(s) will be deleted.` : '') +
    ' Its lexicon entry stays.';
  if (!confirm(question) || !mayDiscard()) return;
  try {
    const { deletedMasks } = await api(`/rooms/${state.room.id}/words/${object.id}`, {
      method: 'DELETE',
    });
    await refreshRoom(null);
    setStatus(`Removed “${object.label}”; ${deletedMasks} mask(s) deleted.`);
  } catch (error) {
    setStatus(`Could not remove the word: ${error.message}`);
  }
}

async function setDifficulty(object, difficulty) {
  try {
    await api(`/rooms/${state.room.id}/words/${object.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ difficulty }),
    });
    object.difficulty = difficulty;
    setStatus(`“${object.label}” now has difficulty ${difficulty}.`);
  } catch (error) {
    setStatus(`Could not change the difficulty: ${error.message}`);
    renderObjects();
  }
}

// --- Drawing tools (rectangle, points, free curve) ---------------------------------------

/** @param {{ x: number, y: number }} point @param {0 | 1} label @param {PointerEvent} event */
function shapeDown(point, label, event) {
  if (!canEdit()) return;
  if (state.mode === 'polygon') {
    if (!state.shape) {
      state.shape = { kind: 'polygon', label, points: [point], hover: point };
    } else {
      const [first] = state.shape.points;
      const near = Math.hypot(point.x - first.x, point.y - first.y) <= CLOSE_DISTANCE;
      if (near && state.shape.points.length >= 3) {
        finishShape();
        return;
      }
      state.shape.points.push(point);
    }
    drawPreview();
    return;
  }
  // Rectangle and free curve: drag. Capture the pointer to get the release outside too.
  overlayCanvas.setPointerCapture(event.pointerId);
  state.shape = { kind: state.mode, label, points: [point, point] };
  drawPreview();
}

/** @param {{ x: number, y: number }} point */
function shapeMove(point) {
  const shape = state.shape;
  if (!shape) return;
  if (shape.kind === 'rect') shape.points[1] = point;
  else if (shape.kind === 'polygon') shape.hover = point;
  else {
    const last = shape.points[shape.points.length - 1];
    if (Math.hypot(point.x - last.x, point.y - last.y) < FREE_STEP) return;
    shape.points.push(point);
  }
  drawPreview();
}

function shapeUp() {
  if (state.shape && state.shape.kind !== 'polygon') finishShape();
}

/** Fills the shape into the mask, or drops it if it has no area. */
function finishShape() {
  const shape = state.shape;
  state.shape = null;
  drawPreview();
  if (!shape) return;
  const corners = shape.kind === 'rect' ? rectangleCorners(...shape.points) : shape.points;
  const region = fillPolygon(corners, W, H);
  if (!area(region)) {
    setStatus('That shape has no area: draw a bigger one.');
    return;
  }
  applyRegion(region, shape.label);
  setStatus(shape.label ? 'Area added.' : 'Area removed.');
}

function cancelShape() {
  state.shape = null;
  drawPreview();
}

/** Draws the shape being drawn on the preview layer. */
function drawPreview() {
  previewCtx.clearRect(0, 0, W, H);
  const shape = state.shape;
  if (!shape) return;
  const points =
    shape.kind === 'rect'
      ? rectangleCorners(...shape.points)
      : shape.kind === 'polygon' && shape.hover
        ? [...shape.points, shape.hover]
        : shape.points;
  previewCtx.beginPath();
  points.forEach((p, i) => (i ? previewCtx.lineTo(p.x, p.y) : previewCtx.moveTo(p.x, p.y)));
  if (shape.kind !== 'polygon') previewCtx.closePath();
  previewCtx.fillStyle = shape.label ? 'rgba(40, 220, 90, 0.3)' : 'rgba(220, 40, 40, 0.3)';
  previewCtx.fill('evenodd');
  previewCtx.lineWidth = 6;
  previewCtx.strokeStyle = '#ffffff';
  previewCtx.stroke();
  previewCtx.lineWidth = 3;
  previewCtx.setLineDash([12, 8]);
  previewCtx.strokeStyle = shape.label ? '#0b5d1e' : '#8c1d18';
  previewCtx.stroke();
  previewCtx.setLineDash([]);
  if (shape.kind === 'polygon') {
    shape.points.forEach((p, i) => {
      previewCtx.beginPath();
      previewCtx.arc(p.x, p.y, i ? 8 : CLOSE_DISTANCE / 2, 0, Math.PI * 2);
      previewCtx.fillStyle = i ? '#ffffff' : '#ffd000';
      previewCtx.fill();
      previewCtx.lineWidth = 3;
      previewCtx.strokeStyle = '#1f2a44';
      previewCtx.stroke();
    });
  }
}

// --- Showing saved masks and testing taps ------------------------------------------------

/** @param {boolean} on */
function setShowMasks(on) {
  state.showMasks = on;
  /** @type {HTMLInputElement} */ ($('show-masks')).checked = on;
  render();
}

/** @param {boolean} on */
function setTesting(on) {
  if (on && state.dirty && !confirm('Discard the unsaved changes to this mask?')) return;
  if (on) {
    state.dirty = false;
    selectInstance(null);
  }
  cancelShape();
  state.testing = on;
  state.testHit = null;
  document.body.classList.toggle('testing', on);
  $('test-taps').setAttribute('aria-pressed', String(on));
  $('test-result').hidden = !on;
  $('test-result').textContent = on ? 'Click the painting to see what a tap there detects.' : '';
  setStatus(on ? 'Test mode: clicks do not change any mask.' : '');
  render();
}

/** An instance's word, from the room's objects: "chair@2" → "chair". */
function objectLabel(name) {
  return state.room.objects.find((o) => o.id === name.split('@')[0])?.label ?? name;
}

/** Lists the objects a tap at (x, y) detects, by the game's rules, from the saved masks. */
function testAt(x, y) {
  const names = masksAt(state.savedInfo, y * W + x);
  state.testHit = { x, y, names };
  const result = $('test-result');
  if (!names.length) {
    result.textContent = 'Nothing here: a tap on this point is ignored.';
  } else if (names.length === 1) {
    result.textContent = `A tap here detects ${objectLabel(names[0])} (${names[0]}).`;
  } else {
    result.textContent =
      `A tap here detects ${names.length} objects: ${names.map((n) => `${objectLabel(n)} (${n})`).join(', ')}. ` +
      `It counts for any of them; a wrong tap shows ${objectLabel(names[0])}.`;
  }
  render();
}

/** The saved masks in their colours, computed once per room and masks. */
function savedOverlay() {
  state.savedOverlay ??= masksOverlay(state.savedInfo, W, W * H);
  return state.savedOverlay;
}

/** Writes each saved mask's name on it. */
function drawLabels() {
  overlayCtx.font = 'bold 30px system-ui, sans-serif';
  overlayCtx.textAlign = 'center';
  overlayCtx.textBaseline = 'middle';
  for (const { name, anchor } of state.savedInfo) {
    const width = overlayCtx.measureText(name).width + 20;
    overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    overlayCtx.fillRect(anchor.x - width / 2, anchor.y - 22, width, 44);
    overlayCtx.fillStyle = '#ffffff';
    overlayCtx.fillText(name, anchor.x, anchor.y);
  }
}

// --- Rendering ---------------------------------------------------------------------------

function render() {
  if (state.testing) {
    renderTest();
    return;
  }
  const under = state.showMasks ? savedOverlay() : null;
  const pixels = overlayPixels(working(), W, under);
  overlayCtx.putImageData(new ImageData(pixels, W, H), 0, 0);
  if (state.showMasks) drawLabels();
  for (const p of state.points) {
    overlayCtx.beginPath();
    overlayCtx.arc(p.x, p.y, 14, 0, Math.PI * 2);
    overlayCtx.fillStyle = p.label ? '#2e7d32' : '#b3261e';
    overlayCtx.fill();
    overlayCtx.lineWidth = 5;
    overlayCtx.strokeStyle = '#ffffff';
    overlayCtx.stroke();
  }
  document.querySelectorAll('[data-candidate]').forEach((button) => {
    const i = Number(button.dataset.candidate);
    button.disabled = !state.candidates[i];
    button.setAttribute('aria-pressed', String(i === state.candidate && !!state.candidates[i]));
  });
}

/** Test mode: the saved masks on demand, the masks the last tap detected, and the tap. */
function renderTest() {
  const hit = state.testHit;
  const detected = (hit?.names ?? []).map((name, i) => ({
    pixels: state.saved.get(name),
    colour: i ? TEST_COLOURS.other : TEST_COLOURS.first,
  }));
  const under = state.showMasks ? savedOverlay() : null;
  const pixels = detected.length
    ? masksOverlay(detected, W, W * H)
    : (under?.slice() ?? new Uint8ClampedArray(W * H * 4));
  // Dim the rest of the painting, so the detected masks stand out whole.
  if (detected.length) {
    for (let o = 3; o < pixels.length; o += 4) if (!pixels[o]) pixels[o] = 120;
  }
  overlayCtx.putImageData(new ImageData(pixels, W, H), 0, 0);
  if (state.showMasks) drawLabels();
  if (!hit) return;
  overlayCtx.beginPath();
  overlayCtx.arc(hit.x, hit.y, 16, 0, Math.PI * 2);
  overlayCtx.fillStyle = '#1f2a44';
  overlayCtx.fill();
  overlayCtx.lineWidth = 6;
  overlayCtx.strokeStyle = '#ffffff';
  overlayCtx.stroke();
  drawTapTag(hit);
}

/** Names the detected objects next to the tap, one line each in its highlight colour. */
function drawTapTag(hit) {
  if (!hit.names.length) return;
  const lines = hit.names.map((name, i) => ({
    text: objectLabel(name) === name ? name : `${objectLabel(name)} (${name})`,
    colour: i ? TEST_COLOURS.other : TEST_COLOURS.first,
  }));
  const [lineHeight, pad, swatch, gap] = [44, 14, 22, 30];
  overlayCtx.font = 'bold 32px system-ui, sans-serif';
  overlayCtx.textAlign = 'left';
  overlayCtx.textBaseline = 'middle';
  const textWidth = Math.max(...lines.map((l) => overlayCtx.measureText(l.text).width));
  const width = pad * 3 + swatch + textWidth;
  const height = pad * 2 + lineHeight * lines.length;
  // Right of the tap, or left of it near the right edge; kept inside the painting.
  const left = hit.x + gap + width <= W ? hit.x + gap : hit.x - gap - width;
  const top = Math.min(Math.max(0, hit.y - height / 2), H - height);
  overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.78)';
  overlayCtx.beginPath();
  overlayCtx.roundRect(Math.max(0, left), top, width, height, 12);
  overlayCtx.fill();
  lines.forEach(({ text, colour }, i) => {
    const y = top + pad + lineHeight * (i + 0.5);
    const x = Math.max(0, left) + pad;
    overlayCtx.fillStyle = `rgb(${colour.join(', ')})`;
    overlayCtx.fillRect(x, y - swatch / 2, swatch, swatch);
    overlayCtx.fillStyle = '#ffffff';
    overlayCtx.fillText(text, x + swatch + pad, y);
  });
}

function renderObjects() {
  const list = $('objects');
  list.replaceChildren(
    ...state.room.objects.map((object) => {
      const item = document.createElement('li');
      const masks = state.room.masks.filter(
        (n) => n === object.id || n.startsWith(`${object.id}@`),
      );
      const word = document.createElement('div');
      word.className = 'word';
      const label = document.createElement('span');
      label.className = `label${masks.length ? '' : ' missing'}`;
      label.textContent = `${object.label}${masks.length ? '' : ' — no mask yet'}`;

      const difficulty = document.createElement('select');
      difficulty.title = 'Difficulty (1 easiest, 3 hardest)';
      difficulty.setAttribute('aria-label', `Difficulty of ${object.label}`);
      difficulty.append(...[1, 2, 3].map((d) => new Option(`D${d}`, String(d))));
      if (!object.difficulty) difficulty.prepend(new Option('D–', ''));
      difficulty.value = String(object.difficulty ?? '');
      difficulty.addEventListener('change', () => setDifficulty(object, Number(difficulty.value)));

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'remove-word';
      removeButton.textContent = '×';
      removeButton.title = `Remove ${object.label} from the room`;
      removeButton.setAttribute('aria-label', `Remove ${object.label}`);
      removeButton.addEventListener('click', () => removeWord(object));

      word.append(label, difficulty, removeButton);
      item.append(word);

      for (const name of masks) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'done';
        button.textContent = name;
        button.setAttribute('aria-pressed', String(name === state.instance));
        button.addEventListener('click', () => {
          if (selectInstance(name)) setStatus(`Editing "${name}".`);
        });
        item.append(button);
      }

      const add = document.createElement('button');
      add.type = 'button';
      add.textContent = masks.length ? '+ another' : 'Make mask';
      add.addEventListener('click', () => startNewInstance(object.id));
      item.append(add);
      return item;
    }),
  );
}

// --- Side panel width ----------------------------------------------------------------------

const PANEL_WIDTH_KEY = 'words.maskTool.panelWidth';
const PANEL_DEFAULT = 510;
const PANEL_MIN = 280;
/** Arrow keys move the resize handle by this much (Shift: five times more). */
const PANEL_STEP = 16;

/** The widest the panel may be: half the window, so the painting keeps room. */
const panelMax = () => Math.max(PANEL_MIN, Math.floor(window.innerWidth / 2));

let panelWidth = PANEL_DEFAULT;
/** The width last chosen, restored as far as the window allows when it grows again. */
let panelChosen = PANEL_DEFAULT;

/** Sets the panel width, within its limits; `remember` saves it for the next session. */
function setPanelWidth(width, { remember = false } = {}) {
  panelWidth = Math.round(Math.min(panelMax(), Math.max(PANEL_MIN, width)));
  document.body.style.setProperty('--panel-width', `${panelWidth}px`);
  const handle = $('resizer');
  handle.setAttribute('aria-valuemin', String(PANEL_MIN));
  handle.setAttribute('aria-valuemax', String(panelMax()));
  handle.setAttribute('aria-valuenow', String(panelWidth));
  if (!remember) return;
  panelChosen = panelWidth;
  try {
    localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth));
  } catch {
    // Storage can be unavailable (private window); the width then lasts this session.
  }
}

function initPanelWidth() {
  let saved = NaN;
  try {
    saved = Number(localStorage.getItem(PANEL_WIDTH_KEY));
  } catch {
    // As above: fall back to the default width.
  }
  panelChosen = saved > 0 ? saved : PANEL_DEFAULT;
  setPanelWidth(panelChosen);

  const handle = $('resizer');
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add('resizing');
  });
  handle.addEventListener('pointermove', (event) => {
    if (!handle.hasPointerCapture(event.pointerId)) return;
    setPanelWidth(event.clientX - $('panel').getBoundingClientRect().left);
  });
  const endDrag = (event) => {
    if (!handle.hasPointerCapture(event.pointerId)) return;
    handle.releasePointerCapture(event.pointerId);
    document.body.classList.remove('resizing');
    setPanelWidth(panelWidth, { remember: true });
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
  handle.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? PANEL_STEP * 5 : PANEL_STEP;
    const target = {
      ArrowLeft: panelWidth - step,
      ArrowRight: panelWidth + step,
      Home: PANEL_MIN,
      End: panelMax(),
    }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    setPanelWidth(target, { remember: true });
  });
  // Keep the panel within half the window when the window shrinks.
  window.addEventListener('resize', () => setPanelWidth(panelChosen));
}

// --- Events ------------------------------------------------------------------------------

function imagePoint(event) {
  const rect = overlayCanvas.getBoundingClientRect();
  return {
    x: Math.min(W - 1, Math.max(0, Math.floor(((event.clientX - rect.left) * W) / rect.width))),
    y: Math.min(H - 1, Math.max(0, Math.floor(((event.clientY - rect.top) * H) / rect.height))),
  };
}

overlayCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
overlayCanvas.addEventListener('pointerdown', (event) => {
  const point = imagePoint(event);
  const label = event.shiftKey || event.button === 2 ? 0 : 1;
  if (state.testing) testAt(point.x, point.y);
  else if (SHAPE_TOOLS.has(state.mode)) shapeDown(point, label, event);
  else clickAt(point.x, point.y, label);
});
overlayCanvas.addEventListener('pointermove', (event) => {
  if (state.shape) shapeMove(imagePoint(event));
});
overlayCanvas.addEventListener('pointerup', shapeUp);
overlayCanvas.addEventListener('dblclick', () => {
  if (state.shape?.kind === 'polygon') finishShape();
});

$('room').addEventListener('change', (e) => {
  if (state.dirty && !confirm('Discard the unsaved changes to this mask?')) {
    e.target.value = state.room.id;
    return;
  }
  state.dirty = false;
  if (state.testing) setTesting(false);
  openRoom(e.target.value);
});

$('load-painting').addEventListener('click', () => {
  if (state.dirty && !confirm('Discard the unsaved changes to this mask?')) return;
  $('painting-file').click();
});
$('painting-file').addEventListener('change', (e) => {
  const [file] = e.target.files;
  e.target.value = '';
  if (file) loadNewPainting(file);
});

/** @param {string} mode */
function setMode(mode) {
  cancelShape();
  state.mode = mode;
  $('tolerance-field').hidden = mode !== 'wand';
  $('candidates-row').hidden = mode !== 'sam';
  $('tool-hint').textContent = TOOL_HINTS[mode];
}
document
  .querySelectorAll('input[name="mode"]')
  .forEach((input) => input.addEventListener('change', () => setMode(input.value)));
setMode(state.mode);
$('show-masks').addEventListener('change', (e) => setShowMasks(e.target.checked));
$('test-taps').addEventListener('click', () => setTesting(!state.testing));
$('tolerance').addEventListener('input', (e) => {
  $('tolerance-value').textContent = e.target.value;
});
document.querySelectorAll('[data-candidate]').forEach((button) =>
  button.addEventListener('click', () => {
    const i = Number(button.dataset.candidate);
    if (!state.candidates[i]) return;
    state.candidate = i;
    state.layers.sam = state.candidates[i].mask;
    render();
  }),
);
$('add-word').addEventListener('click', () => {
  if ($('word-form').hidden) openWordForm();
  else closeWordForm();
});
$('word-cancel').addEventListener('click', closeWordForm);
$('word-label').addEventListener('input', updateWordForm);
$('word-id').addEventListener('input', () => {
  state.wordIdEdited = wordField('word-id').value.trim() !== '';
});
$('word-form').addEventListener('submit', (event) => {
  event.preventDefault();
  addWord();
});
$('undo').addEventListener('click', undo);
$('clear').addEventListener('click', clear);
$('save').addEventListener('click', save);
$('delete').addEventListener('click', remove);
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
    event.preventDefault();
    undo();
  } else if (event.target instanceof HTMLInputElement && event.target.type !== 'radio') {
    // Keys typed into a field are not shortcuts.
  } else if (event.key === 'Enter' && state.shape?.kind === 'polygon') {
    event.preventDefault();
    finishShape();
  } else if (event.key === 'Escape' && state.shape) {
    cancelShape();
  } else if (event.key === 'm' || event.key === 'M') {
    setShowMasks(!state.showMasks);
  }
});
window.addEventListener('beforeunload', (event) => {
  if (state.dirty) event.preventDefault();
});

// Hooks for scripted checks of the tool (dev only).
window.__maskTool = {
  state,
  clickAt,
  save,
  select: (name) => selectInstance(name),
  newInstance: startNewInstance,
  ready: () => encodedPainting(),
  settled: () => segmenting,
  area: () => area(working()),
  iouWithSaved: (name) => iou(working(), state.saved.get(name)),
  setMode,
  setShowMasks,
  setTesting,
  testAt,
};

initPanelWidth();
try {
  await loadRooms();
  await openRoom($('room').value);
} catch (error) {
  setStatus(`Could not load rooms: ${error.message}. Is the dev server running (npm run masks)?`);
}
