/**
 * POST /api/auth/login — secret exchange for a signed token.
 *
 * Login never fails: an unknown or missing secret yields a Viewer token,
 * matching the old verify-identity semantics.
 */
import { Router } from 'express';
import { API_PATHS, LoginRequest, LoginResponse } from '../contracts/api';
import type { ApiDeps } from './index';

export function createAuthRoutes(deps: ApiDeps): Router {
  const { auth } = deps;
  const router = Router();

  router.post(API_PATHS.login, (req, res) => {
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
