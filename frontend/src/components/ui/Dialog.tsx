import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './Button';

/** General-purpose modal used for secondary flows (e.g. adding a dataset). */
export function Modal({ open, title, children, onClose, wide }: { open: boolean; title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-margin-mobile bg-surface-container-lowest/70 animate-fade-in" onMouseDown={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto bg-surface-container-low rounded border border-outline-variant/30 p-space-lg shadow-2xl animate-fade-up focus:outline-none`}
      >
        <div className="flex items-center justify-between pb-space-sm border-b border-outline-variant/15">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 flex items-center justify-center rounded text-outline hover:text-on-surface hover:bg-surface-container">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
              close
            </span>
          </button>
        </div>
        <div className="pt-space-md">{children}</div>
      </div>
    </div>
  );
}

type Props = {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/** Confirmation dialog for destructive actions. */
export function ConfirmDialog({ open, title, children, confirmLabel = 'Confirm', danger, pending, onConfirm, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-margin-mobile bg-surface-container-lowest/70 animate-fade-in" onMouseDown={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-surface-container-low rounded border border-outline-variant/30 p-space-lg shadow-2xl animate-fade-up focus:outline-none"
      >
        <h2 className="font-headline-sm text-headline-sm text-on-surface pb-space-sm border-b border-outline-variant/15">{title}</h2>
        <div className="font-body-sm text-body-sm text-on-surface-variant py-space-md">{children}</div>
        <div className="flex justify-end gap-space-sm pt-space-sm border-t border-outline-variant/15">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
