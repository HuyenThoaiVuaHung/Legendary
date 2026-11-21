/**
 * POST /api/auth/login — secret exchange for a signed token.
 *
 * Login never fails: an unknown or missing secret yields a Viewer token,
 * matching the old verify-identity semantics.
 */
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { API_PATHS, LoginRequest, LoginResponse } from '../contracts/api';
import type { ApiDeps } from './index';

const MS_PER_SECOND = 1000;

export function createAuthRoutes(deps: ApiDeps): Router {
  const { auth, config } = deps;
  const router = Router();
  const loginLimiter = rateLimit({
    windowMs: config.loginRateWindowSeconds * MS_PER_SECOND,
    limit: config.loginRateLimit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many login attempts' },
  });

  router.post(API_PATHS.login, loginLimiter, (req, res) => {
    const body = (req.body ?? {}) as LoginRequest;
    const payload = auth.resolveRole(
      typeof body.secret === 'string' ? body.secret : undefined,
    );
    const response: LoginResponse =
      payload.index === undefined
        ? { token: auth.issueToken(payload), roleId: payload.roleId }
        : {
            token: auth.issueToken(payload),
            roleId: payload.roleId,
            index: payload.index,
          };
    res.json(response);
  });

  return router;
}
