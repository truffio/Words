# Words: Making Masks

*One black-and-white mask per object instance tells the game where each object is. Plan: [TECHNICAL.md §4–§5](../../TECHNICAL.md#4-scene-and-content-model) · Style: [style-guide.md](style-guide.md)*

---

## 1. The Mask Tool

The mask tool runs in your browser with the dev server. It finds an object's outline from a click, using **Segment Anything** (SlimSAM, by Meta, Apache-2.0 licence) through Transformers.js. The model downloads once (about 50 MB) from Hugging Face, is cached by the browser, and runs **on your computer**: the painting is not uploaded anywhere.

```sh
npm run masks        # opens http://localhost:8080/tools/mask-tool/
```

The tool is not part of the game build; it only exists on the dev server.

### Loading a Painting

1. Pick the room, then **Load new painting…** and choose the image (PNG, JPEG, or WebP, any size).
2. The tool saves it as `content/rooms/<room>/room.png` at **2048 × 1536**. An image that is not 4:3 is **cropped in the centre** to 4:3 (never stretched); the status line says when this happens, so check that no object was cut off.
3. Existing masks are **kept** by default, which is right when the new painting has the objects in the same places (a retouched version). Tick **Delete this room's masks when loading** for a different painting.
4. Smart select analyses the new painting (about 10 seconds), then you can make masks.

### Making a Mask

1. **Pick the room** at the top of the panel. The object list shows which objects already have masks (✓) and which do not (in red).
2. **Pick an object:** *Make mask* for an object without a mask, or a ✓ button to edit an existing one. Use **+ another** for a second instance (a second chair): the tool names it `chair@2` and renames the first one to `chair@1`.
3. **Click the object** once. After a moment the outline appears in green. The first click on a new room also analyses the painting, which takes about 10 seconds.
4. **Adjust:**
   - **Outline 1–3:** three suggestions from small to large. The middle one is selected first; try the others if the outline is too small (only part of the object) or too large (spills onto the wall).
   - **Click another part** of the object to add it (a tap and its sink, the legs of a table).
   - **Shift+click** (or right-click) a part that should **not** be included.
   - **Magic wand:** fills a flat-coloured area up to the outlines, handy for cartoon art. Click to add an area, Shift+click to remove one. The tolerance slider sets how different a colour can be and still be filled.
   - **Undo** (Ctrl+Z) and **Clear**.
5. **Save mask.** The tool writes `content/rooms/<room>/masks/<objectId>.png` at 2048 × 1536, and moves on.

Other objects' masks are shown in faint blue, so you can see what is still missing.

### Tips

- **Cover the visible object only.** Where objects overlap (a cup on a table), it is fine for both masks to include the overlap: `build:rooms` gives contested pixels to the smaller object, or to the one with the higher `depth` in the manifest.
- **Thin parts** (chair legs) are easier with an extra click on each part. They do not need to be perfect: the build adds 8 px of padding around every object.
- **Small objects** are grown to a comfortable tap size automatically.
- Speed: on a recent laptop each click takes well under a second; with WebGPU (Chrome, Edge) it is faster than with the WebAssembly fallback.

---

## 2. Checking the Result

```sh
npm run build:rooms
```

- The build lists problems (wrong names or sizes, objects without masks) and warnings (overlaps and their winner, objects too small to pad).
- Open **`reports/rooms/<room>-debug-hits.png`**: every final clickable area in its own colour, labelled, with its tap point. Check that there are no gaps, no areas assigned to the wrong object, and that small objects are padded.
- In the game, `npm run dev` then `http://localhost:8080/?debug=hits` shows the same areas live; click every object to check.

---

## 3. File Rules

The tool follows these rules automatically; they matter if a mask is made another way.

- **Location:** `content/rooms/<room>/masks/`.
- **Name:** `<objectId>.png`, or `<objectId>@<n>.png` for several instances (`chair@1.png`, `chair@2.png`). The object ID must be in the room's manifest.
- **Format:** PNG, exactly the painting's size (2048 × 1536); white (or any light grey ≥ 128) inside the object, black outside. Transparency is treated as black.

**Other tools:** any image editor with layers works too (Krita and GIMP are free): put each object on its own layer, fill it white on black, and export each layer as a PNG with the right name.
