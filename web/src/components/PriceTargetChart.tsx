import { useEffect, useRef, useState } from 'react';
import {
  targetChartGeometry,
  type PriceTier,
} from '../lib/priceTargets';

interface Props {
  tiers: PriceTier[];
  /** Currency/number formatter for axis + tooltip prices. */
  formatPrice: (n: number) => string;
}

const LINE = '#3b82f6'; // accent
const BASELINE = '#f59e0b'; // amber — the 0% reference
const AXIS = '#1a2233'; // base-700
const TEXT = '#94a3b8'; // slate-400

/**
 * A self-contained SVG line chart for the Price Targets tool: X-axis is the
 * percentage change, Y-axis is the resulting target price. A dashed horizontal
 * line marks the 0% (current price) level. Rendered as SVG (not
 * lightweight-charts, which is time-axis based) so the X-axis can be a plain
 * percentage scale.
 */
export function PriceTargetChart({ tiers, formatPrice }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hover, setHover] = useState<{ x: number; y: number; tier: PriceTier } | null>(
    null,
  );

  // Track the available pixel box so the SVG scales with its panel.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () =>
      setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = targetChartGeometry(tiers, {
    width: size.width,
    height: size.height,
  });

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {geo ? (
        <svg
          width={geo.width}
          height={geo.height}
          className="block"
          role="img"
          aria-label="Price targets by percentage change"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            // Snap to the nearest plotted point by x.
            let nearest = geo.points[0];
            for (const p of geo.points) {
              if (Math.abs(p.x - mx) < Math.abs(nearest.x - mx)) nearest = p;
            }
            setHover({
              x: nearest.x,
              y: nearest.y,
              tier: { percent: nearest.percent, price: nearest.price },
            });
          }}
        >
          {/* Plot frame */}
          <rect
            x={geo.plot.x0}
            y={geo.plot.y0}
            width={geo.plot.x1 - geo.plot.x0}
            height={geo.plot.y1 - geo.plot.y0}
            fill="none"
            stroke={AXIS}
          />

          {/* Y gridlines + price labels */}
          {geo.yTicks.map((t, i) => (
            <g key={`y${i}`}>
              <line
                x1={geo.plot.x0}
                x2={geo.plot.x1}
                y1={t.pos}
                y2={t.pos}
                stroke={AXIS}
                strokeWidth={1}
              />
              <text
                x={geo.plot.x0 - 6}
                y={t.pos}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill={TEXT}
              >
                {formatPrice(t.value)}
              </text>
            </g>
          ))}

          {/* X gridlines + percentage labels */}
          {geo.xTicks.map((t, i) => (
            <g key={`x${i}`}>
              <line
                x1={t.pos}
                x2={t.pos}
                y1={geo.plot.y0}
                y2={geo.plot.y1}
                stroke={AXIS}
                strokeWidth={1}
              />
              <text
                x={t.pos}
                y={geo.plot.y1 + 14}
                textAnchor="middle"
                fontSize={10}
                fill={TEXT}
              >
                {t.value > 0 ? `+${t.value}%` : `${t.value}%`}
              </text>
            </g>
          ))}

          {/* 0% (current price) reference — dashed horizontal line */}
          {geo.baselineY != null && (
            <g>
              <line
                x1={geo.plot.x0}
                x2={geo.plot.x1}
                y1={geo.baselineY}
                y2={geo.baselineY}
                stroke={BASELINE}
                strokeWidth={1.5}
                strokeDasharray="6 4"
              />
              <text
                x={geo.plot.x1 - 4}
                y={geo.baselineY - 4}
                textAnchor="end"
                fontSize={10}
                fill={BASELINE}
              >
                0% · current
              </text>
            </g>
          )}

          {/* Target price line */}
          <polyline
            points={geo.polyline}
            fill="none"
            stroke={LINE}
            strokeWidth={2}
          />

          {/* Hover marker + readout */}
          {hover && (
            <g>
              <circle cx={hover.x} cy={hover.y} r={3.5} fill={LINE} />
              <text
                x={hover.x}
                y={Math.max(geo.plot.y0 + 10, hover.y - 8)}
                textAnchor="middle"
                fontSize={11}
                fill="#e2e8f0"
              >
                {hover.tier.percent > 0
                  ? `+${hover.tier.percent}%`
                  : `${hover.tier.percent}%`}{' '}
                → {formatPrice(hover.tier.price)}
              </text>
            </g>
          )}

          {/* Axis titles */}
          <text
            x={(geo.plot.x0 + geo.plot.x1) / 2}
            y={geo.height - 2}
            textAnchor="middle"
            fontSize={10}
            fill={TEXT}
          >
            Percentage change
          </text>
        </svg>
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-slate-500">
          Enter a base price to plot targets.
        </div>
      )}
    </div>
  );
}
