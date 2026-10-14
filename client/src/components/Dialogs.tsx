import { useState, type FormEvent } from 'react';
import { AVATAR_FRAMES, BANNER_STYLES, CURSOR_SKINS, SHOWDOWN_EFFECTS, unlocked, type Cosmetic } from '../lib/cosmetics';
import { useSession } from '../store/session';
import { useSettings, type SettingsState } from '../store/settings';
import { useBugReport } from './BugReportDialog';
import { Modal } from './Modal';

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-xl px-1">
      <span>
        <span className="font-extrabold">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <input type="checkbox" className="h-6 w-6 accent-coral" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function CosmeticPicker({ title, list, value, level, onPick }: { title: string; list: Cosmetic[]; value: string; level: number; onPick: (id: string) => void }) {
  const open = unlocked(list, level).map((c) => c.id);
  return (
    <fieldset>
      <legend className="mb-1 font-display">{title}</legend>
      <div className="flex flex-wrap gap-2">
        {list.map((c) => {
          const isOpen = open.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              disabled={!isOpen}
              onClick={() => onPick(c.id)}
              className={`chip min-h-[44px] px-3 ${value === c.id ? 'bg-sun' : 'bg-paperdim'} disabled:opacity-40`}
              aria-pressed={value === c.id}
              title={isOpen ? c.label : `Unlocks at level ${c.level}`}
            >
              {isOpen ? c.label : `🔒 Lv ${c.level}`}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSettings();
  const level = useSession((st) => st.player?.level ?? 1);
  const set = (patch: Partial<Omit<SettingsState, 'set'>>) => s.set(patch);
  return (
    <Modal open={open} onClose={onClose} title="Settings" wide>
      <div className="grid gap-5 sm:grid-cols-2">
        <section className="space-y-1">
          <h3 className="font-display text-lg">Sound & feel</h3>
          <label className="block font-extrabold" htmlFor="vol">
            Master volume: {Math.round(s.volume * 100)}%
          </label>
          <input id="vol" type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => set({ volume: Number(e.target.value) })} className="w-full accent-coral" />
          <Toggle label="Mute all" checked={s.muted} onChange={(v) => set({ muted: v })} />
          <Toggle label="Brush scratch sound" checked={s.brushSound} onChange={(v) => set({ brushSound: v })} />
          <Toggle label="Vibration" hint="Round win / lose on mobile" checked={s.haptics} onChange={(v) => set({ haptics: v })} />
        </section>
        <section className="space-y-1">
          <h3 className="font-display text-lg">Accessibility</h3>
          <Toggle label="Reduce motion" checked={s.reducedMotion} onChange={(v) => set({ reducedMotion: v })} />
          <Toggle label="High contrast" checked={s.highContrast} onChange={(v) => set({ highContrast: v })} />
          <Toggle label="Show opponent preview" hint="Only when the room allows it" checked={s.showOpponentPreview} onChange={(v) => set({ showOpponentPreview: v })} />
        </section>
        <section className="space-y-3 sm:col-span-2">
          <h3 className="font-display text-lg">Cosmetics (level {level})</h3>
          <CosmeticPicker title="Brush cursor" list={CURSOR_SKINS} value={s.cursorSkin} level={level} onPick={(id) => set({ cursorSkin: id })} />
          <CosmeticPicker title="Avatar frame" list={AVATAR_FRAMES} value={s.avatarFrame} level={level} onPick={(id) => set({ avatarFrame: id })} />
          <CosmeticPicker title="Winner banner" list={BANNER_STYLES} value={s.bannerStyle} level={level} onPick={(id) => set({ bannerStyle: id })} />
          <CosmeticPicker title="Showdown effect" list={SHOWDOWN_EFFECTS} value={s.showdownEffect} level={level} onPick={(id) => set({ showdownEffect: id })} />
        </section>
        <section className="sm:col-span-2">
          <button
            type="button"
            className="btn-ghost w-full text-base"
            onClick={() => {
              onClose();
              useBugReport.getState().show();
            }}
          >
            🐞 Report a bug
          </button>
        </section>
      </div>
    </Modal>
  );
}

export function AccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { player, register, login, logout } = useSession();
  const [mode, setMode] = useState<'register' | 'login'>(player?.isGuest ? 'register' : 'login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'register') await register(username, password);
      else {
        await login(username, password);
        window.location.reload();
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  if (player && !player.isGuest) {
    return (
      <Modal open={open} onClose={onClose} title="Account">
        <p className="font-bold">
          Signed in as <span className="font-extrabold">{player.username}</span>.
        </p>
        <button type="button" className="btn-coral mt-4 w-full" onClick={() => void logout()}>
          Sign out
        </button>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={mode === 'register' ? 'Save your progress' : 'Sign in'}>
      <div className="mb-3 flex gap-2" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'register'} className={`chip min-h-[44px] px-4 ${mode === 'register' ? 'bg-sun' : 'bg-paperdim'}`} onClick={() => setMode('register')}>
          Create login
        </button>
        <button type="button" role="tab" aria-selected={mode === 'login'} className={`chip min-h-[44px] px-4 ${mode === 'login' ? 'bg-sun' : 'bg-paperdim'}`} onClick={() => setMode('login')}>
          I have an account
        </button>
      </div>
      <p className="mb-3 text-sm font-bold">
        {mode === 'register' ? 'Turn this guest into a permanent account. Your ranks, XP and history come with you.' : 'Signing in replaces this guest on this device.'}
      </p>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="acc-user" className="font-extrabold">
            Username
          </label>
          <input id="acc-user" className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} minLength={3} maxLength={20} required />
        </div>
        <div>
          <label htmlFor="acc-pass" className="font-extrabold">
            Password
          </label>
          <input id="acc-pass" className="input" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        </div>
        {error && (
          <p className="font-bold text-coral" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'register' ? 'Create login' : 'Sign in'}
        </button>
      </form>
    </Modal>
  );
}
