/**
 * Host accounts (hosted mode only).
 *
 * POST /api/accounts         — sign up; returns a session and a one-time
 *                              recovery code (rate-limited per IP).
 * POST /api/accounts/login   — username + password → account session.
 * POST /api/accounts/recover — recovery code → new password, a fresh code,
 *                              and every old session of the account revoked.
 * POST /api/accounts/logout  — end this account session.
 * GET  /api/accounts/me      — profile + owned rooms.
 */
import { Response, Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import {
  AccountCredentials,
  AccountProfile,
  AccountSession,
  AccountSessionWithRecovery,
  API_PATHS,
  ApiError,
  RecoverAccountRequest,
} from '../contracts/api';
import {
  AccountStore,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_PATTERN,
} from '../services/account.store';
import { accountOf, requireAccount } from './middleware';
import type { ApiDeps } from './index';

const MS_PER_SECOND = 1000;

function fail(res: Response, status: number, message: string): void {
  const error: ApiError = { error: message };
  res.status(status).json(error);
}

/** Validation message for a password, or null when acceptable. */
function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string') return 'Password is required';
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters`;
  }
  return null;
}

export function createAccountRoutes(deps: ApiDeps, accounts: AccountStore): Router {
  const { auth, rooms, config, log } = deps;
  const router = Router();
  const hostOnly = requireAccount(auth);

  const limiter = (limit: number, windowSeconds: number, message: string) =>
    rateLimit({
      windowMs: windowSeconds * MS_PER_SECOND,
      limit,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: message },
    });
  const signupLimiter = limiter(config.signupRateLimit, config.signupRateWindowSeconds, 'Too many signups, try again later');
  // Login and recovery share the login budget: both are password guesses.
  const loginLimiter = limiter(config.loginRateLimit, config.loginRateWindowSeconds, 'Too many login attempts');

  const session = (accountId: string, username: string): AccountSession => ({
    token: auth.issueAccountToken(accountId),
    accountId,
    username,
  });

  router.post(API_PATHS.signup, signupLimiter, async (req, res) => {
    const { username, password } = (req.body ?? {}) as Partial<AccountCredentials>;
    if (typeof username !== 'string' || !USERNAME_PATTERN.test(username)) {
      fail(res, 400, 'Username must be 3–32 letters, digits, dots, dashes or underscores');
      return;
    }
    const problem = passwordProblem(password);
    if (problem) {
      fail(res, 400, problem);
      return;
    }
    const created = await accounts.create(username, password as string);
    if (!created) {
      fail(res, 409, 'That username is taken');
      return;
    }
    log(`Host account ${username} created`);
    const response: AccountSessionWithRecovery = {
      ...session(created.account.id, created.account.username),
      recoveryCode: created.recoveryCode,
    };
    res.status(201).json(response);
  });

  router.post(API_PATHS.accountLogin, loginLimiter, async (req, res) => {
    const { username, password } = (req.body ?? {}) as Partial<AccountCredentials>;
    if (typeof username !== 'string' || typeof password !== 'string') {
      fail(res, 400, 'Username and password are required');
      return;
    }
    const account = await accounts.verifyPassword(username, password);
    if (!account) {
      // One message for both cases: don't reveal which usernames exist.
      fail(res, 401, 'Wrong username or password');
      return;
    }
    res.json(session(account.id, account.username));
  });

  router.post(API_PATHS.recoverAccount, loginLimiter, async (req, res) => {
    const { username, recoveryCode, newPassword } = (req.body ?? {}) as Partial<RecoverAccountRequest>;
    const problem = passwordProblem(newPassword);
    if (problem) {
      fail(res, 400, problem);
      return;
    }
    if (typeof username !== 'string' || typeof recoveryCode !== 'string') {
      fail(res, 400, 'Username and recovery code are required');
      return;
    }
    const recovered = await accounts.recover(username, recoveryCode, newPassword as string);
    if (!recovered) {
      fail(res, 401, 'Wrong username or recovery code');
      return;
    }
    const { account } = recovered;
    // Whoever had the old password is logged out everywhere.
    auth.sessions.revokeWhere((record) => record.accountId === account.id);
    log(`Host account ${account.username} recovered`);
    const response: AccountSessionWithRecovery = {
      ...session(account.id, account.username),
      recoveryCode: recovered.recoveryCode,
    };
    res.json(response);
  });

  router.post(API_PATHS.accountLogout, hostOnly, (req, res) => {
    auth.sessions.revoke(accountOf(req).sessionId);
    res.status(204).end();
  });

  router.get(API_PATHS.me, hostOnly, (req, res) => {
    const { accountId } = accountOf(req);
    const account = accounts.get(accountId);
    if (!account) {
      fail(res, 401, 'Host login required');
      return;
    }
    const profile: AccountProfile = {
      accountId,
      username: account.username,
      rooms: rooms.ownedBy(accountId).map((room) => ({
        roomId: room.id,
        code: room.meta!.code,
        createdAt: room.meta!.createdAt,
      })),
    };
    res.json(profile);
  });

  return router;
}
