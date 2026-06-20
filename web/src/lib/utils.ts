import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind-aware className combiner. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Formats a number as a signed percentage string. */
export function fmtPct(v: number, digits = 2): string {
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(digits)}%`;
}

/** Formats a number with thousands separators. */
export function fmtNum(v: number, digits = 2): string {
  return v.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Formats a UNIX-seconds timestamp as an ISO date. */
export function fmtDate(time: number): string {
  return new Date(time * 1000).toISOString().slice(0, 10);
}
