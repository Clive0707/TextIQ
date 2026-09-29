import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setNavOpen(false);
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:px-3 focus:py-1 focus:bg-surface-container focus:rounded">
        Skip to content
      </a>
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="lg:pl-64">
        <Header onMenu={() => setNavOpen(true)} />
        <main id="main" className="relative pt-14 w-full bg-surface min-h-screen">
          <div key={pathname} className="px-margin-mobile md:px-gutter-lg py-gutter-lg animate-fade-up">
            <Outlet />
          </div>
        </main>
      </div>
    </>
  );
}
