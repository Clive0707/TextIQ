type IconProps = { name: string; size?: 14 | 16 | 18 | 20 | 24 | 32; className?: string; filled?: boolean };

/** Material Symbols Outlined glyph, as used throughout the Stitch screens. */
export function Icon({ name, size = 18, className = '', filled = false }: IconProps) {
  return (
    <span
      aria-hidden="true"
      className={`material-symbols-outlined ${className}`}
      style={{ fontSize: size, fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 20` }}
    >
      {name}
    </span>
  );
}
