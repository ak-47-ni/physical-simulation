# Desktop Startup

Use the desktop shell when testing physics collisions, runtime playback, and scene interaction. Browser-only Vite runs can miss desktop runtime behavior.

## Recommended Command

From the repository root:

```bash
./scripts/start-desktop.sh
```

The script starts the Vite frontend at `http://localhost:1420` when it is not already running, then launches the Tauri desktop shell with:

```bash
cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml
```

This keeps the launch path aligned with the direct Cargo command while avoiding a blank Tauri window caused by a missing frontend dev server.

## Prerequisites

- Run `pnpm install` after cloning or dependency changes.
- Install Rust and ensure `cargo` is available in `PATH`.
- Install the Tauri platform prerequisites for the current OS.

## Direct Cargo Launch

If the frontend dev server is already running on `http://localhost:1420`, this command is also valid:

```bash
cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml
```

If the desktop shell opens to a blank screen, start the app with `./scripts/start-desktop.sh` so the frontend service is started first.

## Troubleshooting

- `Missing required command: pnpm`: install pnpm or enable it through Corepack.
- `Missing required command: cargo`: install Rust with rustup and reopen the terminal.
- `Timed out waiting for frontend dev server`: check `.desktop-vite.log` in the repository root.
- Port `1420` is already in use: stop the existing process or confirm it is the desktop frontend before launching Tauri.
