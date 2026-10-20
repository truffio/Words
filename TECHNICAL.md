# Words: Global Technical Considerations

*Implementation guidelines for the Words English vocabulary game. For the educational concept and gameplay, see [WORDS.md](WORDS.md).*

---

## 1. Purpose and Design Principles

### Design Priorities

- **Open a URL on an iPad and play.** No app installation or account.
- **No backend**, database, or persistent learning history in the initial version.
- **Consistent AI-generated artwork**, visually assembled and fine-tuned in an editor.
- **High-quality prerecorded audio**, with no speech synthesis required during play.
- **Scale target:** approximately **12 rooms** and **50 interactive objects per room**.
- **Keep game rules independent** of artwork and scene layout.

---

## 2. Technology Stack

| Area | Choice | Notes |
|------|--------|-------|
| **Runtime / game** | Phaser 3 (JavaScript) | Renders interactive 2D scenes in an HTML canvas. |
| **Web shell** | HTML and CSS | Loading screen, navigation, and simple UI elements as appropriate. |
| **Scene authoring** | Phaser Editor 2D | Visual drag-and-drop placement, scaling, and adjustment of sprites. Scene files are editor-specific JSON-based assets; generated scene code and file formats **must match the chosen editor version**. |
| **Artwork** | AI-generated backgrounds and object images | Exported as transparent PNG or WebP sprites as appropriate; curated for a consistent style and perspective. |
| **Audio** | High-quality text-to-speech, generated **offline** | Exported as compressed audio files (e.g. MP3). Browser playback uses Phaser's audio facilities. iPad audio may require an initial user tap. |
| **Configuration** | JSON | Room vocabulary, object IDs, prompt mappings, and exercise settings. |
| **Development tooling** | Node.js, npm, Vite (or similar lightweight build tool) | Dependencies and build/test scripts. |
| **Unit tests** | Vitest | Vocabulary selection, answer checking, and scoring rules. |
| **Browser tests** | Playwright | Gameplay interactions and visual screenshots. |
| **Continuous integration** | GitHub Actions | On push / pull request: validation, tests, and production build. |

> **Deployment is deliberately outside the initial scope.**

---

## 3. Runtime Architecture

The application is a **static website**: HTML, JavaScript, CSS, image files, audio files, and scene/configuration data. **All game execution happens in the child's browser.**

### Core Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **Application shell** | Start the game, select a room, show instructions, score, and timer. |
| **Scene manager** | Load and display the selected room; transition to another room. |
| **Asset manager** | Load the selected room's graphics and needed audio; release room-specific resources when appropriate. |
| **Interaction layer** | Map pointer/touch input to object IDs; show selection and feedback. |
| **Exercise controller** | Choose target vocabulary, present the prompt, evaluate the selected object, advance to the next challenge. |
| **Session state** | Hold score, attempts, current room, active question, and optional elapsed time, **in memory only**. |
| **Audio player** | Play cached prerecorded word or instruction clips on demand. |

### Illustrative Event Flow

1. The child chooses **Kitchen**.
2. The game loads the kitchen layout, sprite assets, vocabulary, and relevant audio.
3. The exercise controller selects an object ID (e.g. `refrigerator`).
4. The game displays and plays *"Find the refrigerator."*
5. The child taps a sprite; the interaction layer returns its object ID.
6. The controller compares IDs, updates the on-screen score, gives feedback, and starts the next prompt.

---

## 4. Scene and Content Model

Each room has:

- A **visual scene definition**: positions, sizes, layering, and object instances.
- A **background** and a set of **individual sprites**.
- A **vocabulary manifest** that maps stable object IDs to English labels and audio references.
- Optional **exercise metadata**, such as difficulty or eligible objects.

### Rules

- **Keep object IDs stable** across scene editing, vocabulary data, and tests.
- **Avoid hardcoding screen coordinates** in learning logic.
- **Keep scene layout files and the vocabulary manifest separate**, so art can change without rewriting rules.

---

## 5. Content Creation Workflow

1. **Define** the room's vocabulary list and unique object IDs.
2. **Generate** a consistent illustrated background and separate object assets using AI image generation.
3. **Review** assets for perspective, readability, overlap, and visual consistency; regenerate or retouch as needed.
4. **Import** the assets into Phaser Editor 2D; place, resize, and layer them by drag-and-drop.
5. *(Optional)* **Generate** an initial editor-compatible scene file programmatically, then refine it manually. **Validate against the exact editor schema** before relying on this workflow.
6. **Link** scene objects to vocabulary IDs and the matching prerecorded audio.
7. **Preview** the scene and run interaction tests; repeat until acceptable.

### Interaction and Layout Guidelines

- Use **appropriately sized interactive hit areas** for click/tap accuracy.
- **Decorative objects must not accidentally register as answers.**
- Large scenes can use a **fixed logical resolution scaled to the iPad viewport**.

---

## 6. Performance and Multi-Room Support

Twelve rooms with around fifty objects each is a reasonable target for a modern iPad browser, **provided assets are sized sensibly**.

The main constraints are:

- Decoded image memory
- Download size
- Texture dimensions
- Audio caching

The raw number of vocabulary entries is **not** a constraint.

### Recommended Strategy

- **Load one room at a time** rather than loading all rooms into memory.
- Use **appropriately compressed and sized images**, with transparent sprites where needed.
- **Preload the current room's essential assets**, optionally loading the next room opportunistically.
- **Reuse shared UI and common audio assets** across rooms.
- **Release unused room-specific textures/audio** when transitioning, while avoiding repeated downloads where caching helps.
- **Test on the target iPad**: actual load time, memory use, and touch responsiveness.

---

## 7. Testing and CI

### GitHub Actions Pipeline

On every commit pushed to GitHub, GitHub Actions can:

1. **Install** dependencies.
2. **Validate room manifests**:
   - required fields
   - unique IDs
   - referenced asset paths
   - mapping between scene objects and vocabulary
3. **Run Vitest unit tests** for scoring, question selection, and answer validation.
4. **Build** the static game.
5. **Launch a local preview server** and run **Playwright end-to-end tests**.
6. **Save screenshots / test reports** on failure.

### Example End-to-End Case

> Load **Kitchen** → receive a **refrigerator** prompt → tap the refrigerator → verify that the **correct-answer counter increments**.

### Testing Canvas Interactions

Canvas interactions can be tested through:

- known coordinates, or
- a small **test-only bridge** that exposes object IDs.

**Avoid brittle pixel coordinates** where possible.
