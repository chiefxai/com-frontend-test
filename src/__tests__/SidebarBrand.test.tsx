import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SidebarBrand from '../components/ui/SidebarBrand';

describe('shared organization and platform admin sidebar header', () => {
  it('keeps the logo as the expand button in the collapsed rail', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <SidebarBrand collapsed onToggle={onToggle} title="Chief Connect" subtitle="Organization" navId="organization-nav" />
    );

    const button = screen.getByRole('button', { name: 'Expand sidebar' });
    const logo = container.querySelector('img');
    expect(logo?.closest('button')).toBe(button);
    expect(logo?.className).toContain('group-hover/brand:opacity-0');
    expect(button.getAttribute('aria-controls')).toBe('organization-nav');
    expect(screen.queryByRole('button', { name: 'Collapse sidebar' })).toBeNull();
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('shows a right-aligned collapse button with a static logo for organizations', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <SidebarBrand collapsed={false} onToggle={onToggle} title="Chief Connect" subtitle="Acme" navId="organization-nav" />
    );

    const logo = container.querySelector('img');
    expect(logo?.closest('button')).toBeNull();
    expect(logo?.className).not.toContain('group-hover/brand:opacity-0');
    const button = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(button.className).toContain('ml-auto');
    expect(button.getAttribute('aria-controls')).toBe('organization-nav');
    fireEvent.click(logo!.parentElement!);
    expect(onToggle).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('uses the same behavior for platform admin and preserves the home link', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <MemoryRouter>
        <SidebarBrand collapsed={false} onToggle={onToggle} title="Chief Connect" subtitle="Platform Admin" homeTo="/admin/overview" navId="platform-admin-nav" />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Chief Connect home' }).getAttribute('href')).toBe('/admin/overview');
    expect(container.querySelector('img')?.closest('button')).toBeNull();
    const button = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(button.getAttribute('aria-controls')).toBe('platform-admin-nav');
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
