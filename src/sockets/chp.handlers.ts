import { Role } from '../contracts/api';
import { PLAYER_COUNT } from '../game.rules';
import { NO_PLAYER } from '../state/game.state';
import { HandlerContext, isAdmin } from './context';

// Sound-effect identifiers understood by the frontend (protocol vocabulary,
// names kept from the old client). CHP reuses the KD buzz and VD verdict cues.
const SFX_GET_TURN = 'KD_GET_TURN';
const SFX_CORRECT = 'VD_CORRECT';
const SFX_WRONG = 'VD_WRONG';

/** Player index of the acting socket, or NO_PLAYER when it isn't a player. */
function resolvePlayerIndex(ctx: HandlerContext): number {
  if (ctx.identity.roleId === Role.Player && ctx.identity.index !== undefined) {
    return ctx.identity.index;
  }
  return ctx.session.playerIndexOf(ctx.socket.id);
}

export function registerChpHandlers(ctx: HandlerContext): void {
  const { io, socket, store, session, timer, rules } = ctx;
  const chp = store.round('chp');

  socket.on('broadcast-chp-question', (id: number) => {
    // A fresh question resets everyone's tiebreak attempt.
    const data = chp.update((d) => {
      d.playedPlayers = Array(PLAYER_COUNT).fill(false);
    });
    io.emit('update-chp-question', data.questions[id]);
  });

  socket.on('start-timer-chp', () => {
    timer.startMainClock(rules.chpTurnSeconds);
    io.emit('unlock-button-chp');
  });

  socket.on('get-turn-chp', () => {
    if (session.chpTurnPlayerIndex !== NO_PLAYER) return; // first buzz wins
    const playerIndex = resolvePlayerIndex(ctx);
    if (playerIndex === NO_PLAYER) return;
    if (chp.get().playedPlayers[playerIndex]) return; // one attempt each

    session.chpTurnPlayerIndex = playerIndex;
    io.emit('lock-button-chp');
    io.emit('play-sfx', SFX_GET_TURN);
    io.emit('got-turn-chp', playerIndex);
    timer.togglePause(); // hold the clock while the player answers
  });

  socket.on('mark-correct-chp', () => {
    if (!isAdmin(ctx)) return;
    const holder = session.chpTurnPlayerIndex;
    if (holder === NO_PLAYER) return;

    io.emit('play-sfx', SFX_CORRECT);
    const match = store.updateMatch((m) => {
      m.players[holder].score += rules.chpCorrectPoints;
    });
    io.emit('update-match-data', match);
    session.chpTurnPlayerIndex = NO_PLAYER;
    io.emit('clear-turn-chp');
  });

  socket.on('mark-wrong-chp', () => {
    if (!isAdmin(ctx)) return;
    const holder = session.chpTurnPlayerIndex;
    if (holder === NO_PLAYER) return;

    timer.togglePause(); // resume the clock for the remaining players
    io.emit('play-sfx', SFX_WRONG);
    io.emit('unlock-button-chp');
    chp.update((d) => {
      d.playedPlayers[holder] = true;
    });
    session.chpTurnPlayerIndex = NO_PLAYER;
    io.emit('clear-turn-chp');
  });

  socket.on('clear-question-chp', () => {
    io.emit('update-chp-question', {});
  });
}
