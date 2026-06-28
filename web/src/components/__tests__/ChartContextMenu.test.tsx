import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChartContextMenu, type ContextMenuItem } from '../ChartContextMenu';

function items(onSelect = vi.fn()): ContextMenuItem[] {
  return [{ label: 'Reset Chart View', onSelect }];
}

describe('ChartContextMenu', () => {
  it('renders its menu items', () => {
    render(<ChartContextMenu x={10} y={20} items={items()} onClose={vi.fn()} />);
    expect(
      screen.getByRole('menuitem', { name: 'Reset Chart View' }),
    ).toBeInTheDocument();
  });

  it('positions itself at the given coordinates', () => {
    render(<ChartContextMenu x={42} y={84} items={items()} onClose={vi.fn()} />);
    const menu = screen.getByRole('menu', { name: 'Chart actions' });
    expect(menu).toHaveStyle({ left: '42px', top: '84px' });
  });

  it('calls onSelect then onClose when an item is clicked', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <ChartContextMenu x={0} y={0} items={items(onSelect)} onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset Chart View' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<ChartContextMenu x={0} y={0} items={items()} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when clicking outside the menu', () => {
    const onClose = vi.fn();
    render(<ChartContextMenu x={0} y={0} items={items()} onClose={onClose} />);
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not fire onSelect for a disabled item', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <ChartContextMenu
        x={0}
        y={0}
        items={[{ label: 'Reset Chart View', onSelect, disabled: true }]}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset Chart View' }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
