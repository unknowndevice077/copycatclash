interface Props {
  colors: string[];
  color: string;
  setColor: (c: string) => void;
  customAllowed: boolean;
  disabled: boolean;
  vertical: boolean;
}

/** Palette tray. On mobile it's a horizontally swipeable strip with snap points. */
export function Palette({ colors, color, setColor, customAllowed, disabled, vertical }: Props) {
  return (
    <div
      className={`paper p-2 ${vertical ? 'grid grid-cols-4 gap-1.5' : 'no-scrollbar flex snap-x snap-mandatory gap-1.5 overflow-x-auto'}`}
      role="radiogroup"
      aria-label="Colors"
    >
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={color === c}
          aria-label={`Color ${c}`}
          disabled={disabled}
          onClick={() => setColor(c)}
          className={`h-11 w-11 shrink-0 snap-start rounded-xl border-3 transition disabled:opacity-40 ${color === c ? 'scale-110 border-ink ring-4 ring-sun' : 'border-ink/70'}`}
          style={{ background: c }}
        />
      ))}
      {customAllowed && (
        <label className={`relative grid h-11 w-11 shrink-0 cursor-pointer snap-start place-items-center rounded-xl border-3 border-ink bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)] ${disabled ? 'opacity-40' : ''}`} title="Custom color">
          <span className="sr-only">Custom color</span>
          <input type="color" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" value={color} disabled={disabled} onChange={(e) => setColor(e.target.value)} />
        </label>
      )}
    </div>
  );
}
