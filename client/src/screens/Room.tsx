import { useEffect, useState, type ChangeEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  DIFFICULTIES,
  GAME_MODES,
  MODE_PRESETS,
  PHOTO_CATEGORIES,
  PHOTO_THEMES,
  THEME_LABELS,
  ROUNDS_TO_WIN_MAX,
  ROUNDS_TO_WIN_MIN,
  TEAM_SIZE_COUNT,
  TEAM_SIZES,
  defaultRoomSettings,
  type RoomSettings,
  type TeamId,
} from '@ccc/shared';
import { TeamTag } from '../components/Badges';
import { InvitePanel } from '../components/InvitePanel';
import { ChatBox } from '../components/Social';
import { actions } from '../net/actions';
import { api } from '../net/api';
import { useLobby } from '../store/lobby';
import { useSession } from '../store/session';
import { useUi } from '../store/ui';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-extrabold">{label}</span>
      {children}
    </label>
  );
}

function Check({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`flex min-h-[44px] items-center gap-2 font-extrabold ${disabled ? 'opacity-60' : ''}`}>
      <input type="checkbox" className="h-5 w-5 accent-coral" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function SettingsForm({ settings, isHost }: { settings: RoomSettings; isHost: boolean }) {
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);
  const multi = TEAM_SIZE_COUNT[draft.teamSize] > 1;

  const commit = (patch: Partial<RoomSettings>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (isHost) void actions.updateRoom(next);
  };
  const applyMode = (mode: RoomSettings['mode']) => {
    const d = defaultRoomSettings(mode, draft.teamSize);
    commit({ ...d, themes: draft.themes, categories: draft.categories, allowSpectators: draft.allowSpectators, isPrivate: draft.isPrivate, useUploadedPhotos: draft.useUploadedPhotos, roundsToWin: draft.roundsToWin });
  };
  const toggleIn = <T extends string>(list: T[], item: T): T[] => (list.includes(item) ? (list.length > 1 ? list.filter((x) => x !== item) : list) : [...list, item]);
  const num = (e: ChangeEvent<HTMLInputElement>) => Number(e.target.value);
  const dis = !isHost;

  return (
    <fieldset className="paper grid gap-3 p-4 sm:grid-cols-2" disabled={dis} aria-label="Room settings">
      <legend className="sr-only">Room settings</legend>
      <h2 className="font-display text-xl sm:col-span-2">Rules {dis && <span className="text-sm">(host only)</span>}</h2>
      <Field label="Mode preset">
        <select className="input" value={draft.mode} onChange={(e) => applyMode(e.target.value as RoomSettings['mode'])}>
          {GAME_MODES.map((m) => (
            <option key={m} value={m} disabled={MODE_PRESETS[m].teamOnly && !multi}>
              {MODE_PRESETS[m].label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Team size">
        <select className="input" value={draft.teamSize} onChange={(e) => commit({ teamSize: e.target.value as RoomSettings['teamSize'] })}>
          {TEAM_SIZES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label={`Rounds to win: ${draft.roundsToWin}`}>
        <input type="range" className="w-full accent-coral" min={ROUNDS_TO_WIN_MIN} max={ROUNDS_TO_WIN_MAX} value={draft.roundsToWin} onChange={(e) => commit({ roundsToWin: num(e) })} />
      </Field>
      <Field label={`Peek time: ${draft.peekSec}s`}>
        <input type="range" className="w-full accent-coral" min={3} max={10} value={draft.peekSec} onChange={(e) => commit({ peekSec: num(e) })} />
      </Field>
      <Field label={`Draw time: ${draft.drawSec}s`}>
        <input type="range" className="w-full accent-coral" min={20} max={90} step={5} value={draft.drawSec} onChange={(e) => commit({ drawSec: num(e) })} />
      </Field>
      <Field label={`Relay turn: ${draft.relayTurnSec}s`}>
        <input type="range" className="w-full accent-coral" min={10} max={30} value={draft.relayTurnSec} disabled={dis || !draft.relay} onChange={(e) => commit({ relayTurnSec: num(e) })} />
      </Field>
      <div className="sm:col-span-2">
        <span className="font-extrabold">Picture style</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {PHOTO_THEMES.map((t) => (
            <button key={t} type="button" className={`chip min-h-[40px] px-3 ${draft.themes.includes(t) ? 'bg-sun' : 'bg-paperdim'}`} aria-pressed={draft.themes.includes(t)} onClick={() => commit({ themes: toggleIn(draft.themes, t) })}>
              {THEME_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
      <div className="sm:col-span-2">
        <span className="font-extrabold">Categories</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {PHOTO_CATEGORIES.map((c) => (
            <button key={c} type="button" className={`chip min-h-[40px] px-3 capitalize ${draft.categories.includes(c) ? 'bg-sun' : 'bg-paperdim'}`} aria-pressed={draft.categories.includes(c)} onClick={() => commit({ categories: toggleIn(draft.categories, c) })}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="sm:col-span-2">
        <span className="font-extrabold">Difficulty</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {DIFFICULTIES.map((d) => (
            <button key={d} type="button" className={`chip min-h-[40px] px-3 capitalize ${draft.difficulties.includes(d) ? 'bg-sun' : 'bg-paperdim'}`} aria-pressed={draft.difficulties.includes(d)} onClick={() => commit({ difficulties: toggleIn(draft.difficulties, d) })}>
              {d}
            </button>
          ))}
        </div>
      </div>
      <Check label="Photo stays visible" checked={draft.thumbnailVisible && !draft.memory} disabled={dis || draft.memory} onChange={(v) => commit({ thumbnailVisible: v })} />
      <Check label="Memory mode" checked={draft.memory} disabled={dis} onChange={(v) => commit({ memory: v, thumbnailVisible: !v })} />
      <Check label="Relay turns" checked={draft.relay} disabled={dis || !multi} onChange={(v) => commit({ relay: v })} />
      <Check label="Color Lock" checked={draft.colorLock} disabled={dis || !multi} onChange={(v) => commit({ colorLock: v })} />
      <Check label="Mirror Match" checked={draft.mirror} disabled={dis} onChange={(v) => commit({ mirror: v })} />
      <Check label="Limited palette (6)" checked={draft.limitedPalette} disabled={dis} onChange={(v) => commit({ limitedPalette: v })} />
      <Check label="Opponent preview (blurred)" checked={draft.opponentPreview} disabled={dis} onChange={(v) => commit({ opponentPreview: v })} />
      <Check label="Allow spectators" checked={draft.allowSpectators} disabled={dis} onChange={(v) => commit({ allowSpectators: v })} />
      <Check label="Private (hidden from list)" checked={draft.isPrivate} disabled={dis} onChange={(v) => commit({ isPrivate: v })} />
      <Check label="Use uploaded photos" checked={draft.useUploadedPhotos} disabled={dis} onChange={(v) => commit({ useUploadedPhotos: v })} />
    </fieldset>
  );
}

function UploadBox({ code, count }: { code: string; count: number }) {
  const [busy, setBusy] = useState(false);
  const toast = useUi((s) => s.toast);
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast({ kind: 'error', code: 'upload', message: 'Image must be 5MB or smaller' });
    setBusy(true);
    try {
      await api.uploadRoomPhoto(code, file, file.name.replace(/\.[^.]+$/, '').slice(0, 60));
      toast({ kind: 'info', code: 'upload', message: 'Photo added!' }, 2500);
    } catch (err) {
      toast({ kind: 'error', code: 'upload', message: err instanceof Error ? err.message : 'Upload failed' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="paper p-4">
      <h2 className="font-display text-xl">Your photos ({count})</h2>
      <p className="text-sm font-bold">JPEG, PNG or WebP up to 5MB. Only use photos you have the rights to, with no identifiable people.</p>
      <label className="btn-ghost mt-2 cursor-pointer">
        {busy ? 'Uploading…' : '⬆️ Upload photo'}
        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void onFile(e)} disabled={busy} />
      </label>
    </div>
  );
}

export function RoomScreen() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const room = useLobby((s) => s.room);
  const chat = useLobby((s) => s.chat);
  const me = useSession((s) => s.player?.id);
  const [error, setError] = useState('');
  const connected = useUi((s) => s.conn === 'connected');

  useEffect(() => {
    // Direct links load before the socket is up; join once connected.
    if (!connected || room?.code === code.toUpperCase()) return;
    void actions.joinRoom(code).then((r) => {
      if (!r) setError('Could not join that room.');
    });
    // Join once per code/connection; room updates arrive by socket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, connected]);

  if (error) {
    return (
      <main className="grid min-h-full place-items-center p-4">
        <div className="paper max-w-sm p-6 text-center">
          <h1 className="font-display text-2xl">Room unavailable</h1>
          <p className="font-bold">{error}</p>
          <Link to="/" className="btn-primary mt-4">
            Back home
          </Link>
        </div>
      </main>
    );
  }
  if (!room) return <main className="grid min-h-full place-items-center font-display text-2xl">Joining room…</main>;

  const isHost = room.hostId === me;
  const cap = TEAM_SIZE_COUNT[room.settings.teamSize];
  const leave = async () => {
    await actions.leaveRoom();
    navigate('/');
  };
  const copy = () => void navigator.clipboard?.writeText(`${window.location.origin}/room/${room.code}`);

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-3 py-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-3xl">
          Room <span className="rounded-lg bg-ink px-2 text-sun">{room.code}</span>
        </h1>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost text-base" onClick={copy}>
            📋 Invite link
          </button>
          <button type="button" className="btn-dark text-base" onClick={() => void leave()}>
            Leave
          </button>
        </div>
      </header>
      {room.matchId && <p className="rounded-2xl border-3 border-ink bg-mint px-4 py-2 font-extrabold text-ink">A match is in progress in this room.</p>}
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="order-2 min-w-0 space-y-4 lg:order-1">
          <div className="grid gap-3 sm:grid-cols-2">
            {(['A', 'B'] as TeamId[]).map((t) => (
              <section key={t} className="paper space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <TeamTag team={t} />
                  <span className="font-extrabold">
                    {room.teams[t].length}/{cap}
                  </span>
                </div>
                <ul className="space-y-1">
                  {room.teams[t].map((m) => (
                    <li key={m.id} className="flex items-center gap-2 font-extrabold">
                      <span className={`h-3 w-3 rounded-full border-2 border-ink ${m.online ? 'bg-mint' : 'bg-muted'}`} />
                      {m.name} {m.id === room.hostId && <span className="chip bg-sun">Host</span>}
                    </li>
                  ))}
                </ul>
                <button type="button" className="btn-ghost w-full text-base" disabled={!!room.matchId || room.teams[t].some((m) => m.id === me) || room.teams[t].length >= cap} onClick={() => void actions.setRoomTeam(t)}>
                  Join {t}
                </button>
              </section>
            ))}
          </div>
          <section className="paper p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl">Spectators ({room.spectators.length})</h2>
              <button type="button" className="btn-ghost !min-h-[40px] text-sm" disabled={!room.settings.allowSpectators || !!room.matchId} onClick={() => void actions.setRoomTeam('spectator')}>
                Spectate
              </button>
            </div>
            <p className="font-bold">{room.spectators.map((s) => s.name).join(', ') || 'Nobody yet.'}</p>
          </section>
          <SettingsForm settings={room.settings} isHost={isHost} />
        </div>
        <div className="order-1 min-w-0 space-y-4 lg:order-2">
          {!room.matchId && room.teams.A.length + room.teams.B.length < cap * 2 && <InvitePanel code={room.code} />}
          {isHost && (
            <button type="button" className="btn-primary w-full py-4 text-3xl" disabled={!!room.matchId} onClick={() => void actions.startRoom()}>
              START MATCH
            </button>
          )}
          {!isHost && <p className="paper p-4 text-center font-display text-lg">Waiting for the host to start…</p>}
          {isHost && <UploadBox code={room.code} count={room.uploadedPhotos} />}
          <div className="h-72">
            <ChatBox messages={chat} channel="room" />
          </div>
        </div>
      </div>
    </main>
  );
}
