import { useEffect } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { unlockAudio } from './audio/sfx';
import { ConnectionOverlay, LiveAnnouncer, Toasts } from './components/Overlays';
import { MatchFlow } from './game/MatchFlow';
import { actions } from './net/actions';
import { connectSocket } from './net/socket';
import { Home } from './screens/Home';
import { LeaderboardScreen } from './screens/Leaderboard';
import { ProfileScreen } from './screens/Profile';
import { QueueScreen } from './screens/Queue';
import { RoomScreen } from './screens/Room';
import { useLobby } from './store/lobby';
import { useMatch } from './store/match';
import { useSession } from './store/session';
import { useSettings } from './store/settings';
import { useUi } from './store/ui';

function PartyInvite() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const connected = useUi((s) => s.conn === 'connected');
  useEffect(() => {
    if (!connected) return;
    void actions.joinParty(code).finally(() => navigate('/', { replace: true }));
  }, [code, navigate, connected]);
  return <main className="grid min-h-full place-items-center font-display text-2xl">Joining party…</main>;
}

function NotFound() {
  return (
    <main className="grid min-h-full place-items-center p-4">
      <div className="paper max-w-sm p-6 text-center">
        <h1 className="font-display text-3xl">Lost the plot?</h1>
        <p className="font-bold">That page doesn't exist.</p>
        <Link to="/" className="btn-primary mt-4">
          Home
        </Link>
      </div>
    </main>
  );
}

function Shell() {
  const matchId = useMatch((s) => s.matchId);
  const queue = useLobby((s) => s.queue);
  const inQueue = queue?.state === 'searching';
  return (
    <>
      {/* Lobby pages stay mounted (keeping their state) but hidden while a match is on screen. */}
      <div hidden={Boolean(matchId)} className="h-full">
      <Routes>
        <Route path="/" element={inQueue && queue ? <QueueScreen status={queue} /> : <Home />} />
        <Route path="/leaderboard" element={<LeaderboardScreen />} />
        <Route path="/profile/:id" element={<ProfileScreen />} />
        <Route path="/room/:code" element={<RoomScreen />} />
        <Route path="/party/:code" element={<PartyInvite />} />
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </div>
      {matchId && <MatchFlow />}
    </>
  );
}

export function App() {
  const { status, error, token, boot } = useSession();
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const highContrast = useSettings((s) => s.highContrast);

  useEffect(() => {
    void boot();
  }, [boot]);

  useEffect(() => {
    if (status === 'ready' && token) connectSocket(token);
  }, [status, token]);

  useEffect(() => {
    document.documentElement.classList.toggle('hc', highContrast);
    document.documentElement.classList.toggle('reduce-motion', reducedMotion);
  }, [highContrast, reducedMotion]);

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  return (
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'never'}>
      <BrowserRouter>
        {status === 'loading' && <div className="grid h-full place-items-center font-display text-3xl">Sharpening pencils…</div>}
        {status === 'error' && (
          <div className="grid h-full place-items-center p-4">
            <div className="paper max-w-sm p-6 text-center">
              <h1 className="font-display text-2xl">Can't reach the game server</h1>
              <p className="mt-2 font-bold">{error}</p>
              <button type="button" className="btn-primary mt-4" onClick={() => void boot()}>
                Retry
              </button>
            </div>
          </div>
        )}
        {status === 'ready' && <Shell />}
        <Toasts />
        <ConnectionOverlay />
        <LiveAnnouncer />
      </BrowserRouter>
    </MotionConfig>
  );
}
