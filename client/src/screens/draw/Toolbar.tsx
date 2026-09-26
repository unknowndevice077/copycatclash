import { BRUSH_SIZES } from '@ccc/shared';
import type { Tool } from '../../canvas/DrawCanvas';

interface Props {
  tool: Tool;
  setTool: (t: Tool) => void;
  size: number;
  setSize: (s: number) => void;
  color: string;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  eyedropperAvailable: boolean;
  eyedropper: boolean;
  setEyedropper: (v: boolean) => void;
  disabled: boolean;
  vertical: boolean;
}

const TOOLS: Array<{ id: Tool; icon: string; label: string; key: string }> = [
  { id: 'brush', icon: '🖌️', label: 'Brush', key: 'B' },
  { id: 'fill', icon: '🪣', label: 'Fill bucket', key: 'F' },
  { id: 'eraser', icon: '🧽', label: 'Eraser (your strokes)', key: 'E' },
];

function ToolButton({ active, onClick, label, children, disabled }: { active?: boolean; onClick: () => void; label: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border-3 border-ink text-xl shadow-chunky-sm transition disabled:opacity-40 ${active ? 'bg-sun' : 'bg-paper hover:bg-paperdim'}`}
    >
      {children}
    </button>
  );
}

export function Toolbar(p: Props) {
  return (
    <div
      className={`paper flex gap-2 p-2 ${p.vertical ? 'flex-col items-center' : 'no-scrollbar items-center overflow-x-auto'}`}
      role="toolbar"
      aria-label="Drawing tools"
      aria-orientation={p.vertical ? 'vertical' : 'horizontal'}
    >
      {TOOLS.map((t) => (
        <ToolButton key={t.id} active={p.tool === t.id && !p.eyedropper} onClick={() => { p.setTool(t.id); p.setEyedropper(false); }} label={`${t.label} (${t.key})`} disabled={p.disabled}>
          {t.icon}
        </ToolButton>
      ))}
      {p.eyedropperAvailable && (
        <ToolButton active={p.eyedropper} onClick={() => p.setEyedropper(!p.eyedropper)} label="Eyedropper: tap the reference photo (I)" disabled={p.disabled}>
          💧
        </ToolButton>
      )}
      <div className={`${p.vertical ? 'h-0.5 w-10' : 'h-10 w-0.5'} shrink-0 bg-ink/30`} aria-hidden />
      {BRUSH_SIZES.map((s) => (
        <ToolButton key={s} active={p.size === s} onClick={() => p.setSize(s)} label={`Brush size ${s}`} disabled={p.disabled}>
          <span className="rounded-full" style={{ width: Math.max(5, Math.min(30, s * 0.65)), height: Math.max(5, Math.min(30, s * 0.65)), background: p.color, border: '2px solid rgb(var(--c-ink))' }} />
        </ToolButton>
      ))}
      <div className={`${p.vertical ? 'h-0.5 w-10' : 'h-10 w-0.5'} shrink-0 bg-ink/30`} aria-hidden />
      <ToolButton onClick={p.onUndo} label="Undo (Ctrl+Z)" disabled={p.disabled}>
        ↶
      </ToolButton>
      <ToolButton onClick={p.onRedo} label="Redo (Ctrl+Shift+Z)" disabled={p.disabled}>
        ↷
      </ToolButton>
      <ToolButton onClick={p.onClear} label="Clear my strokes" disabled={p.disabled}>
        🗑️
      </ToolButton>
    </div>
  );
}
