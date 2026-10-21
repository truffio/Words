import { Scene } from 'phaser';

/**
 * First scene. Shared assets used by every room (UI, feedback sounds) are preloaded
 * here once, and stay loaded while rooms come and go; there are none yet (feedback
 * sounds arrive with M3). Then waits for the app to request a room.
 */
export class Boot extends Scene {
  constructor() {
    super('Boot');
  }

  create() {
    this.registry.set('booted', true);
    this.game.events.emit('booted');
  }
}
