import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChartReplayBar, ReplaySelectOverlay } from '../ChartReplayBar';
import type { ChartReplay } from '../../lib/useChartReplay';

function makeReplay(overrides: Partial<ChartReplay> = {}): ChartReplay {
  return {
    active: true,
    selecting: false,
    playing: false,
    speed: 1,
    index: 50,
    total: 100,
    atEnd: false,
    start: vi.fn(),
    pick: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    togglePlay: vi.fn(),
    stepForward: vi.fn(),
    stepBack: vi.fn(),
    setSpeed: vi.fn(),
    exit: vi.fn(),
    ...overrides,
  };
}

describe('ChartReplayBar', () => {
  it('renders nothing when replay is inactive', () => {
    const { container } = render(<ChartReplayBar replay={makeReplay({ active: false })} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the transport and progress when active', () => {
    render(<ChartReplayBar replay={makeReplay()} />);
    expect(screen.getByRole('toolbar', { name: 'Replay controls' })).toBeInTheDocument();
    expect(screen.getByText('50/100')).toBeInTheDocument();
  });

  it('toggles play/pause and steps via the transport buttons', () => {
    const replay = makeReplay();
    render(<ChartReplayBar replay={replay} />);
    fireEvent.click(screen.getByTitle('Play replay'));
    expect(replay.togglePlay).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Step forward one bar'));
    expect(replay.stepForward).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Step back one bar'));
    expect(replay.stepBack).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Exit replay'));
    expect(replay.exit).toHaveBeenCalled();
  });

  it('changes the playback speed', () => {
    const replay = makeReplay();
    render(<ChartReplayBar replay={replay} />);
    fireEvent.change(screen.getByLabelText('Replay speed'), { target: { value: '5' } });
    expect(replay.setSpeed).toHaveBeenCalledWith(5);
  });

  it('disables forward/play controls at the end', () => {
    render(<ChartReplayBar replay={makeReplay({ atEnd: true, index: 100 })} />);
    expect(screen.getByTitle('Play replay')).toBeDisabled();
    expect(screen.getByTitle('Step forward one bar')).toBeDisabled();
  });
});

describe('ReplaySelectOverlay', () => {
  it('maps a click to a logical bar index via the chart time scale', () => {
    const onPick = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chart = {
      timeScale: () => ({ coordinateToLogical: (x: number) => x / 10 }),
    } as any;
    render(<ReplaySelectOverlay chart={chart} onPick={onPick} />);
    fireEvent.click(screen.getByTestId('replay-select'), { clientX: 120, clientY: 40 });
    expect(onPick).toHaveBeenCalled();
    // jsdom getBoundingClientRect is 0, so logical = clientX/10 = 12.
    expect(onPick.mock.calls[0][0]).toBeCloseTo(12);
  });

  it('renders above the chart canvases (z-index > 2)', () => {
    render(<ReplaySelectOverlay chart={null} onPick={vi.fn()} />);
    const z = Number(screen.getByTestId('replay-select').style.zIndex);
    expect(z).toBeGreaterThan(2);
  });
});
