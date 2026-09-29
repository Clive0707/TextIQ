import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../components/ui/Icon';
import { Spinner } from '../components/ui/States';
import { api } from '../services/api';
import type { SearchResults } from '../types/api';
import { fmtInt } from '../utils/format';
import { pageTitle } from './navigation';

function SearchBox() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [failed, setFailed] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    const t = window.setTimeout(() => {
      api
        .search(term)
        .then((r) => {
          setResults(r);
          setFailed(false);
        })
        .catch(() => setFailed(true))
        .finally(() => setLoading(false));
    }, 220);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const go = (to: string) => {
    setOpen(false);
    setQ('');
    navigate(to);
  };

  const empty = results && !results.datasets.length && !results.models.length && !results.classifications.length;

  return (
    <div ref={boxRef} className="relative flex items-center">
      <Icon name="search" size={18} className="absolute left-space-md text-outline pointer-events-none" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        aria-label="Search text, models, datasets"
        className="w-44 sm:w-56 md:w-72 h-8 pl-9 pr-space-md bg-surface-container-low border border-outline-variant/40 rounded text-on-surface placeholder:text-outline font-body-sm text-body-sm focus:outline-none focus:border-primary-container transition-colors"
        placeholder="Search text, models, datasets..."
        type="search"
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute right-0 top-10 w-[min(26rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto bg-surface-container-low border border-outline-variant/30 rounded shadow-2xl p-space-sm animate-fade-up z-50">
          {loading && !results && (
            <div className="flex items-center gap-2 p-space-sm font-label-sm text-label-sm text-outline">
              <Spinner size={14} /> Searching…
            </div>
          )}
          {failed && <p className="p-space-sm font-body-sm text-body-sm text-on-surface-variant">Search is unavailable right now.</p>}
          {empty && <p className="p-space-sm font-body-sm text-body-sm text-on-surface-variant">No datasets, models or classifications match “{q.trim()}”.</p>}
          {results && results.models.length > 0 && (
            <ResultGroup title="Models">
              {results.models.map((m) => (
                <ResultItem key={m.id} icon="account_tree" onClick={() => go(`/models?id=${m.id}`)} primary={m.name} secondary={`${m.model_name} · ${m.feature_label} · ${m.status}`} />
              ))}
            </ResultGroup>
          )}
          {results && results.datasets.length > 0 && (
            <ResultGroup title="Datasets">
              {results.datasets.map((d) => (
                <ResultItem key={d.id} icon="database" onClick={() => go(`/dataset?id=${d.id}`)} primary={d.name} secondary={`${fmtInt(d.n_rows)} rows`} />
              ))}
            </ResultGroup>
          )}
          {results && results.classifications.length > 0 && (
            <ResultGroup title="Classified text">
              {results.classifications.map((c) => (
                <ResultItem key={c.id} icon="spellcheck" onClick={() => go(`/classify?history=${c.id}`)} primary={c.excerpt} secondary={c.predicted_label} />
              ))}
            </ResultGroup>
          )}
        </div>
      )}
    </div>
  );
}

function ResultGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <p className="px-space-sm pb-1 font-label-sm text-label-sm uppercase tracking-wider text-outline">{title}</p>
      {children}
    </div>
  );
}

function ResultItem({ icon, primary, secondary, onClick }: { icon: string; primary: string; secondary: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-start gap-space-sm px-space-sm py-1.5 rounded text-left hover:bg-surface-container transition-colors">
      <Icon name={icon} size={16} className="text-outline mt-0.5" />
      <span className="min-w-0">
        <span className="block font-body-sm text-body-sm text-on-surface truncate">{primary}</span>
        <span className="block font-label-sm text-label-sm text-outline truncate">{secondary}</span>
      </span>
    </button>
  );
}

export function Header({ onMenu }: { onMenu: () => void }) {
  const { pathname } = useLocation();
  return (
    <header className="fixed top-0 left-0 lg:left-64 right-0 h-14 bg-surface-container-lowest/90 backdrop-blur-md border-b border-outline-variant/30 z-30 flex items-center justify-between gap-space-md px-margin-mobile md:px-gutter-lg">
      <div className="flex items-center gap-space-md min-w-0">
        <button onClick={onMenu} className="lg:hidden w-8 h-8 flex items-center justify-center rounded text-on-surface-variant hover:bg-surface-container hover:text-on-surface" aria-label="Open navigation">
          <Icon name="menu" size={18} />
        </button>
        <img alt="" className="h-8 w-8 hidden sm:block" src="/emblem.svg" />
        <div className="hidden sm:flex items-center gap-space-xs font-label-md text-label-md text-on-surface-variant min-w-0">
          <span className="text-on-surface-variant/70">TextIQ</span>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface truncate">{pageTitle(pathname)}</span>
        </div>
      </div>
      <div className="flex items-center gap-space-lg">
        <SearchBox />
        <Link to="/settings" className="w-8 h-8 flex items-center justify-center rounded text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors" title="Settings" aria-label="Settings">
          <Icon name="settings" size={18} />
        </Link>
      </div>
    </header>
  );
}
