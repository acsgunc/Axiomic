import { cn } from '../lib/utils';

/** Small primitive button used across the toolbar/panels. */
export function Button({
  children,
  className,
  variant = 'default',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'ghost' | 'accent';
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'default' &&
          'bg-base-700 text-slate-200 hover:bg-base-600',
        variant === 'ghost' &&
          'bg-transparent text-slate-300 hover:bg-base-700',
        variant === 'accent' &&
          'bg-accent text-white hover:bg-accent/90',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** Card container with a title header. */
export function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'flex flex-col rounded-lg border border-base-700 bg-base-800/60',
        className,
      )}
    >
      <header className="flex items-center justify-between border-b border-base-700 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {title}
        </h2>
        {action}
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
    </section>
  );
}
