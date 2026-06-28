import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CandleTable } from '../CandleTable';
import type { Candle } from '../../types';

// 2021-01-01 and 2021-01-02 (UNIX seconds, UTC midnight).
const candles: Candle[] = [
  { time: 1609459200, open: 100, high: 115, low: 95, close: 110, volume: 1000 },
  { time: 1609545600, open: 110, high: 120, low: 105, close: 108, volume: 2000 },
];

describe('CandleTable', () => {
  it('renders a header and one row per candle, most-recent first', () => {
    render(<CandleTable candles={candles} />);
    const table = screen.getByTestId('candle-table');
    expect(within(table).getByText('Open')).toBeInTheDocument();
    const bodyRows = table.querySelectorAll('tbody tr');
    expect(bodyRows.length).toBe(2);
    // Newest date is first.
    expect(within(bodyRows[0] as HTMLElement).getByText('2021-01-02')).toBeInTheDocument();
    expect(within(bodyRows[1] as HTMLElement).getByText('2021-01-01')).toBeInTheDocument();
  });

  it('shows a signed change and percentage for each bar', () => {
    render(<CandleTable candles={candles} />);
    // Second bar fell from prev close 110 to 108 → -2.00 / -1.82%.
    expect(screen.getByText('-2.00')).toBeInTheDocument();
    expect(screen.getByText('-1.82%')).toBeInTheDocument();
  });

  it('renders an empty-state message when there are no candles', () => {
    render(<CandleTable candles={[]} />);
    expect(screen.getByText('No data.')).toBeInTheDocument();
    expect(screen.queryByTestId('candle-table')).not.toBeInTheDocument();
  });
});
