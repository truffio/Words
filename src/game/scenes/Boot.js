import { Scene } from 'phaser';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../../core/display.js';

/**
 * Placeholder scene for M0: shows the logical canvas so scaling can be checked.
 * Replaced by the Boot / Preload / RoomScene flow in M1.
 */
export class Boot extends Scene {
  constructor() {
    super('Boot');
  }

  create() {
    // Frame along the canvas edges, to make the scaled area visible.
    this.add
      .rectangle(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2, LOGICAL_WIDTH - 16, LOGICAL_HEIGHT - 16)
      .setStrokeStyle(16, 0x1f2a44);

    this.add
      .text(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2, 'Words', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '220px',
        color: '#1f2a44',
      })
      .setOrigin(0.5);
  }
}
