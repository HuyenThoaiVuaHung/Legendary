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
  /** Room the token is valid in; absent means the default room. */
  roomId?: string;
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

/** Per-room shared secrets; players additionally identify by username. */
export interface RoomSecrets {
  admin: string;
  mc: string;
  player: string;
  spectator: string;
}

export type SpectatorMode = 'open' | 'secret' | 'off';
export type LinkRole = 'viewer' | 'mc' | 'player';
export interface RoomLink {
  id: string;
  role: LinkRole;
  view?: string;
  label: string;
  createdAt: number;
  expiresAt?: number;
  singleUse: boolean;
  usedAt?: number;
}
export interface CreateRoomLinkRequest {
  role: LinkRole;
  view?: string;
  label: string;
  expiresInSeconds?: number;
  singleUse?: boolean;
}
export interface CreateRoomLinkResponse { link: RoomLink; token: string; path: string }
export type ListRoomLinksResponse = RoomLink[];
export interface JoinLinkRequest { token: string; username?: string }
export type JoinLinkResponse = JoinRoomResponse;
export interface RoomSettingsRequest { spectatorMode: SpectatorMode }
export type RoomSettingsResponse = RoomSettingsRequest;
export interface ServerInfo { multiRoom: boolean; version: string }
export type SessionResponse = TokenPayload;

/** Current created room details; secrets are visible only to admins. */
export interface RoomInfo {
  roomId: string;
  code: string;
  expiresAt: number | null;
  seats: (string | null)[];
  spectatorMode: SpectatorMode;
  ownerAccountId: string;
  mediaBytes: number;
  mediaQuotaBytes: number;
  secrets?: RoomSecrets;
}

/** POST /api/rooms — the creator receives the secrets and an admin token. */
export interface CreateRoomResponse {
  /** Created rooms are owned by the host account that created them. */
  ownerAccountId: string;
  roomId: string;
  /** Short code people type or share to join. */
  code: string;
  secrets: RoomSecrets;
  token: string;
  roleId: Role;
}

export interface JoinRoomRequest {
  code: string;
  /** Omitted: join as a spectator. Otherwise one of the room's secrets. */
  secret?: string;
  /** Required with the player secret; claims (or reclaims) a seat. */
  username?: string;
}

export interface JoinRoomResponse extends LoginResponse {
  roomId: string;
}

/** POST /api/rooms/current/secrets — rotate one role's secret. */
export interface RotateSecretRequest {
  role: keyof RoomSecrets;
}

/** POST /api/rooms/current/transfer — owner hands the room to another host. */
export interface TransferRoomRequest {
  username: string;
}

export interface AccountCredentials {
  username: string;
  password: string;
}

export interface AccountSession {
  token: string;
  accountId: string;
  username: string;
}

/** Signup and recovery return a (new) one-time recovery code: show it once. */
export interface AccountSessionWithRecovery extends AccountSession {
  recoveryCode: string;
}

export interface RecoverAccountRequest {
  username: string;
  recoveryCode: string;
  newPassword: string;
}

export interface OwnedRoom {
  roomId: string;
  code: string;
  createdAt: number;
}

export interface AccountProfile {
  accountId: string;
  username: string;
  rooms: OwnedRoom[];
}

export const BRAND_SLOTS = ['logo', 'logo-long', 'placeholder', 'background'] as const;
export type BrandSlot = (typeof BRAND_SLOTS)[number];
export interface UiConfig {
  darkMode: boolean;
  pallette: number;
  miscImageSrcNames: Partial<Record<BrandSlot, string>>;
}
export interface PublicUi {
  darkMode: boolean;
  palette: number;
  brand: Record<BrandSlot, string | null>;
}
export interface BankItem {
  id: string;
  name: string;
  matchName: string;
  sizeBytes: number;
  createdAt: number;
  updatedAt: number;
}

/** Mutable brand assets that safely override the bundled Legion defaults. */
export const BRAND_ASSET_KEYS = ['logo', 'wordmark', 'placeholder', 'icon'] as const;
export type BrandAssetKey = (typeof BRAND_ASSET_KEYS)[number];

/** Multipart field name used by all upload endpoints. */
export const UPLOAD_FIELD = 'file';

export const API_PATHS = {
  server: '/api/server',
  session: '/api/session',
  login: '/api/auth/login',
  config: '/api/config',
  match: '/api/match',
  matchPosition: '/api/match/position',
  matchPlayer: (index: number) => `/api/match/players/${index}`,
  round: (kind: RoundKind) => `/api/rounds/${kind}`,
  media: (kind: RoundKind | 'misc') => `/api/media/${kind}`,
  brand: (slot: BrandSlot) => `/api/brand/${slot}`,
  bank: '/api/bank',
  bankItem: (id: string) => `/api/bank/${id}`,
  saveToBank: '/api/rooms/current/save-to-bank',
  brandAsset: (key: BrandAssetKey) => `/api/assets/${key}`,
  mediaFile: (kind: RoundKind | 'misc', name: string) =>
    `/media/${kind}/${encodeURIComponent(name)}`,
  /** Admin uploads a single VCNV obstacle reveal piece to the protected store. */
  obstaclePieceUpload: '/api/media/obstacle-piece',
  /** Reveal-gated fetch of obstacle piece `index` (0-based). */
  obstaclePiece: (index: number) => `/api/media/obstacle/${index}`,
  importLegion: '/api/match/import-legion',
  exportLegion: '/api/match/export-legion',
  rooms: '/api/rooms',
  joinRoom: '/api/rooms/join',
  joinLink: '/api/rooms/join-link',
  roomSettings: '/api/rooms/current/settings',
  roomLinks: '/api/rooms/current/links',
  roomLink: (id: string) => `/api/rooms/current/links/${id}`,
  /** The caller's own room (from the token): DELETE closes it. */
  currentRoom: '/api/rooms/current',
  rotateSecret: '/api/rooms/current/secrets',
  releaseSeat: (index: number) => `/api/rooms/current/seats/${index}`,
  transferRoom: '/api/rooms/current/transfer',
  /** A host's account token → an admin session in a room they own. */
  enterRoom: (roomId: string) => `/api/rooms/${roomId}/enter`,
  signup: '/api/accounts',
  accountLogin: '/api/accounts/login',
  accountLogout: '/api/accounts/logout',
  recoverAccount: '/api/accounts/recover',
  me: '/api/accounts/me',
  /** Public media of a created room; the default room uses `mediaFile`. */
  roomMediaFile: (roomId: string, kind: RoundKind | 'misc', name: string) =>
    `/rooms/${roomId}/media/${kind}/${encodeURIComponent(name)}`,
} as const;
