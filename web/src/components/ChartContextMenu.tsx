import { useEffect, useRef } from 'react';
import { cn } from '../lib/utils';

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  title?: string;
  disabled?: boolean;
}

interface Props {
  /** Position (px) relative to the chart container's top-left corner. */
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

/**
 * Lightweight right-click context menu for the chart area. Positions itself
 * absolutely inside the (relatively-positioned) chart container and closes on
 * outside click, Escape, scroll, or after an item is selected.
 */
export function ChartContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Chart actions"
      className="absolute z-30 min-w-[11rem] overflow-hidden rounded-md border border-base-700 bg-base-900/95 py-1 text-xs shadow-lg backdrop-blur-sm"
      style={{ left: x, top: y }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          title={item.title}
          className={cn(
            'block w-full px-3 py-1.5 text-left text-slate-200 transition-colors',
            'hover:bg-accent/20 hover:text-accent',
            'disabled:cursor-not-allowed disabled:text-slate-500 disabled:hover:bg-transparent',
          )}
          onClick={() => {
            if (item.disabled) return;
            item.onSelect();
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
