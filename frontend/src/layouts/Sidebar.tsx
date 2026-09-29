import { NavLink } from 'react-router-dom';
import { Icon } from '../components/ui/Icon';
import { primaryNav, secondaryNav, type NavItem } from './navigation';

function NavEntry({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center gap-space-sm px-space-md py-1.5 rounded-lg transition-colors ${
          isActive
            ? 'bg-surface-container text-on-surface font-medium'
            : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface font-body-sm text-body-sm'
        }`
      }
    >
      <Icon name={item.icon} size={18} />
      <span>{item.label}</span>
    </NavLink>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      {/* Scrim for the tablet/mobile drawer */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-surface-container-lowest/60 lg:hidden transition-opacity ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />
      <aside
        className={`fixed left-0 top-0 h-full w-64 bg-surface-container-lowest z-50 flex flex-col justify-between border-r border-outline-variant/30 transition-transform duration-200 ease-out lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Primary"
      >
        <div className="flex flex-col min-h-0">
          <div className="h-14 px-space-lg flex items-center gap-space-sm border-b border-outline-variant/20 shrink-0">
            <img alt="" className="h-8 w-8" src="/emblem.svg" />
            <span className="font-headline-sm text-headline-sm tracking-tight text-on-surface">TextIQ</span>
            <button onClick={onClose} className="ml-auto lg:hidden w-8 h-8 flex items-center justify-center rounded text-on-surface-variant hover:bg-surface-container" aria-label="Close navigation">
              <Icon name="close" size={18} />
            </button>
          </div>
          <nav className="flex flex-col py-space-sm px-space-sm gap-0.5 overflow-y-auto">
            {primaryNav.map((item) => (
              <NavEntry key={item.path} item={item} onNavigate={onClose} />
            ))}
          </nav>
        </div>
        <div className="flex flex-col py-space-sm px-space-sm border-t border-outline-variant/20 gap-0.5">
          {secondaryNav.map((item) => (
            <NavEntry key={item.path} item={item} onNavigate={onClose} />
          ))}
        </div>
      </aside>
    </>
  );
}
