/**
 * Vitest global setup.
 *
 * - Registers jest-dom matchers (`toBeInTheDocument`, `toBeDisabled`, …).
 * - Cleans up the DOM and resets the persisted data-mode between tests.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
});
