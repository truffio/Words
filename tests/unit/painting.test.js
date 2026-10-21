import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { normalisePainting } from '../../tools/mask-tool/painting.js';

/** A solid-colour test image with a red stripe on its left edge. */
async function image(width, height, format = 'png') {
  const stripe = Math.round(width / 10);
  return sharp({ create: { width, height, channels: 3, background: '#3366cc' } })
    .composite([
      {
        input: await sharp({
          create: { width: stripe, height, channels: 3, background: '#ff0000' },
        })
          .png()
          .toBuffer(),
        left: 0,
        top: 0,
      },
    ])
    [format]()
    .toBuffer();
}

describe('normalisePainting', () => {
  it('resizes a 4:3 image to 2048 × 1536 PNG without cropping', async () => {
    const { png, original, cropped } = await normalisePainting(await image(1024, 768, 'jpeg'));
    const meta = await sharp(png).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['png', 2048, 1536]);
    expect(original).toEqual({ width: 1024, height: 768 });
    expect(cropped).toBe(false);
  });

  it('accepts sizes within 1% of 4:3 without cropping', async () => {
    const { cropped } = await normalisePainting(await image(1456, 1088));
    expect(cropped).toBe(false);
  });

  it('centre-crops a wider image to 4:3 instead of stretching it', async () => {
    const { png, cropped } = await normalisePainting(await image(1920, 1080));
    expect(cropped).toBe(true);
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([2048, 1536]);
    // The red stripe on the left edge (10% of a 16:9 image) is cut off by the crop.
    expect(data[0]).toBeLessThan(100);
  });

  it('rejects data that is not an image', async () => {
    await expect(normalisePainting(Buffer.from('not an image'))).rejects.toThrow();
  });
});
