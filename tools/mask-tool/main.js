/**
 * Mask tool (dev server only): make one mask per object instance by clicking on the room
 * painting. Smart select uses Segment Anything; the magic wand fills flat-coloured areas.
 * Masks are saved through the dev-server API in server.js.
 */
import { LOGICAL_HEIGHT as H, LOGICAL_WIDTH as W } from '../../src/core/display.js';
import {
  addInto,
  area,
  compose,
  floodFill,
  iou,
  maskToRgba,
  nextInstanceName,
  overlayPixels,
  rgbaToMask,
} from './mask-ops.js';
import { loadSam } from './sam.js';

const API = '/__mask-tool';
const $ = (id) => document.getElementById(id);
const paintingCanvas = /** @type {HTMLCanvasElement} */ ($('painting'));
const overlayCanvas = /** @type {HTMLCanvasElement} */ ($('overlay'));
for (const canvas of [paintingCanvas, overlayCanvas]) {
  canvas.width = W;
  canvas.height = H;
}
const overlayCtx = overlayCanvas.getContext('2d');

const empty = () => new Uint8Array(W * H);

const state = {
  rooms: [],
  room: null,
  /** @type {Uint8ClampedArray | null} painting pixels for the magic wand */
  painting: null,
  /** @type {Map<string, Uint8Array>} saved masks of the current room */
  saved: new Map(),
  /** union of the saved masks other than the one being edited */
  others: empty(),
  instance: null,
  rename: null,
  layers: { base: empty(), sam: null, added: empty(), removed: empty() },
  points: [],
  candidates: [],
  candidate: 0,
  history: [],
  dirty: false,
  mode: 'sam',
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
  setStatus(`Loading ${state.room.title}…`);
  const { bitmap, data } = await loadImagePixels(`${API}/rooms/${roomId}/painting?t=${Date.now()}`);
  if (bitmap.width !== W || bitmap.height !== H) {
    setStatus(`room.png is ${bitmap.width} × ${bitmap.height}; it must be ${W} × ${H}.`);
  }
  paintingCanvas.getContext('2d').drawImage(bitmap, 0, 0, W, H);
  state.painting = data;
  await loadSavedMasks();
  selectInstance(null);
  encodedPainting().catch((error) => setStatus(`Could not start smart select: ${error.message}`));
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
  state.dirty = false;

  state.others = empty();
  for (const [other, mask] of state.saved) if (other !== name) addInto(state.others, mask);

  $('editing').hidden = !name;
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

/** @param {number} x @param {number} y @param {0 | 1} label */
async function clickAt(x, y, label) {
  if (!state.instance) {
    setStatus('Pick an object in the list first.');
    return;
  }
  state.dirty = true;
  if (state.mode === 'wand') {
    const tolerance = Number(/** @type {HTMLInputElement} */ ($('tolerance')).value);
    const region = floodFill(state.painting, W, H, x, y, tolerance);
    state.history.push({
      type: 'wand',
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
    return;
  }
  state.points.push({ x, y, label });
  state.history.push({ type: 'point' });
  render();
  await runSam();
}

async function undo() {
  const last = state.history.pop();
  if (!last) return;
  if (last.type === 'wand') {
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

// --- Rendering ---------------------------------------------------------------------------

function render() {
  const pixels = overlayPixels(working(), state.others, W);
  overlayCtx.putImageData(new ImageData(pixels, W, H), 0, 0);
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

function renderObjects() {
  const list = $('objects');
  list.replaceChildren(
    ...state.room.objects.map((object) => {
      const item = document.createElement('li');
      const masks = state.room.masks.filter(
        (n) => n === object.id || n.startsWith(`${object.id}@`),
      );
      const label = document.createElement('span');
      label.className = `label${masks.length ? '' : ' missing'}`;
      label.textContent = `${object.label}${masks.length ? '' : ' — no mask yet'}`;
      item.append(label);

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
  const { x, y } = imagePoint(event);
  clickAt(x, y, event.shiftKey || event.button === 2 ? 0 : 1);
});

$('room').addEventListener('change', (e) => {
  if (state.dirty && !confirm('Discard the unsaved changes to this mask?')) {
    e.target.value = state.room.id;
    return;
  }
  state.dirty = false;
  openRoom(e.target.value);
});

document.querySelectorAll('input[name="mode"]').forEach((input) =>
  input.addEventListener('change', () => {
    state.mode = input.value;
    $('tolerance-field').hidden = state.mode !== 'wand';
  }),
);
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
$('undo').addEventListener('click', undo);
$('clear').addEventListener('click', clear);
$('save').addEventListener('click', save);
$('delete').addEventListener('click', remove);
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
    event.preventDefault();
    undo();
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
};

try {
  await loadRooms();
  await openRoom($('room').value);
} catch (error) {
  setStatus(`Could not load rooms: ${error.message}. Is the dev server running (npm run masks)?`);
}
