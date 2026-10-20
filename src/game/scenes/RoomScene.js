import { Scene } from 'phaser';
import { decodeHitmap, instanceAt } from '../../core/hitmap.js';
import { regionCanvas } from '../regions.js';

const COLORS = {
  correct: [46, 160, 67],
  tryAgain: [240, 140, 40],
  reveal: [255, 196, 0],
};

/**
 * Displays any room from its generated files and turns clicks/taps into object
 * instances. Feedback is driven by the session's events; the scene holds no rules.
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
      session.on('challengeStarted', () => this.clearFeedback()),
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

  /** @param {number} x logical x  @param {number} y logical y */
  handlePointer(x, y) {
    const index = instanceAt(this.hitmap, x, y);
    // Walls, floor, and decorative details are not answers.
    if (!index || !this.session?.awaitingAnswer) return;
    this.lastTapped = this.layout.instances[index - 1];
    this.session.answer(this.lastTapped.objectId);
  }

  /** @param {import('../../core/exercise.js').AnswerResult} result */
  showFeedback(result) {
    if (result.outcome === 'correct') {
      this.highlight(this.lastTapped, COLORS.correct, { pulse: true });
    } else if (result.outcome === 'tryAgain') {
      this.highlight(this.lastTapped, COLORS.tryAgain, { fadeOut: true });
    } else {
      this.clearFeedback();
      for (const instance of this.layout.instances) {
        if (instance.objectId === result.objectId) {
          this.highlight(instance, COLORS.reveal, { pulse: true });
          this.marker(instance);
        }
      }
    }
  }

  highlight(instance, rgb, { pulse = false, fadeOut = false } = {}) {
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
   * Adds an instance's cut-out sprite exactly over its painted pixels.
   * @param {{ cutout: { frame: string, x: number, y: number } }} instance
   */
  addCutout(instance) {
    const { frame, x, y } = instance.cutout;
    return this.add.image(x, y, `${this.roomId}:objects`, frame).setOrigin(0, 0);
  }

  /** A ring around the instance's tap point, to draw the eye during a reveal. */
  marker(instance) {
    const [x, y] = instance.tap;
    const ring = this.add.circle(x, y, 60).setStrokeStyle(14, 0xffc400);
    this.feedbackLayer.add(ring);
    this.tweens.add({ targets: ring, scale: 1.35, duration: 500, yoyo: true, repeat: -1 });
  }

  clearFeedback() {
    if (!this.feedbackLayer) return;
    this.tweens.killTweensOf(this.feedbackLayer.list);
    this.feedbackLayer.removeAll(true);
  }
}
