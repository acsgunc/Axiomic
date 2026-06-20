import { describe, it, expect } from 'vitest';
import { cn, fmtPct, fmtNum, fmtDate } from '../utils';

describe('cn', () => {
  it('joins truthy class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b');
  });

  it('merges conflicting tailwind classes (last wins)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });
});

describe('fmtPct', () => {
  it('prefixes positive values with +', () => {
    expect(fmtPct(12.345)).toBe('+12.35%');
  });

  it('keeps the native minus sign for negatives', () => {
    expect(fmtPct(-3.2)).toBe('-3.20%');
  });

  it('does not prefix zero', () => {
    expect(fmtPct(0)).toBe('0.00%');
  });

  it('honors a custom digit count', () => {
    expect(fmtPct(5, 0)).toBe('+5%');
  });
});

describe('fmtNum', () => {
  it('formats with the requested fraction digits', () => {
    expect(fmtNum(1234.5)).toBe('1,234.50');
  });

  it('supports zero digits', () => {
    expect(fmtNum(1000, 0)).toBe('1,000');
  });
});

describe('fmtDate', () => {
  it('formats unix seconds as an ISO date', () => {
    // 2024-01-01T00:00:00Z
    expect(fmtDate(1704067200)).toBe('2024-01-01');
  });
});
