import { describe, expect, it } from 'vitest';
import { formatElapsed } from '../../src/shell/shell.js';

describe('formatElapsed', () => {
  it('formats milliseconds as m:ss', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(9999)).toBe('0:09');
    expect(formatElapsed(61000)).toBe('1:01');
    expect(formatElapsed(600000)).toBe('10:00');
  });
});
