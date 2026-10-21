import { Scene, WEBGL } from 'phaser';
import { decodeHitmap, instanceAt } from '../../core/hitmap.js';
import { regionCanvas } from '../regions.js';

const COLORS = {
  correct: [46, 160, 67],
  tryAgain: [240, 140, 40],
  reveal: [255, 196, 0],
  target: [60, 150, 255],
};

const GLOW_COLORS = {
  correct: 0x3ccf5a,
  tryAgain: 0xffa03c,
  reveal: 0xffd000,
  target: 0x3c96ff,
};

/** Objects smaller than this ring (logical px) get the reveal ring around them. */
const MAX_RING_RADIUS = 160;

/**
 * Displays any room from its generated files and turns clicks/taps into object
 * instances. Feedback is driven by the session's events; the scene holds no rules.
 *
 * In Listen and find, a tap is the answer and feedback shows on the tapped object. In
 * Look and identify and Recall and spell, the target object glows (blue) while the
 * child answers in the shell, taps are ignored, and feedback shows on the target.
 *
 * Emits on game.events: `roomReady` { roomId, layout, hitmap, scene }.
 */
export class RoomScene extends Scene {
  constructor() {
    super('Room');
  }

  /** @param {{ roomId: string }} data */
  create({ roomId }) {
    this.roomId = roomId;
    this.layout = this.cache.json.get(`${roomId}:layout`);
    const { width, height } = this.layout.hitmap;
    this.hitmap = {
      pixels: decodeHitmap(this.cache.binary.get(`${roomId}:hitmap`), width * height),
      width,
      height,
    };

    this.add.image(0, 0, `${roomId}:background`).setOrigin(0, 0);
    this.feedbackLayer = this.add.container(0, 0);
    this.session = null;
    this.unsubscribe = [];
    /** @type {string | null} the object glowing as the target, if any */
    this.highlighted = null;

    // Pointer events cover mouse, pen, and touch with one code path.
    this.input.on('pointerdown', (pointer) => this.handlePointer(pointer.worldX, pointer.worldY));
    this.events.once('shutdown', () => this.detachSession());

    this.game.events.emit('roomReady', {
      roomId,
      layout: this.layout,
      hitmap: this.hitmap,
      scene: this,
    });
  }

  /**
   * Connects a play session: clicks are forwarded to it and its events drive feedback.
   * @param {ReturnType<typeof import('../../core/session.js').createSession>} session
   */
  attachSession(session) {
    this.detachSession();
    this.session = session;
    this.unsubscribe = [
      session.on('challengeStarted', ({ challenge }) => {
        this.clearFeedback();
        if (!this.answersByTap) this.highlightTarget(challenge.objectId);
      }),
      session.on('answerEvaluated', ({ result }) => this.showFeedback(result)),
      session.on('roundEnded', () => this.clearFeedback()),
    ];
  }

  detachSession() {
    this.unsubscribe.forEach((off) => off());
    this.unsubscribe = [];
    this.session = null;
    this.clearFeedback();
  }

  /** Whether the child answers by tapping an object (Listen and find). */
  get answersByTap() {
    return this.session?.activity === 'listenAndFind';
  }

  /** @param {number} x logical x  @param {number} y logical y */
  handlePointer(x, y) {
    const index = instanceAt(this.hitmap, x, y);
    // Walls, floor, and decorative details are not answers.
    if (!index || !this.answersByTap || !this.session?.awaitingAnswer) return;
    this.lastTapped = this.layout.instances[index - 1];
    this.session.answer(this.lastTapped.objectId);
  }

  /** @param {import('../../core/exercise.js').AnswerResult} result */
  showFeedback(result) {
    const kind = result.outcome;
    if (!this.answersByTap) {
      // The target keeps glowing after a wrong answer; the shell says "try again".
      if (kind === 'tryAgain') return;
      this.clearFeedback();
      this.highlight(this.instancesOf(result.objectId), kind);
      return;
    }
    this.clearFeedback();
    const instances = kind === 'reveal' ? this.instancesOf(result.objectId) : [this.lastTapped];
    this.highlight(instances, kind);
  }

  /**
   * Makes every instance of the object glow, to ask the child what it is.
   * @param {string} objectId
   */
  highlightTarget(objectId) {
    this.highlight(this.instancesOf(objectId), 'target');
    this.highlighted = objectId;
  }

  /** @param {string} objectId */
  instancesOf(objectId) {
    return this.layout.instances.filter((i) => i.objectId === objectId);
  }

  /**
   * @param {object[]} instances
   * @param {'correct' | 'tryAgain' | 'reveal' | 'target'} kind
   */
  highlight(instances, kind) {
    const options = { pulse: kind !== 'tryAgain', fadeOut: kind === 'tryAgain' };
    for (const instance of instances) {
      // Tinting needs WebGL; the Canvas renderer falls back to a region overlay.
      if (this.renderer.type === WEBGL && instance.glow) this.glow(instance, kind, options);
      else this.regionHighlight(instance, COLORS[kind], options);
      if (kind === 'reveal' || kind === 'target') this.marker(instance, GLOW_COLORS[kind]);
    }
  }

  /**
   * Glow feedback: the instance's halo (built by build:rooms, tinted here) behind its
   * cut-out, which is drawn exactly over the painted object. Both may grow slightly
   * (pulse) but never move or shrink, so the painted object underneath stays hidden.
   * @param {object} instance
   * @param {'correct' | 'tryAgain' | 'reveal' | 'target'} kind
   * @param {{ pulse: boolean, fadeOut: boolean }} options
   */
  glow(instance, kind, { pulse, fadeOut }) {
    const halo = this.addFrame(instance.glow).setTint(GLOW_COLORS[kind]).setAlpha(0);
    const sprite = this.addCutout(instance);
    this.feedbackLayer.add([halo, sprite]);

    if (fadeOut) {
      this.tweens.chain({
        targets: halo,
        tweens: [
          { alpha: 0.9, duration: 150 },
          {
            alpha: 0,
            duration: 650,
            delay: 300,
            onComplete: () => {
              halo.destroy();
              sprite.destroy();
            },
          },
        ],
      });
      return;
    }

    this.tweens.add({ targets: halo, alpha: 1, duration: 200 });
    if (pulse) {
      this.tweens.add({
        targets: halo,
        alpha: 0.5,
        duration: 450,
        delay: 250,
        yoyo: true,
        repeat: -1,
      });
      // Grow by about 24 logical px at most, whatever the object's size.
      const grow = 1 + Math.min(0.06, 24 / Math.max(sprite.width, sprite.height));
      this.tweens.add({
        targets: [halo, sprite],
        scale: grow,
        duration: 450,
        delay: 250,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
    }
  }

  /** Fallback highlight: the instance's hit region as a tinted overlay. */
  regionHighlight(instance, rgb, { pulse = false, fadeOut = false }) {
    const key = `${this.roomId}:region:${instance.index}:${rgb.join(',')}`;
    let region;
    if (this.textures.exists(key)) {
      region = this.textures.get(key).customData;
    } else {
      region = regionCanvas(this.hitmap, instance, rgb);
      this.textures.addCanvas(key, region.canvas).customData = region;
    }
    const image = this.add
      .image(region.x, region.y, key)
      .setOrigin(0, 0)
      .setScale(region.scale)
      .setAlpha(0);
    this.feedbackLayer.add(image);

    if (fadeOut) {
      this.tweens.chain({
        targets: image,
        tweens: [
          { alpha: 1, duration: 150 },
          { alpha: 0, duration: 650, delay: 300, onComplete: () => image.destroy() },
        ],
      });
    } else {
      this.tweens.add({ targets: image, alpha: 1, duration: 200 });
      if (pulse) {
        this.tweens.add({
          targets: image,
          alpha: 0.55,
          duration: 450,
          delay: 250,
          yoyo: true,
          repeat: -1,
        });
      }
    }
  }

  /**
   * Adds an atlas frame at its layout position. The origin is the frame's centre, so
   * scaling grows it evenly around the object.
   * @param {{ frame: string, x: number, y: number }} placement
   */
  addFrame({ frame, x, y }) {
    const image = this.add.image(0, 0, `${this.roomId}:objects`, frame);
    return image.setPosition(x + image.width / 2, y + image.height / 2);
  }

  /**
   * Adds an instance's cut-out sprite exactly over its painted pixels.
   * @param {{ cutout: { frame: string, x: number, y: number } }} instance
   */
  addCutout(instance) {
    return this.addFrame(instance.cutout);
  }

  /**
   * A ring to draw the eye to a target or a reveal: around a small object, so it does
   * not hide it; at the tap point of a large one.
   * @param {object} instance
   * @param {number} color
   */
  marker(instance, color) {
    const { x: bx, y: by, w, h } = instance.bounds;
    const around = Math.max(w, h) / 2 + 28;
    const [x, y] = around <= MAX_RING_RADIUS ? [bx + w / 2, by + h / 2] : instance.tap;
    const radius = around <= MAX_RING_RADIUS ? Math.max(around, 60) : 60;
    const ring = this.add.circle(x, y, radius).setStrokeStyle(14, color);
    this.feedbackLayer.add(ring);
    this.tweens.add({ targets: ring, scale: 1.35, duration: 500, yoyo: true, repeat: -1 });
  }

  clearFeedback() {
    this.highlighted = null;
    if (!this.feedbackLayer) return;
    this.tweens.killTweensOf(this.feedbackLayer.list);
    this.feedbackLayer.removeAll(true);
  }
}
