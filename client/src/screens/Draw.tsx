import { useCallback, useEffect, useMemo, useState } from 'react';
import { BRUSH_SIZES, TEAM_COLORS, basePalette, customColorAllowed, type TeamId } from '@ccc/shared';
import { sfx } from '../audio/sfx';
import { DrawCanvas, type Tool } from '../canvas/DrawCanvas';
import { TeamTag } from '../components/Badges';
import { TimerRing } from '../components/Timers';
import { useCountdown, useMediaQuery, useSecondMarks } from '../lib/hooks';
import { isFfa, scoreLine, sideName, sidesOf } from '../lib/sides';
import { getSocket } from '../net/socket';
import { useMatch } from '../store/match';
import { useSession } from '../store/session';
import { useSettings } from '../store/settings';
import { Palette } from './draw/Palette';
import { ReferenceThumb } from './draw/ReferenceThumb';
import { RelayBanner, TeammateCursors, TeammateList } from './draw/TeamPanels';
import { Toolbar } from './draw/Toolbar';

function TopBar({ msLeft, total }: { msLeft: number; total: number }) {
  const { round, score, suddenDeath, myTeam, rules } = useMatch();
  const sides = sidesOf(rules);
  const [a, b] = sides;
  return (
    <header className="flex items-center justify-between gap-2 px-2 pt-2">
      <div className="font-display text-lg leading-tight">
        Round {round}
        {suddenDeath && <span className="block text-sm text-coral">Sudden death!</span>}
      </div>
      {sides.length === 2 ? (
        <div className="flex items-center gap-2" aria-label={`Score: ${scoreLine(score, sides, myTeam)}`}>
          <TeamTag team={a} size="sm" label={myTeam === a ? 'You' : a} />
          <span className="font-display text-2xl">
            {score[a]} – {score[b]}
          </span>
          <TeamTag team={b} size="sm" label={myTeam === b ? 'You' : b} />
        </div>
      ) : (
        <div className="text-center font-display text-lg leading-tight" aria-label="Score">
          {scoreLine(score, sides, myTeam)}
          <span className="block text-xs text-sun">Free for all · first to {rules?.roundsToWin}</span>
        </div>
      )}
      <TimerRing msLeft={msLeft} totalMs={total} size={60} />
    </header>
  );
}

function SpectatorView() {
  const { rules, players } = useMatch();
  const sides = sidesOf(rules);
  return (
    <div className={`grid flex-1 gap-3 p-3 md:grid-cols-2 ${sides.length > 2 ? 'xl:grid-cols-3' : ''}`}>
      {sides.map((t) => (
        <div key={t} className="flex min-h-[260px] flex-col gap-2">
          <TeamTag team={t} label={sideName(t, rules, players, null)} />
          <div className="flex-1">
            <DrawCanvas team={t} playerId="spectator" canDraw={false} tool="brush" color="#000000" size={10} label={`${sideName(t, rules, players, null)} canvas`} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DrawScreen() {
  const me = useSession((s) => s.player?.id ?? '');
  const { rules, myTeam, spectator, phaseEndsAt, relay, players, photoUrl, photoMirrored, previews } = useMatch();
  const { cursorSkin, showOpponentPreview } = useSettings();
  const desktop = useMediaQuery('(min-width: 1024px)');
  const msLeft = useCountdown(phaseEndsAt, 100);
  const total = rules?.drawMs ?? 45000;

  const mePlayer = players.find((p) => p.id === me);
  const palette = useMemo(() => (mePlayer?.allowedColors ?? (rules ? basePalette(rules) : [])), [mePlayer?.allowedColors, rules]);
  const customAllowed = rules ? customColorAllowed(rules) : false;

  const [tool, setTool] = useState<Tool>('brush');
  const [size, setSize] = useState<number>(BRUSH_SIZES[1]);
  const [color, setColor] = useState<string>(palette[0] ?? '#000000');
  const [showRef, setShowRef] = useState(true);
  const [eyedropper, setEyedropper] = useState(false);

  useEffect(() => {
    if (palette.length && !palette.includes(color) && !customAllowed) setColor(palette[0]);
  }, [palette, color, customAllowed]);

  useSecondMarks(
    msLeft,
    [5, 4, 3, 2, 1],
    useCallback((m: number) => (m <= 2 ? sfx.finalTick() : sfx.tick()), []),
  );

  const teamRelay = myTeam ? relay[myTeam] : null;
  const myTurn = !rules?.relay || !teamRelay || teamRelay.activePlayerId === me;
  const canDraw = !spectator && !!myTeam && msLeft > 0 && myTurn;
  const thumbAllowed = Boolean(rules?.thumbnailVisible && photoUrl);
  const eyedropperAvailable = thumbAllowed && customAllowed;

  const undo = useCallback(() => getSocket()?.emit('draw:undo'), []);
  const redo = useCallback(() => getSocket()?.emit('draw:redo'), []);
  const clear = useCallback(() => {
    if (window.confirm('Clear all of your strokes this round?')) getSocket()?.emit('draw:clear');
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && k === 'y') {
        e.preventDefault();
        redo();
      } else if (k === 'b') setTool('brush');
      else if (k === 'f') setTool('fill');
      else if (k === 'e') setTool('eraser');
      else if (k === 't') setShowRef((v) => !v);
      else if (k === 'i' && eyedropperAvailable) setEyedropper((v) => !v);
      else if (k === '[' || k === ']') {
        const idx = BRUSH_SIZES.indexOf(size as (typeof BRUSH_SIZES)[number]);
        const next = BRUSH_SIZES[Math.max(0, Math.min(BRUSH_SIZES.length - 1, idx + (k === ']' ? 1 : -1)))];
        setSize(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, size, eyedropperAvailable]);

  if (!rules) return null;
  if (spectator || !myTeam) {
    return (
      <main className="flex min-h-full flex-col">
        <TopBar msLeft={msLeft} total={total} />
        <p className="text-center font-display text-xl">Spectating</p>
        <SpectatorView />
      </main>
    );
  }

  const teammates = players.filter((p) => p.team === myTeam).sort((a, b) => a.slot - b.slot);
  // Blurred peeks at everyone else's canvas (one opponent in team matches, several in a free-for-all).
  const opponentPreviews = rules.opponentPreview && showOpponentPreview
    ? sidesOf(rules)
        .filter((t) => t !== myTeam)
        .flatMap((t): Array<[TeamId, string]> => (previews[t] ? [[t, previews[t] as string]] : []))
    : [];
  const ffa = isFfa(rules);

  const toolbar = (
    <Toolbar
      tool={tool}
      setTool={setTool}
      size={size}
      setSize={setSize}
      color={color}
      onUndo={undo}
      onRedo={redo}
      onClear={clear}
      eyedropperAvailable={eyedropperAvailable}
      eyedropper={eyedropper}
      setEyedropper={setEyedropper}
      disabled={!canDraw}
      vertical={desktop}
    />
  );
  const paletteEl = <Palette colors={palette} color={color} setColor={setColor} customAllowed={customAllowed} disabled={!canDraw} vertical={desktop} />;

  return (
    <main className="flex h-full min-h-0 flex-col">
      <TopBar msLeft={msLeft} total={total} />
      <div className="flex flex-wrap items-center justify-center gap-2 px-2 py-1">
        {rules.relay && teamRelay && <RelayBanner relay={teamRelay} meId={me} players={players} />}
        {thumbAllowed && !showRef && (
          <button type="button" className="btn-ghost !min-h-[40px] text-sm" onClick={() => setShowRef(true)}>
            🖼️ Show reference (T)
          </button>
        )}
        {!rules.thumbnailVisible && <span className="chip bg-grape text-paper">🧠 Memory mode: no reference</span>}
      </div>

      <div className={`flex min-h-0 flex-1 gap-3 p-2 ${desktop ? 'flex-row' : 'flex-col'}`}>
        {desktop && <aside className="flex w-[124px] shrink-0 flex-col gap-3 overflow-y-auto">{toolbar}</aside>}
        <section className="relative min-h-[240px] flex-1" aria-label="Your team canvas">
          <DrawCanvas
            team={myTeam}
            playerId={me}
            canDraw={canDraw}
            tool={tool}
            color={color}
            size={size}
            label={ffa ? 'Your canvas' : `Shared canvas for ${TEAM_COLORS[myTeam].name}`}
            overlay={<TeammateCursors meId={me} skin={cursorSkin} />}
          />
        </section>
        {desktop ? (
          <aside className="flex w-[220px] shrink-0 flex-col gap-3 overflow-y-auto">
            {paletteEl}
            {!ffa && <TeammateList players={teammates} meId={me} relay={teamRelay} />}
            {opponentPreviews.map(([t, src]) => (
              <div key={t} className="paper p-2">
                <p className="mb-1 truncate font-display text-sm">{ffa ? `${sideName(t, rules, players, myTeam)}'s progress` : 'Opponent progress'}</p>
                <img src={src} alt={`Blurred preview of ${sideName(t, rules, players, myTeam)}'s canvas`} className="aspect-[4/3] w-full rounded-lg border-2 border-ink blur-[3px]" />
              </div>
            ))}
          </aside>
        ) : (
          <div className="shrink-0 space-y-2 pb-[env(safe-area-inset-bottom)]">
            {paletteEl}
            {toolbar}
            <div className="flex items-center gap-2">
              {!ffa && (
                <div className="flex-1">
                  <TeammateList players={teammates} meId={me} relay={teamRelay} />
                </div>
              )}
              {opponentPreviews.map(([t, src]) => (
                <img key={t} src={src} alt={`Blurred preview of ${sideName(t, rules, players, myTeam)}'s canvas`} className="h-16 rounded-lg border-2 blur-[2px]" style={{ borderColor: TEAM_COLORS[t].main }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {thumbAllowed && showRef && photoUrl && (
        <ReferenceThumb
          url={photoUrl}
          mirrored={photoMirrored}
          eyedropper={eyedropper}
          onPick={(hex) => {
            setColor(hex);
            setEyedropper(false);
            setTool('brush');
            sfx.pop();
          }}
          onClose={() => setShowRef(false)}
        />
      )}
    </main>
  );
}
