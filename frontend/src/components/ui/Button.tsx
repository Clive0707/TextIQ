import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { Spinner } from './States';

type Variant = 'primary' | 'primary-lg' | 'secondary' | 'subtle' | 'link' | 'danger';

// Class sets lifted from the Stitch exports:
//  primary    — dashboard header "Classify text"
//  primary-lg — Classify workspace submit button
//  secondary  — dashboard "Import dataset"
//  subtle     — Classify "Clear text" / "Load sample"
//  link       — Classify footer "Export analysis (JSON)"
const variants: Record<Variant, string> = {
  primary:
    'px-space-md py-1.5 rounded bg-primary-container hover:bg-primary text-on-primary font-body-sm text-body-sm font-medium gap-1.5 shadow-sm',
  'primary-lg':
    'px-space-xl py-1.5 rounded bg-primary-container hover:bg-primary-fixed-dim text-on-primary-container font-label-lg text-label-lg gap-space-xs shadow-sm',
  secondary:
    'px-space-md py-1.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm gap-1.5',
  subtle:
    'px-space-md py-1.5 rounded bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm gap-1',
  link: 'text-outline hover:text-on-surface font-label-sm text-label-sm gap-1',
  danger:
    'px-space-md py-1.5 rounded bg-error-container/40 hover:bg-error-container/70 text-on-error-container font-body-sm text-body-sm gap-1.5',
};

const iconTone: Partial<Record<Variant, string>> = { secondary: 'text-outline' };
const base = 'inline-flex items-center justify-center transition-colors active:translate-y-px';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  icon?: string;
  loading?: boolean;
  children?: ReactNode;
};

export function Button({ variant = 'secondary', icon, loading, disabled, className = '', children, type = 'button', ...rest }: Props) {
  const iconSize = variant === 'link' ? 14 : 16;
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`${base} disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0 ${variants[variant]} ${className}`}
      {...rest}
    >
      {loading ? <Spinner size={iconSize} /> : icon ? <Icon name={icon} size={iconSize} className={iconTone[variant] ?? ''} /> : null}
      {children != null && <span>{children}</span>}
    </button>
  );
}

/** Router link styled as a button (avoids nesting <button> inside <a>). */
export function ButtonLink({ to, variant = 'secondary', icon, children, className = '' }: { to: string; variant?: Variant; icon?: string; children: ReactNode; className?: string }) {
  const iconSize = variant === 'link' ? 14 : 16;
  return (
    <Link to={to} className={`${base} ${variants[variant]} ${className}`}>
      {icon && <Icon name={icon} size={iconSize} className={iconTone[variant] ?? ''} />}
      <span>{children}</span>
    </Link>
  );
}
