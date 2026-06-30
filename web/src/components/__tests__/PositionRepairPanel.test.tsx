import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PositionRepairPanel } from '../PositionRepairPanel';

describe('PositionRepairPanel', () => {
  it('renders the default repair ladder for the worked example', () => {
    render(<PositionRepairPanel />);
    // Default 2 units @ 300, market 50 → targets 250/200/150/100.
    const table = screen.getByRole('table');
    expect(within(table).getByText('250.00')).toBeInTheDocument();
    expect(within(table).getByText('100.00')).toBeInTheDocument();
    // At target 100: buy 8 units, cost 400.00, value 1,000.00.
    const row = within(table).getByText('100.00').closest('tr')!;
    expect(within(row).getByText('8')).toBeInTheDocument();
    expect(within(row).getByText('400.00')).toBeInTheDocument();
    expect(within(row).getByText(/1,000\.00/)).toBeInTheDocument();
  });

  it('recomputes when the inputs change', () => {
    render(<PositionRepairPanel />);
    fireEvent.change(screen.getByLabelText('Entry price (avg paid)'), {
      target: { value: '100' },
    });
    fireEvent.change(screen.getByLabelText('Current quantity'), {
      target: { value: '10' },
    });
    fireEvent.change(screen.getByLabelText('Current market price'), {
      target: { value: '20' },
    });
    // New ladder targets sit strictly between 20 and 100.
    const table = screen.getByRole('table');
    expect(within(table).getByText('80.00')).toBeInTheDocument();
    expect(within(table).queryByText('250.00')).not.toBeInTheDocument();
  });

  it('shows a guidance message when the market price is not below entry', () => {
    render(<PositionRepairPanel />);
    fireEvent.change(screen.getByLabelText('Current market price'), {
      target: { value: '350' },
    });
    expect(
      screen.getByText(/must be below the entry price/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/repair ladder/i),
    ).toBeInTheDocument(); // empty-state hint
  });

  it('uses user-supplied target averages in Custom mode', () => {
    render(<PositionRepairPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    const field = screen.getByLabelText('Your target averages');
    fireEvent.change(field, { target: { value: '120, 80' } });

    const table = screen.getByRole('table');
    // Custom targets replace the auto ladder.
    expect(within(table).getByText('120.00')).toBeInTheDocument();
    expect(within(table).getByText('80.00')).toBeInTheDocument();
    expect(within(table).queryByText('250.00')).not.toBeInTheDocument();
  });

  it('flags custom targets that are outside the reachable range', () => {
    render(<PositionRepairPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    const field = screen.getByLabelText('Your target averages');
    // 350 is above entry (300) and 10 is below market (50) → both skipped.
    fireEvent.change(field, { target: { value: '350, 150, 10' } });

    const table = screen.getByRole('table');
    expect(within(table).getAllByText('150.00').length).toBeGreaterThan(0);
    expect(screen.getByText(/skipped/i)).toBeInTheDocument();
  });
});
