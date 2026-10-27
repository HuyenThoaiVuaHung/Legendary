# Legendary

Self-hosted Node.js server for Legion. It serves the Angular client, REST API, Socket.IO realtime events, public assets, uploaded media, and match state.

## Requirements

- Node **22.22.3**
- npm
- A built Legion client in `./Legion` for the hosted UI

## Run locally

```bash
npm ci
npm run build
npm start
```

Useful runtime configuration is loaded from `utils/config.json` and can be overridden with `LEGENDARY_*` environment variables. For a non-privileged port, set `LEGENDARY_PORT=8080`.

The server writes mutable match state, media, and user asset overrides under `match_data/`. Keep that directory on persistent storage in production. Do not use the default player/admin secrets or a random per-boot JWT secret in a production deployment; set them explicitly through protected configuration.

## Build

```bash
npm run typecheck
npm run build
```

`dist/` contains the compiled server. The server expects the browser build in `Legion/`, which is produced from the Legion repository's `dist/Legion` output.

## CI and release packaging

- Pull requests and `main` pushes install locked dependencies, type-check, and build. CI does **not** run tests.
- **Package Legendary Distribution** remains available from `main` for a private build artifact. It checks out the matching Legion tag and builds both projects.
- For a published release, run **Legendary Release Tag** first, then the matching Legion tag and **Cut Legion Release** in the Legion repository. The assembled archive and release notes are published in [Legion GitHub Releases](https://github.com/HuyenThoaiVuaHung/Legion/releases).
- The archive contains `dist/`, `Legion/`, bundled `assets/`, package manifests, and `release-manifest.json`. It intentionally excludes mutable `match_data/`.

## License

GPLv3. See `LICENSE`.
