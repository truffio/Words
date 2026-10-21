import { AUTO, Game, Scale } from 'phaser';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../core/display.js';
import { Boot } from './scenes/Boot.js';
import { Preload } from './scenes/Preload.js';
import { RoomScene } from './scenes/RoomScene.js';

/**
 * Creates the Phaser game inside the given DOM element.
 * @param {string} parent id of the container element
 * @returns {Game}
 */
export function startGame(parent) {
  return new Game({
    type: AUTO,
    parent,
    width: LOGICAL_WIDTH,
    height: LOGICAL_HEIGHT,
    backgroundColor: '#f6efe3',
    scale: {
      mode: Scale.FIT,
      autoCenter: Scale.CENTER_BOTH,
    },
    scene: [Boot, Preload, RoomScene],
  });
}

/**
 * Loads a room and resolves when it is displayed. The room shown before, if any, is
 * stopped first, which releases its assets (see RoomScene).
 * @param {Game} game
 * @param {string} roomId
 * @param {(progress: number) => void} [onProgress] loading progress, 0 to 1
 * @returns {Promise<{ roomId: string, layout: object, hitmap: object, scene: RoomScene }>}
 */
export function loadRoom(game, roomId, onProgress = () => {}) {
  return new Promise((resolve) => {
    game.events.on('roomLoadProgress', onProgress);
    game.events.once('roomReady', (room) => {
      game.events.off('roomLoadProgress', onProgress);
      resolve(room);
    });
    const start = () => {
      if (game.scene.isActive('Room')) game.scene.stop('Room');
      game.scene.start('Preload', { roomId });
    };
    if (game.registry.get('booted')) start();
    else game.events.once('booted', start);
  });
}
