import { useEffect, useState } from 'react';
import { AnalysisWorkspace } from './components/AnalysisWorkspace';
import { LiveDashboard } from './components/dashboard/LiveDashboard';
import { useStore } from './store/useStore';
import { preloadEngine } from './engine';
import { cn } from './lib/utils';

/** Top-level view: live multi-chart dashboard or single-symbol analysis. */
type View = 'live' | 'analyse';

const VIEW_KEY = 'axiomic.view';

function initialView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'analyse' ? 'analyse' : 'live';
  } catch {
    return 'live';
  }
}

export default function App() {
  const init = useStore((s) => s.init);
  const storageReady = useStore((s) => s.storageReady);
  const [view, setView] = useState<View>(initialView);

  useEffect(() => {
    preloadEngine();
    void init();
  }, [init]);

  const selectView = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Ignore storage failures; the choice still applies in-session.
    }
  };

  return (
    <div className="flex h-screen flex-col bg-base-900 text-slate-200">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between border-b border-base-700 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="text-lg font-bold tracking-tight text-slate-100">
              Axiomic
            </span>
          </div>
          <nav className="flex rounded-md border border-base-700 p-0.5">
            {(
              [
                ['live', 'Live Grid'],
                ['analyse', 'Analyse'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => selectView(id)}
                aria-pressed={view === id}
                className={cn(
                  'rounded px-3 py-1 text-xs font-medium transition-colors',
                  view === id
                    ? 'bg-accent text-white'
                    : 'text-slate-300 hover:bg-base-700',
                )}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px]',
              storageReady
                ? 'bg-accent-up/15 text-accent-up'
                : 'bg-base-700 text-slate-400',
            )}
          >
            {storageReady ? 'DuckDB ready' : 'In-memory'}
          </span>
        </div>
      </header>

      {view === 'live' ? <LiveDashboard /> : <AnalysisWorkspace />}
    </div>
  );
}

function Logo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2L3 20h4l2-4h6l2 4h4L12 2zm-2 11l2-4 2 4h-4z"
        fill="#3b82f6"
      />
    </svg>
  );
}
