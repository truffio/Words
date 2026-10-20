import { regionCanvas } from './regions.js';

const PALETTE = [
  [230, 25, 75],
  [60, 180, 75],
  [0, 130, 200],
  [245, 130, 48],
  [145, 30, 180],
  [70, 240, 240],
  [240, 50, 230],
  [210, 245, 60],
  [0, 128, 128],
  [170, 110, 40],
];

/**
 * Debug view (`?debug=cutouts`, dev and test builds only): hides the painting and shows
 * only the object cut-outs, to check that each one sits exactly where it was painted.
 * @param {import('./scenes/RoomScene.js').RoomScene} scene
 */
export function showCutouts(scene) {
  scene.children.list
    .find((child) => child.texture?.key === `${scene.roomId}:background`)
    ?.setVisible(false);
  for (const instance of scene.layout.instances) scene.addCutout(instance);
}

/**
 * Debug overlay (`?debug=hits`, dev and test builds only): draws every hit region in
 * its own colour, labelled with the instance name at its tap point.
 * @param {import('./scenes/RoomScene.js').RoomScene} scene
 */
export function showHitRegions(scene) {
  const { layout, hitmap, roomId } = scene;
  for (const instance of layout.instances) {
    const rgb = PALETTE[(instance.index - 1) % PALETTE.length];
    const key = `${roomId}:debug:${instance.index}`;
    const region = regionCanvas(hitmap, instance, rgb, { fill: 120, edge: 255 });
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, region.canvas);
    scene.add.image(region.x, region.y, key).setOrigin(0, 0).setScale(region.scale).setDepth(10);
    scene.add
      .text(instance.tap[0], instance.tap[1], instance.name, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '34px',
        color: '#ffffff',
        backgroundColor: '#000000aa',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(11);
  }
}
