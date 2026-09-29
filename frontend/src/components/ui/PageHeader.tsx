import type { ReactNode } from 'react';

type Props = {
  title: string;
  description?: ReactNode;
  breadcrumb?: [string, string];
  actions?: ReactNode;
  /** Overview header sits above a divider; workspace headers do not. */
  divider?: boolean;
};

/** Page title block: Newsreader headline, Geist description, optional mono breadcrumb. */
export function PageHeader({ title, description, breadcrumb, actions, divider = true }: Props) {
  return (
    <header className={`flex flex-col md:flex-row md:items-end justify-between gap-space-md ${divider ? 'pb-space-lg border-b border-outline-variant/30' : ''}`}>
      <div className="max-w-2xl">
        {breadcrumb && (
          <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm mb-1.5">
            <span>{breadcrumb[0]}</span>
            <span className="text-outline-variant">/</span>
            <span className="text-on-surface font-label-md text-label-md">{breadcrumb[1]}</span>
          </div>
        )}
        <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">{title}</h1>
        {description && <p className="font-body-md text-body-md text-on-surface-variant mt-1">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-space-sm self-start md:self-auto shrink-0">{actions}</div>}
    </header>
  );
}

/** Workspace section header (Classify: "Classify text" / "Classification result"). */
export function SectionHeader({ title, description, as: Tag = 'h2' }: { title: string; description?: ReactNode; as?: 'h1' | 'h2' }) {
  return (
    <div className="flex flex-col gap-space-xs">
      <Tag className="font-headline-lg text-headline-lg text-on-surface tracking-tight">{title}</Tag>
      {description && <p className="font-body-md text-body-md text-on-surface-variant">{description}</p>}
    </div>
  );
}
