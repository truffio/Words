import { AUTO, Game, Scale } from 'phaser';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../core/display.js';
import { Boot } from './scenes/Boot.js';

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
    scene: [Boot],
  });
}
