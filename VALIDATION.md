# Initial build validation — 2026-10-27

- Renderer bundle: built successfully with esbuild.
- Linux x86_64 packaging: Electron AppImage and portable tarball produced successfully.
- Four configuration tests passed: nested display/environment routing, application allowlist and Firefox profile arguments, resolution validation, and binary Xauthority encoding.
- JavaScript syntax checks passed for backend, preload, renderer, and smoke-test sources.
- Native-session and WebSocket bridge tests could not complete in the build workspace: its runtime rejects Unix-domain socket creation with EPERM. This is an environment limitation, not a passing test.
- Full Electron/noVNC UI testing has not yet run. The CI workflow is prepared to test the real display, native Firefox, btop, terminal, resize, and shutdown on Ubuntu.

Treat this build as an **unverified native preview** until the GitHub workflow passes or it is tested on a normal Linux desktop. A successful package build alone does not prove native session behavior.
