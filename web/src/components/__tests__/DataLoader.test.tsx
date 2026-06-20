import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mutable runtime flags so each test can pick the desktop vs browser branch.
// `vi.hoisted` lets the (hoisted) vi.mock factory reference these safely.
const flags = vi.hoisted(() => ({
  isDesktop: false,
  hasProxy: false,
  liveAvailable: true,
}));

vi.mock('../../engine', () => ({ engine: {}, preloadEngine: vi.fn() }));

vi.mock('../../lib/storage', () => ({
  isStorageReady: vi.fn().mockResolvedValue(false),
  listCachedSymbols: vi.fn().mockResolvedValue([]),
  loadCandles: vi.fn().mockResolvedValue([]),
  readOpfs: vi.fn().mockResolvedValue(null),
  saveCandles: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/dataProvider', () => ({
  get isDesktop() {
    return flags.isDesktop;
  },
  get hasProxy() {
    return flags.hasProxy;
  },
  get liveAvailable() {
    return flags.liveAvailable;
  },
  fetchLive: vi.fn().mockResolvedValue([]),
  loadFromCsvFile: vi.fn(),
  loadFromNative: vi.fn(),
  loadFromProxy: vi.fn(),
  loadSample: vi.fn(() => []),
}));

import { DataLoader } from '../DataLoader';
import { useStore } from '../../store/useStore';

beforeEach(() => {
  flags.isDesktop = false;
  flags.hasProxy = false;
  flags.liveAvailable = true;
  useStore.setState({ dataMode: 'local', provider: 'yfinance', loading: false });
});

describe('DataLoader — data mode toggle', () => {
  it('renders Live and Local options plus the CSV controls', () => {
    render(<DataLoader />);
    expect(screen.getByRole('button', { name: 'live' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'local' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /upload csv/i }),
    ).toBeInTheDocument();
  });

  it('clicking Live switches the store data mode', () => {
    render(<DataLoader />);
    fireEvent.click(screen.getByRole('button', { name: 'live' }));
    expect(useStore.getState().dataMode).toBe('live');
  });

  it('disables Live when live data is unavailable', () => {
    flags.liveAvailable = false;
    render(<DataLoader />);
    expect(screen.getByRole('button', { name: 'live' })).toBeDisabled();
  });
});

describe('DataLoader — browser branch', () => {
  it('shows the setup hint when no proxy is configured', () => {
    flags.isDesktop = false;
    flags.hasProxy = false;
    render(<DataLoader />);
    expect(screen.getByText(/live fetch is off/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('enables the proxy fetch button when a proxy exists', () => {
    flags.hasProxy = true;
    render(<DataLoader />);
    expect(
      screen.getByRole('button', { name: /^fetch live data$/i }),
    ).toBeEnabled();
  });
});

describe('DataLoader — desktop branch', () => {
  it('renders the source selector with both providers', () => {
    flags.isDesktop = true;
    render(<DataLoader />);
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /yfinance-rs/i })).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: /yahoo_finance_api/i }),
    ).toBeInTheDocument();
  });

  it('changing the source updates the store provider', () => {
    flags.isDesktop = true;
    render(<DataLoader />);
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'yahoo' },
    });
    expect(useStore.getState().provider).toBe('yahoo');
  });
});
