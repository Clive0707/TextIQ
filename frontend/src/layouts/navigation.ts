export type NavItem = { path: string; label: string; icon: string };

// Navigation structure and icons exactly as in the Stitch sidebar.
export const primaryNav: NavItem[] = [
  { path: '/', label: 'Overview', icon: 'grid_view' },
  { path: '/classify', label: 'Classify Text', icon: 'spellcheck' },
  { path: '/batch', label: 'Batch Classification', icon: 'layers' },
  { path: '/models', label: 'Models', icon: 'account_tree' },
  { path: '/experiments', label: 'Experiments', icon: 'science' },
  { path: '/analytics', label: 'Analytics', icon: 'analytics' },
  { path: '/dataset', label: 'Dataset', icon: 'database' },
  { path: '/settings', label: 'Settings', icon: 'tune' },
];

export const secondaryNav: NavItem[] = [{ path: '/docs', label: 'Documentation', icon: 'menu_book' }];

export function pageTitle(pathname: string) {
  const all = [...primaryNav, ...secondaryNav];
  const match = all.find((n) => (n.path === '/' ? pathname === '/' : pathname.startsWith(n.path)));
  return match?.label ?? 'Workspace';
}
