/**
 * REST API data-transfer contracts, shared verbatim with the Legion frontend
 * (mirrored at Legion/src/app/core/contracts/api.ts — keep in sync).
 */
import { MatchPosition, Player, RoundKind } from './game';

/** 0: player, 1: admin, 2: mc, 3: viewer. */
export enum Role {
  Player = 0,
  Admin = 1,
  Mc = 2,
  Viewer = 3,
}

export interface LoginRequest {
  /** Omitted or unknown secret yields a viewer token — login never fails. */
  secret?: string;
}

export interface LoginResponse {
  token: string;
  roleId: Role;
  /** Player index (0-based); present only when roleId is Role.Player. */
  index?: number;
}

export interface TokenPayload {
  roleId: Role;
  index?: number;
}

export interface UpdateMatchPositionRequest {
  position: MatchPosition;
}

export interface UpdatePlayerRequest {
  player: Player;
}

export interface UpdateKdControlRequest {
  gamemode?: 'S' | 'M';
  activePlayerIndex?: number;
}

export interface MediaUploadResponse {
  fileName: string;
  /** Same-origin URL, e.g. `/media/tt/abc123-photo.png`. */
  url: string;
}

export interface LegionImportResponse {
  matchName: string;
  /** Media files extracted from the archive, per round kind. */
  mediaCounts: Partial<Record<RoundKind | 'misc', number>>;
}

export interface ApiError {
  error: string;
}

/** Multipart field name used by all upload endpoints. */
export const UPLOAD_FIELD = 'file';

export const API_PATHS = {
  login: '/api/auth/login',
  match: '/api/match',
  matchPosition: '/api/match/position',
  matchPlayer: (index: number) => `/api/match/players/${index}`,
  round: (kind: RoundKind) => `/api/rounds/${kind}`,
  media: (kind: RoundKind | 'misc') => `/api/media/${kind}`,
  mediaFile: (kind: RoundKind | 'misc', name: string) =>
    `/media/${kind}/${encodeURIComponent(name)}`,
  importLegion: '/api/match/import-legion',
  exportLegion: '/api/match/export-legion',
} as const;
