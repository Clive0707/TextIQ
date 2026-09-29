import { useRef, useState } from 'react';
import { Icon } from './ui/Icon';
import { Spinner } from './ui/States';

type Props = { onFile: (file: File) => void; busy?: boolean; label?: string; hint?: string };

/** CSV drop zone in the Stitch input style (lowest surface, hairline dashed border). */
export function FileDrop({ onFile, busy, label = 'Drop a CSV file here or browse', hint = 'CSV with a header row · up to 50 MB' }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-busy={busy}
      onClick={() => !busy && input.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !busy && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f && !busy) onFile(f);
      }}
      className={`flex flex-col items-center justify-center gap-space-xs text-center px-space-lg py-space-xl rounded border border-dashed cursor-pointer transition-colors bg-surface-container-lowest ${
        over ? 'border-primary-container bg-primary-container/5' : 'border-outline-variant/50 hover:border-outline'
      }`}
    >
      {busy ? <Spinner size={20} className="text-primary" /> : <Icon name="upload_file" size={20} className="text-outline" />}
      <span className="font-body-sm text-body-sm text-on-surface">{busy ? 'Reading file…' : label}</span>
      <span className="font-label-sm text-label-sm text-outline">{hint}</span>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
