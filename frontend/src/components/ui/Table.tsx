import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes, HTMLAttributes } from 'react';

/** Data table in the Overview style: uppercase mono headers, hairline dividers. */
export function Table({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-left border-collapse ${className}`}>{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-outline-variant/25 font-label-sm text-label-sm text-outline uppercase tracking-wider">{children}</tr>
    </thead>
  );
}

export function Th({ children, align = 'left', className = '', ...rest }: ThHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <th className={`py-2 px-3 first:pl-0 last:pr-0 font-normal whitespace-nowrap ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''} ${className}`} {...rest}>
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-outline-variant/15 font-body-sm text-body-sm">{children}</tbody>;
}

export function Tr({ children, className = '', ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={`hover:bg-surface-container/40 transition-colors ${className}`} {...rest}>
      {children}
    </tr>
  );
}

export function Td({ children, align = 'left', className = '', ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <td className={`py-2.5 px-3 first:pl-0 last:pr-0 ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''} ${className}`} {...rest}>
      {children}
    </td>
  );
}

/** Numeric cell: JetBrains Mono, right-aligned. */
export function NumTd({ children, muted, className = '' }: { children: ReactNode; muted?: boolean; className?: string }) {
  return (
    <Td align="right" className={`tabular ${muted ? 'font-label-sm text-label-sm text-outline' : 'font-label-md text-label-md text-on-surface'} ${className}`}>
      {children}
    </Td>
  );
}
