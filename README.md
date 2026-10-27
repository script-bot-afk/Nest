# Nest

**Your Linux desktop, inside a window.**

A real nested desktop with an HTML/CSS/JavaScript shell. Launch Firefox, a terminal, btop, and a file manager into one app window. Move, resize, minimize, and switch between their real native windows.

This is an early Linux x86_64 preview, not an operating system or VM. It shares your host kernel, account, files, network, and hardware. It is **not a sandbox for untrusted applications or terminal commands**.

## Get the app

Download the AppImage or portable `.tar.gz` from [Releases](https://github.com/script-bot-afk/Nest/releases). You do not need Node.js to run a release build.

On **CachyOS / Arch**, install the native components once:

```bash
sudo pacman -S --needed tigervnc openbox xterm dbus wmctrl xorg-xsetroot feh firefox btop thunar
```

Then make the downloaded AppImage executable in your file manager (Properties → Permissions → executable), or run:

```bash
chmod +x Nest-0.1.0-x86_64.AppImage
./Nest-0.1.0-x86_64.AppImage
```

If FUSE is unavailable, use `./Nest-0.1.0-x86_64.AppImage --appimage-extract-and-run`, or extract the portable tarball and run its `nest` executable. Do not run Nest with sudo. Do not disable Chromium's sandbox to work around a host configuration problem.

Nest opens to a welcome screen. Click **Enter your desktop**, then use **Applications** or the dock to launch apps. Missing components appear under **Setup → Components**, with copyable commands. Nest does not install system packages automatically.

### Other distributions

Debian / Ubuntu core components:

```bash
sudo apt update
sudo apt install tigervnc-standalone-server openbox xterm dbus-x11 wmctrl x11-xserver-utils feh btop thunar
```

Install a **native** Firefox / Firefox ESR package separately. Ubuntu's default Firefox Snap wrapper is not supported in this preview. On Debian, `sudo apt install firefox-esr` is suitable.

Fedora:

```bash
sudo dnf install tigervnc-server openbox xterm dbus-daemon wmctrl xsetroot feh firefox btop thunar
```

Void:

```bash
sudo xbps-install -S tigervnc openbox xterm dbus wmctrl xsetroot feh firefox btop Thunar
```

Package names can vary. The app's checker reports the actual executables found on PATH. Native applications are supported; Flatpak and Snap routing is not implemented yet.

## Included in this preview

- A private TigerVNC X display rendered within Electron using noVNC. No remote server or VM required.
- Openbox handles real app window dragging, resizing, maximizing, and minimizing.
- Firefox uses a separate persistent profile and `--no-remote`, so it doesn't open in your usual Firefox session.
- xterm opens a real shell; btop shows the **host's** live CPU, RAM, and process data.
- Thunar or PCManFM opens your real home directory.
- Taskbar buttons restore/focus native windows, including minimized windows.
- Resolution selection, automatic desktop resizing, fullscreen, saved accent preferences, and a session log.
- Explicit text transfer into the nested clipboard, without automatic host clipboard reads.
- Stop/restart and close confirmation. Normal session shutdown terminates the process groups Nest started.

Use the native titlebar controls inside Nest. Some shortcuts (including Alt+Tab and Super combinations) may be intercepted by your host compositor; the taskbar works without them. F11 toggles the outer app's fullscreen mode.

## Important limits of this preview

- Linux x86_64 only. No Windows/macOS native app hosting, Android apps, ISO booting, or guest OS installation.
- Desktop viewing uses a local framebuffer stream. This is for desktop work, not high-refresh gaming, and is not a guarantee of GPU acceleration.
- Files and shell commands affect your real system. Firefox has a separate profile, but not a separate security boundary.
- Closing the session closes its GUI apps. Save first. Processes deliberately detached or daemonized from a terminal are outside the managed lifecycle; forcibly killing Nest can leave processes behind.
- Audio is not streamed by Nest. Applications may use your existing host audio service if available. Clipboard transfer is text-only into Nest; file drag-and-drop and clipboard sync are not implemented.
- The first version offers four launchers. Other native X11 apps can be started from its terminal. Arbitrary `.desktop` import is planned.
- Nest's chrome is HTML/JS; third-party app titlebars are Openbox decorations, not web recreations.

## Develop

Use Node.js 22 or newer and the native dependencies above:

```bash
npm ci
npm start
```

Build an AppImage and portable tarball:

```bash
npm run dist
```

Outputs are in `release/`. The Electron runtime is bundled; the native display components and launched apps are deliberately managed by your distribution.

## Tests and releases

```bash
npm test                   # config and authenticated bridge tests
npm run test:integration   # real Xvnc, Openbox, xterm/btop and cleanup
npm run build
xvfb-run -a npm run test:ui # real Electron and noVNC smoke test
```

Integration tests require an environment that permits Unix sockets and native X processes. They report a skip if dependencies are missing. CI installs the dependencies and runs all of them. UI testing uses Playwright to launch Electron, verifies the real btop/Firefox windows, and saves screenshots as workflow artifacts. CI's `--no-sandbox` option is **test-harness-only**; production does not add it.

Pushes to `main` run checks and build downloadable workflow artifacts. To publish a version, use **Actions → Build Nest → Run workflow** with **Publish a preview release** checked, or push a version tag. Publishing refuses to overwrite an existing version.

## How it is built

`src/main.cjs` hosts the sandboxed Electron renderer and a narrow, validated preload API. `src/session.cjs` owns the X server, a separate D-Bus session, Openbox, and child application process groups. `src/bridge.cjs` connects noVNC to a private Unix socket through a token-authenticated loopback WebSocket. `ui/` is the web shell.

The VNC server has TCP listening disabled. Its Unix socket is inside a mode-0700 temporary directory, with socket mode 0600. X clients use a random MIT-MAGIC-COOKIE. The WebSocket bridge binds only to `127.0.0.1`, requires a 256-bit per-session token, rejects unrelated web origins, and accepts one viewer. These controls protect the display endpoint; they do not isolate launched apps from your user account.

Documentation: [TigerVNC](https://tigervnc.org/doc/Xvnc.html), [noVNC](https://novnc.com/noVNC/docs/API.html), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security).

MIT for Nest's original code and artwork. See [THIRD_PARTY.md](THIRD_PARTY.md) for bundled dependencies.
