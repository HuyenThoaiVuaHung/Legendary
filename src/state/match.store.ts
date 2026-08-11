import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import {
  MatchState,
  RoundDataMap,
  RoundKind,
  ROUND_KINDS,
} from '../contracts/game';
import { LogFn, LogLevel } from '../logger';
import {
  defaultMatchState,
  defaultRoundData,
  normalizeMatchState,
  normalizeRoundData,
} from './legacy.adapter';

/**
 * Typed accessor for one round's data. Handed out by MatchStore; the only
 * generic abstraction in the server (see PLAN: design rules).
 */
export interface RoundStore<K extends RoundKind> {
  get(): RoundDataMap[K];
  /** Mutate-and-persist: `update(d => { d.showResults = true; })`. */
  update(mutate: (data: RoundDataMap[K]) => void): RoundDataMap[K];
  set(data: RoundDataMap[K]): RoundDataMap[K];
}

/**
 * Single source of truth for persisted match data. Loads everything once,
 * serves reads from memory, and writes JSON through on every mutation —
 * replacing the old readFileSync-per-event pattern. Legacy-shaped files are
 * migrated to the canonical contracts on load via legacy.adapter.
 */
export class MatchStore {
  private match: MatchState;
  private readonly rounds: { [K in RoundKind]: RoundDataMap[K] };

  constructor(
    private readonly matchFilePath: string,
    private readonly log: LogFn,
  ) {
    this.match = this.loadMatchFile();
    this.rounds = Object.fromEntries(
      ROUND_KINDS.map((kind) => [kind, this.loadRoundFile(kind)]),
    ) as { [K in RoundKind]: RoundDataMap[K] };
  }

  // ------------------------------------------------------------ match state

  getMatch(): MatchState {
    return this.match;
  }

  updateMatch(mutate: (match: MatchState) => void): MatchState {
    mutate(this.match);
    this.persistMatch();
    return this.match;
  }

  setMatch(match: MatchState): MatchState {
    this.match = match;
    this.persistMatch();
    for (const kind of ROUND_KINDS) this.rounds[kind] = this.loadRoundFile(kind);
    return this.match;
  }

  // ------------------------------------------------------------- round data

  round<K extends RoundKind>(kind: K): RoundStore<K> {
    return {
      get: () => this.rounds[kind],
      update: (mutate) => {
        mutate(this.rounds[kind]);
        this.persistRound(kind);
        return this.rounds[kind];
      },
      set: (data) => {
        this.rounds[kind] = data;
        this.persistRound(kind);
        return this.rounds[kind];
      },
    };
  }

  // ------------------------------------------------------------ persistence

  private loadMatchFile(): MatchState {
    if (!existsSync(this.matchFilePath)) {
      this.log(`No match file at ${this.matchFilePath}; creating a fresh one.`, LogLevel.Warn);
      const fresh = defaultMatchState();
      this.writeJson(this.matchFilePath, fresh);
      return fresh;
    }
    const raw = JSON.parse(readFileSync(this.matchFilePath, 'utf8'));
    const { state, migrated } = normalizeMatchState(raw);
    if (migrated) {
      this.log(`Migrated legacy match file ${this.matchFilePath} to canonical format.`);
      this.writeJson(this.matchFilePath, state);
    }
    return state;
  }

  private loadRoundFile<K extends RoundKind>(kind: K): RoundDataMap[K] {
    const path = this.match.roundFiles[kind];
    if (!existsSync(path)) {
      this.log(`No ${kind} round file at ${path}; creating defaults.`, LogLevel.Warn);
      const fresh = defaultRoundData(kind);
      this.writeJson(path, fresh);
      return fresh;
    }
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    const { data, migrated } = normalizeRoundData(kind, raw);
    if (migrated) {
      this.log(`Migrated legacy ${kind} round file ${path} to canonical format.`);
      this.writeJson(path, data);
    }
    return data;
  }

  private persistMatch(): void {
    this.writeJson(this.matchFilePath, this.match);
  }

  private persistRound(kind: RoundKind): void {
    this.writeJson(this.match.roundFiles[kind], this.rounds[kind]);
  }

  private writeJson(path: string, value: unknown): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(value, null, 2));
  }
}
