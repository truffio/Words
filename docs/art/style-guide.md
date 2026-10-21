# Words: Art Style Guide

*How to produce room paintings for Words. Plan: [TECHNICAL.md §5](../../TECHNICAL.md#5-content-creation-workflow) · Masks: [masks.md](masks.md)*

---

## 1. The Style in One Sentence

**A cute cartoon room in kawaii style, seen in isometric view: a cutaway room viewed from above at an angle, with rounded friendly shapes, soft pastel colours, clean dark outlines, and flat or lightly shaded colour.**

Every room uses the same style, so the game feels like one world.

---

## 2. Rules

### Camera and Composition

- **Isometric cutaway room:** floor plus two walls (back-left and back-right), seen from above at the classic isometric angle, as if the front walls and ceiling were removed. No perspective distortion.
- **Same camera for every room:** same angle, same room size on the canvas, floor corner near the bottom centre.
- **Canvas:** 4:3 landscape, final size **2048 × 1536 px**.
- **Safe margin:** keep every vocabulary object at least 60 px from the edges, so nothing is cropped on different screens.
- **Spread the objects out.** Each vocabulary object must be clearly visible and recognisable. Avoid stacks, piles, and objects hidden behind others. Small overlaps (a cup on a table) are fine.
- **Size:** each vocabulary object should be at least about 100 × 100 px on the final canvas; small things (cup, spoon) go on a table or counter where they stand out.

### Look

- **Kawaii:** rounded corners, soft chunky shapes, slightly oversized and simplified objects, a cheerful cosy mood.
- **Outlines:** clean, dark (deep navy or brown, not pure black), even width, around every object. Outlines help children see objects and help the mask tool find them.
- **Colour:** soft pastel palette, bright but not neon. Each object has a clearly different colour from what touches it (a white fridge against a pastel wall, not white on white).
- **Shading:** flat colour or soft cel shading; no strong gradients, textures, or photo-realism.
- **Light:** soft, even daylight; no dramatic shadows or dark corners.

### Content

- **No text** anywhere: no letters, numbers, labels, logos, or writing on objects (clock faces may show simple marks, not numbers).
- **No people.** A pet or plant may appear as decoration.
- **No faces on vocabulary objects**, so they look like the real thing the child must name. Decorative items (a plant pot, a pet) may have a cute face.
- **Recognisable, everyday versions** of each object: a typical refrigerator, not a novelty one.
- **No clutter that looks like vocabulary:** decorative items must not be confused with the room's words (no second, unlabelled kettle).

---

## 3. Prompt Template

Use the same template for every room. Replace the parts in `{braces}`.

```
Cute kawaii cartoon illustration of a {room} interior, isometric view, cutaway room
showing the floor and two walls from above, viewed from the front corner.
Rounded friendly shapes, soft pastel colour palette, clean dark navy outlines,
flat colours with soft cel shading, soft even daylight, cosy and cheerful.
The room clearly shows these objects, each one separate and easy to see:
{object list, comma-separated}.
Children's educational game art, clean and uncluttered, high detail on objects,
simple plain background walls. 4:3 landscape.
```

**Avoid list** (as a negative prompt, or appended as "Do not include: …" if the tool has no negative prompt):

```
text, letters, numbers, words, logos, watermark, signature, people, faces on furniture,
photorealistic, 3D render, dramatic lighting, dark shadows, perspective distortion,
cropped objects, clutter, blurry, noisy texture
```

### Consistency Tips

- **Keep the style part of the prompt identical** for all rooms; change only the room name and the object list.
- When the first room is approved, **use it as a style reference image** for the next rooms (most tools support image or style references).
- If the tool supports seeds, note the seed of approved images in the room folder's notes (outside the repo).

---

## 4. Workflow

1. **List the room's ~25 objects** in the manifest (`content/rooms/<room>/manifest.json`) and lexicon.
2. **Generate** several images with the prompt template. Pick the one with the best overall layout and style, even if some objects are missing or wrong.
3. **Fix with inpainting:** select the area where an object is missing or wrong and prompt only for that object, in the same style ("a cute kawaii cartoon toaster, isometric view, pastel colours, dark navy outline"). Repeat until every manifest object is present.
4. **Check against the manifest:** every object present, recognisable, not hidden, not cropped, no text.
5. **Upscale** to 2048 × 1536 if the tool generates smaller images (most tools offer an upscaler; keep the 4:3 ratio exactly).
6. **Save** as `content/rooms/<room>/room.png`.
7. **Make the masks** with the mask tool ([masks.md](masks.md)).

---

## 5. Image Generator

The generator is not chosen yet (open decision D in [TECHNICAL.md §11](../../TECHNICAL.md#11-open-decisions)). Requirements:

- **Inpainting** (edit a selected area of an image).
- **Style or image references**, for consistency between rooms.
- **4:3 output** or an upscaler to 2048 × 1536.
- **Commercial-use terms** that allow using the images in the game: check the tool's licence before choosing.

Examples of tools with these features include ChatGPT image generation, Midjourney, Adobe Firefly, and Stable Diffusion or Flux run locally. Their terms and features change often; check them at the time of choosing.

---

## 6. Example: Kitchen (proposal for issue #30)

**Proposed 25 objects** (to confirm): refrigerator, stove, oven, sink, cupboard, drawer, table, chair, stool, window, clock, kettle, toaster, microwave, pot, pan, plate, bowl, cup, glass, spoon, fork, knife, bottle, apple.

The current placeholder kitchen covers 9 of them (refrigerator, stove, sink, cupboard, window, clock, table, chair, cup).

**Prompt:**

```
Cute kawaii cartoon illustration of a kitchen interior, isometric view, cutaway room
showing the floor and two walls from above, viewed from the front corner.
Rounded friendly shapes, soft pastel colour palette, clean dark navy outlines,
flat colours with soft cel shading, soft even daylight, cosy and cheerful.
The room clearly shows these objects, each one separate and easy to see:
a refrigerator, a stove with a pot and a pan on it, an oven under the stove, a sink with
a tap, wall cupboards, a counter with drawers, a kettle, a toaster, a microwave,
a window, a wall clock, a table with two chairs, a stool, and on the table a plate,
a bowl, a cup, a glass, a spoon, a fork, a knife, a bottle, and an apple.
Children's educational game art, clean and uncluttered, high detail on objects,
simple plain background walls. 4:3 landscape.
```

Small objects (spoon, fork, knife) are hard to click on a busy table: if needed, swap them for larger kitchen words (for example *bin*, *mug rack*, *fruit bowl*) when finalising the list.
