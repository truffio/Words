/**
 * Turns any image into a room painting: PNG, exactly the logical canvas size. Images
 * that are not 4:3 are centre-cropped to 4:3 first, so nothing is stretched.
 */
import sharp from 'sharp';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../../src/core/display.js';

/**
 * @param {Buffer} input any image format sharp can read (PNG, JPEG, WebP, …)
 * @returns {Promise<{ png: Buffer, original: { width: number, height: number }, cropped: boolean }>}
 */
export async function normalisePainting(input) {
  const meta = await sharp(input).metadata();
  const { width, height } = meta;
  if (!width || !height) throw new Error('Not a readable image.');

  // Less than 1% off 4:3 counts as 4:3 (rounding in exported sizes).
  const ratio = width / height / (LOGICAL_WIDTH / LOGICAL_HEIGHT);
  const cropped = Math.abs(ratio - 1) > 0.01;

  const png = await sharp(input)
    .rotate() // apply EXIF orientation (photos)
    .resize(LOGICAL_WIDTH, LOGICAL_HEIGHT, { fit: cropped ? 'cover' : 'fill', position: 'centre' })
    .removeAlpha()
    .png()
    .toBuffer();
  return { png, original: { width, height }, cropped };
}
