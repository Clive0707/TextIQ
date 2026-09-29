import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { Icon } from './Icon';

/**
 * Parameter control card from the Classify workspace ("Classifier Model" /
 * "Vectorization / Extraction"): mono label row with a right-aligned hint.
 */
export function FieldCard({ label, hint, children, className = '' }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-space-xs bg-surface-container-low p-space-md rounded ${className}`}>
      <div className="font-label-sm text-label-sm text-on-surface-variant flex items-center justify-between gap-2 min-w-0">
        <span className="whitespace-nowrap">{label}</span>
        {hint != null && <span className="text-outline truncate">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/** Bare field (label above control) for forms inside panels. */
export function Field({ label, hint, children, htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-space-xs min-w-0">
      <label htmlFor={htmlFor} className="font-label-sm text-label-sm text-on-surface-variant flex items-center justify-between gap-2">
        <span>{label}</span>
        {hint != null && <span className="text-outline truncate">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

export function Select({ children, className = '', ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={`w-full bg-surface-container appearance-none font-body-sm text-body-sm text-on-surface py-1.5 px-space-md pr-8 rounded focus:outline-none focus:ring-1 focus:ring-primary-container cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
        {...rest}
      >
        {children}
      </select>
      <Icon name="expand_more" size={16} className="absolute right-2.5 top-2 pointer-events-none text-outline" />
    </div>
  );
}

export function TextInput({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full h-8 px-space-md bg-surface-container border border-transparent rounded text-on-surface placeholder:text-outline font-body-sm text-body-sm focus:outline-none focus:border-primary-container transition-colors disabled:opacity-60 tabular ${className}`}
      {...rest}
    />
  );
}

export function Checkbox({ label, checked, onChange, disabled, title }: { label: ReactNode; checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean; title?: string }) {
  return (
    <label className={`flex items-center gap-space-xs select-none ${disabled ? 'cursor-default' : 'cursor-pointer'}`} title={title}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="w-3.5 h-3.5 rounded bg-surface-container accent-primary-container cursor-pointer disabled:cursor-default"
      />
      <span className="font-label-sm text-label-sm text-on-surface-variant">{label}</span>
    </label>
  );
}

/** Segmented control for switching views inside a panel. */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="inline-flex p-0.5 rounded bg-surface-container-lowest border border-outline-variant/20">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`px-space-md py-1 rounded font-label-sm text-label-sm transition-colors ${value === o.value ? 'bg-surface-container text-on-surface' : 'text-outline hover:text-on-surface'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
