import { Scene } from 'phaser';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../../core/display.js';

/** Loads one room's generated files (see tools/build-rooms.js), then starts it. */
export class Preload extends Scene {
  constructor() {
    super('Preload');
  }

  /** @param {{ roomId: string }} data */
  init({ roomId }) {
    this.roomId = roomId;

    const barWidth = 900;
    const x = (LOGICAL_WIDTH - barWidth) / 2;
    const y = LOGICAL_HEIGHT / 2;
    this.add.rectangle(LOGICAL_WIDTH / 2, y, barWidth, 48).setStrokeStyle(6, 0x1f2a44);
    const bar = this.add.rectangle(x + 6, y, 1, 36, 0x1f2a44).setOrigin(0, 0.5);
    this.load.on('progress', (progress) => {
      bar.width = Math.max(1, (barWidth - 12) * progress);
    });
  }

  preload() {
    const id = this.roomId;
    this.load.setPath(`assets/rooms/${id}`);
    this.load.image(`${id}:background`, 'background.webp');
    this.load.multiatlas(`${id}:objects`, 'objects.json');
    this.load.json(`${id}:layout`, 'layout.json');
    this.load.binary(`${id}:hitmap`, 'hitmap.bin', Uint8Array);
  }

  create() {
    this.scene.start('Room', { roomId: this.roomId });
  }
}
