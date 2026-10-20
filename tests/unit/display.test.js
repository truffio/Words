import { describe, expect, it } from 'vitest';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../../src/core/display.js';

describe('logical resolution', () => {
  it('is 2048 × 1536 (4:3)', () => {
    expect(LOGICAL_WIDTH).toBe(2048);
    expect(LOGICAL_HEIGHT).toBe(1536);
    expect(LOGICAL_WIDTH / LOGICAL_HEIGHT).toBeCloseTo(4 / 3);
  });
});
