import { describe, expect, it } from 'vitest';
import { resolveTheme, seasonOf } from './theme';

describe('seasonOf', () => {
  it('follows the northern-hemisphere seasons', () => {
    expect(seasonOf(new Date(2026, 0, 15))).toBe('winter'); // January
    expect(seasonOf(new Date(2026, 3, 15))).toBe('spring'); // April
    expect(seasonOf(new Date(2026, 6, 15))).toBe('summer'); // July
    expect(seasonOf(new Date(2026, 9, 12))).toBe('autumn'); // October
    expect(seasonOf(new Date(2026, 11, 24))).toBe('winter'); // December
  });
});

describe('resolveTheme', () => {
  it('turns "auto" into the current season', () => {
    expect(resolveTheme('auto', new Date(2026, 9, 12))).toBe('autumn');
    expect(resolveTheme('auto', new Date(2026, 1, 1))).toBe('winter');
  });

  it('keeps a chosen theme', () => {
    expect(resolveTheme('summer')).toBe('summer');
    expect(resolveTheme('classic')).toBe('classic');
  });

  it('falls back to autumn for anything unknown', () => {
    expect(resolveTheme('neon')).toBe('autumn');
    expect(resolveTheme(undefined)).toBe('autumn');
  });
});
