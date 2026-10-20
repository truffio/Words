import { Scene } from 'phaser';

/**
 * First scene. Nothing to load yet: shared assets (UI, sounds) arrive in later
 * milestones. Waits for the app to request a room.
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
