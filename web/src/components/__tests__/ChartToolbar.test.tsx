import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChartToolbar } from '../ChartToolbar';

function makeProps(overrides = {}) {
  return {
    chartType: 'candles' as const,
    onChartType: vi.fn(),
    scaleMode: 'normal' as const,
    onScaleMode: vi.fn(),
    showVolume: true,
    onToggleVolume: vi.fn(),
    crosshair: true,
    onToggleCrosshair: vi.fn(),
    drawTool: 'none' as const,
    onDrawTool: vi.fn(),
    hasDrawings: false,
    onClearDrawings: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onFit: vi.fn(),
    onScreenshot: vi.fn(),
    replayActive: false,
    onReplay: vi.fn(),
    viewMode: 'chart' as const,
    onViewMode: vi.fn(),
    fullscreen: false,
    onToggleFullscreen: vi.fn(),
    ...overrides,
  };
}

describe('ChartToolbar view controls', () => {
  it('switches view mode when a segmented button is clicked', () => {
    const onViewMode = vi.fn();
    render(<ChartToolbar {...makeProps({ onViewMode })} />);
    fireEvent.click(screen.getByTitle('Data table only'));
    expect(onViewMode).toHaveBeenCalledWith('table');
    fireEvent.click(screen.getByTitle('Chart and table side by side'));
    expect(onViewMode).toHaveBeenCalledWith('split');
  });

  it('toggles full screen and reflects the active label', () => {
    const onToggleFullscreen = vi.fn();
    const { rerender } = render(
      <ChartToolbar {...makeProps({ onToggleFullscreen })} />,
    );
    const enter = screen.getByTitle('Full screen');
    expect(enter).toHaveTextContent('Full');
    fireEvent.click(enter);
    expect(onToggleFullscreen).toHaveBeenCalled();

    rerender(<ChartToolbar {...makeProps({ fullscreen: true, onToggleFullscreen })} />);
    expect(screen.getByTitle('Exit full screen (Esc)')).toHaveTextContent('Exit');
  });
});
