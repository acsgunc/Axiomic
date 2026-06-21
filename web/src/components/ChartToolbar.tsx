import { Button } from './ui';
import { cn } from '../lib/utils';
import {
  CHART_TYPE_LABELS,
  type ChartType,
  type DrawTool,
  type ScaleMode,
} from '../lib/chart';

interface Props {
  chartType: ChartType;
  onChartType: (t: ChartType) => void;
  scaleMode: ScaleMode;
  onScaleMode: (m: ScaleMode) => void;
  showVolume: boolean;
  onToggleVolume: () => void;
  crosshair: boolean;
  onToggleCrosshair: () => void;
  drawTool: DrawTool;
  onDrawTool: (t: DrawTool) => void;
  hasDrawings: boolean;
  onClearDrawings: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onScreenshot: () => void;
}

const SCALE_MODES: { id: ScaleMode; label: string; title: string }[] = [
  { id: 'normal', label: 'Lin', title: 'Linear price scale' },
  { id: 'log', label: 'Log', title: 'Logarithmic price scale' },
  { id: 'percent', label: '%', title: 'Percentage price scale' },
];

const CHART_TYPES = Object.keys(CHART_TYPE_LABELS) as ChartType[];

/** Compact toolbar exposing TradingView-style chart controls. */
export function ChartToolbar(props: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-base-700 px-2 py-1.5 text-xs">
      {/* Chart type */}
      <select
        aria-label="Chart type"
        value={props.chartType}
        onChange={(e) => props.onChartType(e.target.value as ChartType)}
        className="rounded-md border border-base-700 bg-base-900 px-2 py-1 text-xs text-slate-200 outline-none focus:border-accent"
      >
        {CHART_TYPES.map((t) => (
          <option key={t} value={t}>
            {CHART_TYPE_LABELS[t]}
          </option>
        ))}
      </select>

      <Divider />

      {/* Price-scale mode */}
      <div className="flex items-center gap-0.5">
        {SCALE_MODES.map((m) => (
          <ToolButton
            key={m.id}
            active={props.scaleMode === m.id}
            title={m.title}
            onClick={() => props.onScaleMode(m.id)}
          >
            {m.label}
          </ToolButton>
        ))}
      </div>

      <Divider />

      {/* Drawing tools */}
      <ToolButton
        active={props.drawTool === 'trend'}
        title="Trend line (click two points)"
        onClick={() =>
          props.onDrawTool(props.drawTool === 'trend' ? 'none' : 'trend')
        }
      >
        ╱ Trend
      </ToolButton>
      <ToolButton
        active={props.drawTool === 'hline'}
        title="Horizontal line (click a price)"
        onClick={() =>
          props.onDrawTool(props.drawTool === 'hline' ? 'none' : 'hline')
        }
      >
        — H-Line
      </ToolButton>
      <ToolButton
        active={false}
        disabled={!props.hasDrawings}
        title="Remove all drawings"
        onClick={props.onClearDrawings}
      >
        Clear
      </ToolButton>

      <Divider />

      {/* Toggles & actions */}
      <ToolButton
        active={props.showVolume}
        title="Toggle volume histogram"
        onClick={props.onToggleVolume}
      >
        Vol
      </ToolButton>
      <ToolButton
        active={props.crosshair}
        title="Toggle crosshair"
        onClick={props.onToggleCrosshair}
      >
        ✛
      </ToolButton>
      <ToolButton active={false} title="Zoom in" onClick={props.onZoomIn}>
        ＋
      </ToolButton>
      <ToolButton active={false} title="Zoom out" onClick={props.onZoomOut}>
        －
      </ToolButton>
      <ToolButton active={false} title="Reset chart view (fit all data)" onClick={props.onFit}>
        ⟲ Reset
      </ToolButton>
      <ToolButton
        active={false}
        title="Download chart as PNG"
        onClick={props.onScreenshot}
      >
        ⤓ PNG
      </ToolButton>
    </div>
  );
}

function Divider() {
  return <span className="mx-0.5 h-4 w-px bg-base-700" aria-hidden />;
}

function ToolButton({
  active,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <Button
      variant="ghost"
      className={cn(
        'px-2 py-1 text-xs',
        active && 'bg-accent/20 text-accent',
      )}
      {...props}
    >
      {children}
    </Button>
  );
}
