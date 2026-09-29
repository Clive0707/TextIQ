import { useId, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

type TabsProps<T extends string> = {
  value: T;
  onChange: (v: T) => void;
  tabs: { value: T; label: string; hint?: string }[];
  className?: string;
};

/** Underline tabs in the Stitch hairline style, for switching between secondary views. */
export function Tabs<T extends string>({ value, onChange, tabs, className = '' }: TabsProps<T>) {
  return (
    <div role="tablist" className={`flex gap-space-lg border-b border-outline-variant/20 overflow-x-auto overflow-y-hidden [scrollbar-width:none] ${className}`}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={`relative -mb-px py-2 font-body-sm text-body-sm whitespace-nowrap transition-colors border-b-2 ${
              active ? 'text-on-surface border-primary-container' : 'text-on-surface-variant border-transparent hover:text-on-surface'
            }`}
          >
            {t.label}
            {t.hint && <span className="ml-1.5 font-label-sm text-label-sm text-outline">{t.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

type DisclosureProps = {
  title: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
};

/** Collapsible section for advanced / level-3 information. */
export function Disclosure({ title, summary, children, defaultOpen = false, className = '' }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-space-md py-1.5 text-left group"
      >
        <span className="flex items-center gap-1.5 font-label-lg text-label-lg text-on-surface-variant group-hover:text-on-surface transition-colors">
          <Icon name="chevron_right" size={16} className={`text-outline transition-transform duration-150 ${open ? 'rotate-90' : ''}`} />
          {title}
        </span>
        {summary != null && !open && <span className="font-label-sm text-label-sm text-outline truncate">{summary}</span>}
      </button>
      {open && (
        <div id={id} className="pt-space-sm animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}

/** Small ⓘ that reveals an explanation on hover/focus, replacing always-visible notes. */
export function InfoTip({ children, label = 'More information' }: { children: ReactNode; label?: string }) {
  return (
    <span className="relative inline-flex group align-middle">
      <button type="button" aria-label={label} className="text-outline hover:text-on-surface focus:text-on-surface transition-colors inline-flex">
        <Icon name="info" size={14} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 bottom-full mb-1.5 -translate-x-1/2 w-64 p-space-sm rounded border border-outline-variant/30 bg-surface-container-high font-body-sm text-body-sm text-on-surface-variant shadow-xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-50 normal-case tracking-normal text-left"
      >
        {children}
      </span>
    </span>
  );
}
