import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  GAME_MODES,
  MODE_PRESETS,
  TEAM_SIZE_COUNT,
  TEAM_SIZES,
  defaultRoomSettings,
  type GameMode,
  type LeaderboardEntry,
  type TeamSize,
} from '@ccc/shared';
import { sfx, unlockAudio } from '../audio/sfx';
import { Avatar, Logo, RankBadge } from '../components/Badges';
import { HowToPlay } from '../components/Decor';
import { AccountDialog, SettingsDialog } from '../components/Dialogs';
import { ChatBox, EmoteBar } from '../components/Social';
import { actions } from '../net/actions';
import { api } from '../net/api';
import { useLobby } from '../store/lobby';
import { useSession } from '../store/session';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';

function NameEditor() {
  const player = useSession((s) => s.player);
  const rename = useSession((s) => s.rename);
  const [name, setName] = useState(player?.name ?? '');
  const [error, setError] = useState('');
  useEffect(() => setName(player?.name ?? ''), [player?.name]);
  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!player || name.trim() === player.name) return;
    try {
      await rename(name.trim());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename');
      setName(player.name);
    }
  };
  return (
    <form onSubmit={save} className="w-full">
      <label htmlFor="display-name" className="mb-1 block font-display text-sm text-ink">
        Your name
      </label>
      <input id="display-name" className="input text-lg" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} onBlur={() => void save()} autoComplete="nickname" />
      {error && (
        <p className="mt-1 text-sm font-bold text-coral" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function ModeCard({ mode, selected, disabled, onSelect }: { mode: GameMode; selected: boolean; disabled: boolean; onSelect: () => void }) {
  const p = MODE_PRESETS[mode];
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`min-h-[44px] rounded-2xl border-3 border-ink p-2 text-left shadow-chunky-sm transition disabled:opacity-40 ${selected ? 'bg-sun' : 'bg-paper hover:bg-paperdim'}`}
    >
      <div className="font-display leading-tight">{p.label}</div>
      <div className="text-[11px] font-bold leading-tight text-ink/80">{disabled ? 'Needs 2v2 or 3v3' : p.blurb}</div>
    </button>
  );
}

function PartyPanel() {
  const party = useLobby((s) => s.party);
  const chat = useLobby((s) => s.chat);
  const me = useSession((s) => s.player?.id);
  const [code, setCode] = useState('');
  const toast = useUi((s) => s.toast);

  const invite = party ? `${window.location.origin}/party/${party.code}` : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite);
      toast({ kind: 'info', code: 'copied', message: 'Invite link copied!' }, 2500);
    } catch {
      toast({ kind: 'info', code: 'copied', message: invite }, 8000);
    }
  };

  if (!party) {
    return (
      <section className="paper p-4">
        <h2 className="font-display text-xl">Party up</h2>
        <p className="text-sm font-bold">Queue with friends as a premade team.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-volt" onClick={() => void actions.createParty()}>
            Create party
          </button>
          <form
            className="flex flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim().length === 6) void actions.joinParty(code.trim());
            }}
          >
            <label htmlFor="party-code" className="sr-only">
              Party code
            </label>
            <input id="party-code" className="input uppercase" placeholder="CODE" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            <button type="submit" className="btn-ghost">
              Join
            </button>
          </form>
        </div>
      </section>
    );
  }

  return (
    <section className="paper space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-xl">
          Party <span className="rounded-lg bg-ink px-2 text-sun">{party.code}</span>
        </h2>
        <button type="button" className="btn-ghost !min-h-[40px] !px-3 text-sm" onClick={() => void actions.leaveParty()}>
          Leave
        </button>
      </div>
      <ul className="space-y-1">
        {party.members.map((m) => (
          <li key={m.id} className="flex items-center gap-2 font-extrabold">
            <span className={`h-3 w-3 rounded-full border-2 border-ink ${m.online ? 'bg-mint' : 'bg-muted'}`} aria-label={m.online ? 'online' : 'offline'} />
            {m.name} <span className="text-xs font-bold text-muted">Lv {m.level}</span>
            {m.id === party.leaderId && <span className="chip bg-sun">Leader</span>}
          </li>
        ))}
      </ul>
      <button type="button" className="btn-ghost w-full text-sm" onClick={() => void copy()}>
        📋 Copy invite link
      </button>
      {party.leaderId !== me && <p className="text-sm font-bold">The leader picks the mode and starts the queue.</p>}
      <EmoteBar />
      <div className="h-48">
        <ChatBox messages={chat} channel="party" />
      </div>
    </section>
  );
}

function RoomsPanel() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const roomList = useLobby((s) => s.roomList);
  const setLobby = useLobby((s) => s.set);

  useEffect(() => {
    const load = async () => {
      const list = await actions.listRooms();
      if (list) setLobby({ roomList: list });
    };
    const t = setTimeout(() => void load(), 600);
    const id = setInterval(() => void load(), 10_000);
    return () => {
      clearTimeout(t);
      clearInterval(id);
    };
  }, [setLobby]);

  const create = async (format: 'teams' | 'ffa' = 'teams') => {
    const settings = defaultRoomSettings('classic', format === 'ffa' ? '1v1' : '2v2');
    const room = await actions.createRoom({ ...settings, format });
    if (room) navigate(`/room/${room.code}`);
  };

  return (
    <section className="paper p-4">
      <h2 className="font-display text-xl">Custom rooms</h2>
      <p className="text-sm font-bold">Your rules, pick your team, or everyone for themselves. Spectators welcome.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-coral" onClick={() => void create('teams')}>
          Team battle
        </button>
        <button type="button" className="btn-volt" onClick={() => void create('ffa')}>
          Free for all
        </button>
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim().length === 6) navigate(`/room/${code.trim()}`);
          }}
        >
          <label htmlFor="room-code" className="sr-only">
            Room code
          </label>
          <input id="room-code" className="input uppercase" placeholder="ROOM" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <button type="submit" className="btn-ghost">
            Go
          </button>
        </form>
      </div>
      {roomList.length > 0 && (
        <ul className="mt-3 space-y-1">
          {roomList.map((r) => (
            <li key={r.code}>
              <Link to={`/room/${r.code}`} className="flex min-h-[44px] items-center justify-between rounded-xl border-2 border-ink bg-paperdim px-3 font-extrabold hover:bg-sun">
                <span>
                  {r.hostName}'s room · {MODE_PRESETS[r.mode].label} {r.format === 'ffa' ? 'free for all' : r.teamSize}
                </span>
                <span className="text-sm">
                  {r.players}/{r.capacity} {r.inMatch ? '· live' : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LeaderboardPreview({ bucket }: { bucket: TeamSize }) {
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  useEffect(() => {
    api
      .leaderboard(bucket, 'all', '')
      .then((r) => setRows(r.entries.slice(0, 5)))
      .catch(() => setRows([]));
  }, [bucket]);
  return (
    <section className="paper p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl">Top {bucket}</h2>
        <Link to="/leaderboard" className="font-extrabold underline">
          See all
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm font-bold text-muted">No ranked matches yet. Be the first!</p>
      ) : (
        <ol className="mt-2 space-y-1">
          {rows.map((r) => (
            <li key={r.playerId} className="flex items-center justify-between gap-2 font-extrabold">
              <Link to={`/profile/${r.playerId}`} className="truncate hover:underline">
                {r.position}. {r.name}
              </Link>
              <RankBadge rank={r.rank} compact />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function Home() {
  const player = useSession((s) => s.player);
  const stats = useLobby((s) => s.stats);
  const party = useLobby((s) => s.party);
  const frame = useSettings((s) => s.avatarFrame);
  const [teamSize, setTeamSize] = useState<TeamSize>('1v1');
  const [ranked, setRanked] = useState(true);
  const [mode, setMode] = useState<GameMode>('classic');
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const navigate = useNavigate();

  const partySize = party?.members.length ?? 1;
  const isLeader = !party || party.leaderId === player?.id;
  const effectiveMode = ranked ? 'classic' : mode;
  const modeInvalid = MODE_PRESETS[effectiveMode].teamOnly && TEAM_SIZE_COUNT[teamSize] === 1;
  const tooBig = partySize > TEAM_SIZE_COUNT[teamSize];

  useEffect(() => {
    if (partySize > TEAM_SIZE_COUNT[teamSize]) setTeamSize(partySize === 2 ? '2v2' : '3v3');
  }, [partySize, teamSize]);

  if (!player) return null;
  const rating = player.ratings[teamSize];
  const banned = player.queueBanUntil && player.queueBanUntil > Date.now();

  /** Private 1v1 room with a QR invite: the quickest way to play someone next to you. */
  const playFriend = async () => {
    unlockAudio();
    sfx.click();
    setBusy(true);
    const room = await actions.createRoom({ ...defaultRoomSettings('classic', '1v1'), roundsToWin: 3, isPrivate: true });
    setBusy(false);
    if (room) navigate(`/room/${room.code}`);
  };

  const play = async () => {
    unlockAudio();
    sfx.click();
    setBusy(true);
    await actions.joinQueue(teamSize, effectiveMode, ranked);
    setBusy(false);
  };

  return (
    <main className="mx-auto max-w-6xl px-3 pb-12 pt-4 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Logo size="md" />
        <nav className="flex flex-wrap items-center gap-2" aria-label="Main">
          <Link to="/leaderboard" className="btn-dark text-base">
            🏆 <span className="hidden sm:inline">Leaderboard</span>
          </Link>
          <Link to={`/profile/${player.id}`} className="btn-dark text-base">
            👤 <span className="hidden sm:inline">Profile</span>
          </Link>
          <button type="button" className="btn-dark text-base" onClick={() => setAccountOpen(true)}>
            {player.isGuest ? '💾' : '🔑'} <span className="hidden sm:inline">{player.isGuest ? 'Save account' : 'Account'}</span>
          </button>
          <button type="button" className="btn-dark text-base" onClick={() => setSettingsOpen(true)} aria-label="Settings">
            ⚙️
          </button>
        </nav>
      </header>

      {stats?.aiDegraded && (
        <p className="mt-3 rounded-2xl border-3 border-ink bg-sun px-4 py-2 font-extrabold text-ink" role="status">
          🤖 The AI judge is taking a break — rounds are scored by the pixel judge and marked “estimated”.
        </p>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="min-w-0 space-y-5">
          <motion.section className="paper space-y-4 p-5" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
            <div className="flex flex-wrap items-center gap-4">
              <Avatar name={player.name} color="#ffd23f" frame={frame} size={56} />
              <div className="min-w-[180px] flex-1">
                <NameEditor />
              </div>
              <div className="flex items-center gap-4">
                <RankBadge rank={rating.rank} elo={rating.elo} />
                <div className="text-center" title="Daily streak">
                  <div className="text-2xl" aria-hidden>
                    🔥
                  </div>
                  <div className="font-display text-sm">{player.dailyStreak} day{player.dailyStreak === 1 ? '' : 's'}</div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm font-extrabold">
              <span>Level {player.level}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full border-2 border-ink bg-paperdim" aria-label={`XP ${player.xpIntoLevel} of ${player.xpForNextLevel}`}>
                <div className="h-full bg-mint" style={{ width: `${(player.xpIntoLevel / player.xpForNextLevel) * 100}%` }} />
              </div>
              <span>{player.winStreak > 1 ? `⚡ ${player.winStreak} win streak` : ''}</span>
            </div>

            <fieldset>
              <legend className="mb-2 font-display text-lg">Team size</legend>
              <div className="grid grid-cols-3 gap-2">
                {TEAM_SIZES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTeamSize(t)}
                    aria-pressed={teamSize === t}
                    disabled={partySize > TEAM_SIZE_COUNT[t]}
                    className={`min-h-[64px] rounded-2xl border-3 border-ink font-display text-2xl shadow-chunky-sm disabled:opacity-40 ${teamSize === t ? 'bg-coral text-paper' : 'bg-paperdim'}`}
                  >
                    {t}
                    <span className="block text-xs font-body font-extrabold">{stats ? `${stats.queues[t]} searching` : '…'}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 font-display text-lg">Queue</legend>
              <div className="mb-2 flex gap-2">
                <button type="button" className={`chip min-h-[44px] px-4 text-sm ${ranked ? 'bg-sun' : 'bg-paperdim'}`} aria-pressed={ranked} onClick={() => setRanked(true)}>
                  🏅 Ranked (Classic)
                </button>
                <button type="button" className={`chip min-h-[44px] px-4 text-sm ${!ranked ? 'bg-sun' : 'bg-paperdim'}`} aria-pressed={!ranked} onClick={() => setRanked(false)}>
                  🎲 Casual
                </button>
              </div>
              {!ranked && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {GAME_MODES.map((m) => (
                    <ModeCard key={m} mode={m} selected={mode === m} disabled={MODE_PRESETS[m].teamOnly && TEAM_SIZE_COUNT[teamSize] === 1} onSelect={() => setMode(m)} />
                  ))}
                </div>
              )}
            </fieldset>

            <motion.button
              type="button"
              className="btn-primary w-full py-4 text-4xl"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              disabled={busy || !isLeader || modeInvalid || tooBig || Boolean(banned)}
              onClick={() => void play()}
            >
              {banned ? 'Queue paused' : !isLeader ? 'Waiting for leader' : 'PLAY'}
            </motion.button>
            <button type="button" className="btn-coral w-full text-xl" disabled={busy} onClick={() => void playFriend()}>
              📱 1v1 a friend
              <span className="font-body text-xs font-extrabold opacity-90">same Wi-Fi or invite link</span>
            </button>
            <p className="text-center text-sm font-bold">
              {stats ? `${stats.online} online · ${stats.inMatch} in matches` : 'Connecting…'}
              {party && isLeader ? ` · queueing as a party of ${partySize}` : ''}
            </p>
          </motion.section>
          <HowToPlay />
        </div>

        <div className="min-w-0 space-y-5">
          <PartyPanel />
          <RoomsPanel />
          <LeaderboardPreview bucket={teamSize} />
        </div>
      </div>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AccountDialog open={accountOpen} onClose={() => setAccountOpen(false)} />
    </main>
  );
}
