import { AnimatePresence, motion } from 'framer-motion';
import { useMatch } from '../store/match';
import { DrawScreen } from '../screens/Draw';
import { MatchFoundScreen, TeamIntroScreen } from '../screens/Intro';
import { JudgingScreen } from '../screens/Judging';
import { PeekScreen } from '../screens/Peek';
import { ResultScreen } from '../screens/Result';
import { ShowdownScreen } from '../screens/Showdown';
import { EmoteFloats } from '../components/Social';

/** Server-driven screen switcher: the match phase decides what is shown. */
export function MatchFlow() {
  const phase = useMatch((s) => s.phase);
  const emotes = useMatch((s) => s.emotes);
  const players = useMatch((s) => s.players);
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'Player';

  const screen = (() => {
    switch (phase) {
      case 'MATCH_FOUND':
        return <MatchFoundScreen />;
      case 'TEAM_INTRO':
        return <TeamIntroScreen />;
      case 'PEEK':
        return <PeekScreen />;
      case 'DRAW':
        return <DrawScreen />;
      case 'SCORING':
        return <JudgingScreen />;
      case 'SHOWDOWN':
        return <ShowdownScreen />;
      case 'MATCH_RESULT':
        return <ResultScreen />;
      default:
        return null;
    }
  })();

  return (
    <div className="fixed inset-0 z-20 overflow-y-auto">
      <AnimatePresence mode="wait">
        <motion.div key={phase ?? 'none'} className={phase === 'DRAW' ? 'h-full' : 'min-h-full'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          {screen}
        </motion.div>
      </AnimatePresence>
      {phase !== 'SHOWDOWN' && phase !== 'MATCH_RESULT' && phase !== 'DRAW' && <EmoteFloats emotes={emotes} nameOf={nameOf} />}
    </div>
  );
}
