/**
 * Responsive CSS grid that arranges the live panes into the cleanest layout for
 * the active chart count, collapsing columns on narrow viewports so panes never
 * become unusably small.
 */

import { useEffect, useState } from 'react';
import { gridShape, responsiveColumns } from '../../lib/gridLayout';
import type { PaneConfig } from '../../store/useDashboardStore';
import { LivePane } from './LivePane';

/** Tracks the viewport width to drive responsive column collapsing. */
function useViewportWidth(): number {
  const [width, setWidth] = useState(() =>
    typeof window === 'undefined' ? 1280 : window.innerWidth,
  );
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

export function ChartGrid({ panes }: { panes: PaneConfig[] }) {
  const width = useViewportWidth();
  const { cols: idealCols } = gridShape(panes.length);
  const cols = responsiveColumns(idealCols, width);
  const rows = Math.max(1, Math.ceil(panes.length / cols));

  return (
    <div
      className="grid min-h-0 flex-1 gap-2 overflow-auto p-2"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(220px, 1fr))`,
      }}
    >
      {panes.map((pane) => (
        <LivePane key={pane.id} pane={pane} />
      ))}
    </div>
  );
}
