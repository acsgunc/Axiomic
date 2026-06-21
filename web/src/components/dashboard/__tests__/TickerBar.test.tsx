import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { TickerBar } from '../TickerBar';

afterEach(() => {
  vi.useRealTimers();
});

describe('TickerBar', () => {
  it('renders the symbol, source badge and formatted price', () => {
    render(
      <TickerBar
        symbol="BTC"
        sourceLabel="crypto"
        price={42000.5}
        change={10}
        changePct={1.23}
        direction="up"
        flashId={0}
        status="live"
      />,
    );
    expect(screen.getByText('BTC')).toBeInTheDocument();
    expect(screen.getByText('crypto')).toBeInTheDocument();
    expect(screen.getByText('+1.23%')).toBeInTheDocument();
  });

  it('flashes green on an up-tick then fades back', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <TickerBar
        symbol="BTC"
        sourceLabel="crypto"
        price={100}
        change={1}
        changePct={1}
        direction="flat"
        flashId={0}
        status="live"
      />,
    );

    // An up-tick (flashId increments, direction up) paints the green flash.
    act(() => {
      rerender(
        <TickerBar
          symbol="BTC"
          sourceLabel="crypto"
          price={101}
          change={1}
          changePct={1}
          direction="up"
          flashId={1}
          status="live"
        />,
      );
    });
    expect(container.querySelector('.bg-accent-up\\/30')).not.toBeNull();

    // After the flash window it fades back to the neutral background.
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(container.querySelector('.bg-accent-up\\/30')).toBeNull();
  });

  it('shows a loading state with no price', () => {
    render(
      <TickerBar
        symbol="ETH"
        sourceLabel="crypto"
        price={null}
        change={0}
        changePct={0}
        direction="flat"
        flashId={0}
        status="loading"
      />,
    );
    expect(screen.getByText('loading…')).toBeInTheDocument();
  });
});
