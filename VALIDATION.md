# Nest 0.1.0 validation

The source app and packaged Linux executable passed [release run 40973468598](https://github.com/script-bot-afk/Nest/actions/runs/40973468598) on Ubuntu 24.04 x86_64 on October 29, 2026 (commit `2bc8166`). The workflow published [v0.1.0](https://github.com/script-bot-afk/Nest/releases/tag/v0.1.0) with an AppImage, portable tarball, and SHA-256 checksums.

Verified in that run:

- All five configuration and authenticated WebSocket bridge tests passed.
- Real Xvnc/Openbox sessions started, stopped, and restarted. X clients without the session cookie were rejected. The private directory and display socket permissions were checked.
- Real xterm and btop windows appeared, window focus worked, and managed child processes exited after shutdown.
- Electron displayed the noVNC session and real Firefox, terminal, and btop windows.
- A command typed through noVNC wrote a marker file from the actual shell; the harness read it back successfully.
- The native framebuffer resized when the outer application window resized.
- No renderer errors occurred. Screenshots and a JSON result are attached to the run as `nest-test-evidence`.
- AppImage and portable tarball packaging succeeded.

The **packaged Linux executable** passed the same native UI checks after packaging. Its external Openbox/wallpaper resources were checked. The evidence JSON records `packaged: true`, successful terminal input and desktop resizing, three native app windows, and no renderer errors. Publication is gated on this step succeeding.

This is an early Linux desktop preview. CI coverage on Ubuntu does not establish compatibility with every distribution or compositor. The test harness alone uses Chromium's `--no-sandbox` switch; the shipped app does not. Native sessions share the host account and are not an isolation boundary.

The initial October 27 workspace build could not run native checks because that workspace blocks Unix sockets. The GitHub checks above supersede that earlier unverified build.
