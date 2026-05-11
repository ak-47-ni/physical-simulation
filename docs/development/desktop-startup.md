# Desktop Startup

Use the desktop shell when testing physics collisions, runtime playback, and scene interaction. Browser-only Vite runs can miss desktop runtime behavior.

## Recommended Command

From the repository root:

```bash
./scripts/start-desktop.sh
```

The script loads `.desktop.env` from the repository root when the file exists, starts the Vite frontend at `http://localhost:1420` when it is not already running, then launches the Tauri desktop shell with:

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

Direct Cargo launch also reads `.desktop.env` from the repository root for AI scene generation settings.

If the desktop shell opens to a blank screen, start the app with `./scripts/start-desktop.sh` so the frontend service is started first.

## Local AI Configuration

Copy the template and fill in local values:

```bash
cp .desktop.env.example .desktop.env
```

Example `.desktop.env`:

```bash
OPENAI_API_KEY=your-openai-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-5.4-mini
```

`OPENAI_BASE_URL` may be either a base URL such as `https://api.openai.com/v1` or a full Responses endpoint such as `https://gateway.example.com/v1/responses`.

Priority order:

1. Environment variables already set in the shell.
2. Values from `.desktop.env`.
3. Built-in defaults for optional values.

`.desktop.env` is ignored by git. Do not commit real API keys.

## Troubleshooting

- `Missing required command: pnpm`: install pnpm or enable it through Corepack.
- `Missing required command: cargo`: install Rust with rustup and reopen the terminal.
- `Timed out waiting for frontend dev server`: check `.desktop-vite.log` in the repository root.
- Port `1420` is already in use: stop the existing process or confirm it is the desktop frontend before launching Tauri.
- `OPENAI_API_KEY is not configured`: create `.desktop.env` or export `OPENAI_API_KEY` before starting.
