import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Modal from '../components/ui/Modal';
import SlideOver from '../components/ui/SlideOver';

function ModalHarness() {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)}>Open modal</button>
    <Modal open={open} onClose={() => setOpen(false)} title="Edit member" subtitle="Manage workspace access">
      <button type="button">First action</button>
      <button type="button">Last action</button>
    </Modal>
  </>;
}

function SlideOverHarness() {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)}>Open panel</button>
    <SlideOver open={open} onClose={() => setOpen(false)} title="Organization details">
      <button type="button">Panel action</button>
    </SlideOver>
  </>;
}

describe('shared accessible dialogs', () => {
  it('opens a named modal, traps Tab at boundaries and restores focus on Escape', () => {
    render(<ModalHarness />);
    const trigger = screen.getByRole('button', { name: 'Open modal' });
    trigger.focus();
    fireEvent.click(trigger);
    const modal = screen.getByRole('dialog', { name: 'Edit member' });
    expect(modal).toHaveAttribute('aria-modal', 'true');
    expect(modal).toHaveAttribute('aria-describedby');
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();
    screen.getByRole('button', { name: 'Last action' }).focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Edit member' })).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('opens and closes an accessible slide-over and restores focus to its trigger', () => {
    render(<SlideOverHarness />);
    const trigger = screen.getByRole('button', { name: 'Open panel' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Organization details' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Close panel' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(screen.queryByRole('dialog', { name: 'Organization details' })).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
