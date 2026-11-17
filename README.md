# NetMinder

NetMinder helps amateur radio net control operators manage nets, station check-ins, and station history. It uses Bun, Elysia, React, and SQLite.

## Features

- Create nets, record topics, and manage formal and informal sessions
- Track station check-ins, callsigns, names, locations, and comments
- Optionally track fixed, mobile, and portable check-ins; admins can turn this off under Settings (Enable mobility tracking), which hides mobility controls while keeping stored data
- View station history (split into "Your nets" and "All visible nets") and export net records as CSV
- Map a net's check-ins from QRZ coordinates (or grid square center), with an optional NEXRAD radar overlay and a pop-out window
- Look up callsigns through optional QRZ integration
- Manage operator accounts and administrator access
- Run locally or in Docker with persistent SQLite storage

## Local development

Install [Bun](https://bun.sh) 1.4.4 or later, then:

```bash
git clone https://github.com/sirmalloc/netminder.git
cd netminder
bun install
cp .env.example .env
bun run dev
```

Replace the example secrets in `.env` with separate values generated using `openssl rand -base64 32`. Local development has fallback keys when variables are unset; production requires both keys.

Open `http://localhost:8080` and create the initial administrator account. Complete setup before making the server accessible to others. QRZ lookups are optional; see below.

## QRZ credentials

QRZ lookups run on QRZ accounts configured on the Settings page, which is open to every signed-in user. Administrators choose one of two modes:

- **Per-user** (default for new installs): each user saves their own QRZ credentials under "My QRZ Credentials". A user without credentials gets no QRZ lookups and sees a notice on the active net page; manual entry still works. There is no fallback to the global account.
- **Global**: all lookups use the shared account an administrator saves under "Global QRZ Credentials", and users cannot change credentials.

Existing installs that already have global credentials start in Global mode after upgrading. Stored credentials are kept when switching modes. Passwords are encrypted with `CONFIG_ENCRYPTION_KEY`, and QRZ sessions are cached per credential set.

API documentation is available at `http://localhost:8080/api/openapi`.

## Docker deployment

Create `.env` from `.env.example` and replace `JWT_SECRET` and `CONFIG_ENCRYPTION_KEY` with separate random values:

```bash
openssl rand -base64 32
openssl rand -base64 32
docker compose up -d --build
```

Compose requires both secrets and stores the database in the `netminder-data` named volume. Open `http://localhost:8080` to complete initial setup. Use an HTTPS reverse proxy when exposing the application over a network.

Keep the encryption key stable and backed up: changing it prevents existing QRZ credentials from being decrypted. Changing the JWT secret invalidates existing sessions.

To build and run the image directly:

```bash
docker build -t netminder:latest .
docker run -d \
  --name netminder \
  --env-file .env \
  -e NODE_ENV=production \
  -e DATABASE_PATH=/app/data/netminder.sqlite3 \
  -p 8080:8080 \
  -v netminder-data:/app/data \
  netminder:latest
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | Set to `production` for deployment |
| `PORT` | `8080` | HTTP server port |
| `DATABASE_PATH` | `./data/netminder.sqlite3` | SQLite database path |
| `JWT_SECRET` | Development fallback | Signing secret; required in production |
| `CONFIG_ENCRYPTION_KEY` | Development fallback | Encrypts stored QRZ credentials; required in production |

Environment files, databases, backups, and private keys are excluded from Git. `.env.example` contains placeholders only.

## Development commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the server and Tailwind with hot reload |
| `bun run lint` | Check all workspace types and run ESLint with fixes |
| `bun run build` | Build production assets into `.dist/` |
| `bun run build:dev` | Build with development output |
| `bun run compile` | Build a standalone executable for the current platform |
| `bun run compile:applesilicon` | Build a macOS ARM64 executable |
| `bun run compile:linux` | Build a Linux x64 executable |

To run the JavaScript build, launch `bun server.js` from `.dist/` so Bun resolves the generated assets correctly. Supply the production environment variables and an absolute `DATABASE_PATH` when doing so.

The `docker:build` script publishes multi-platform images to the maintainer's Docker Hub namespace; adjust its destination before using it for your own images.

## Project layout

- `server.ts`: server startup, global middleware, and SPA hosting
- `api/`: Elysia routes, authentication, and OpenAPI contracts
- `client/`: React UI and Tailwind styles
- `core/`: shared encryption, QRZ, and settings helpers
- `dal/`: SQLite queries, schema, and migrations
- `docs/`: internal development plans
- `data/`: local database storage, excluded from Git

## Backups

Stop the application before copying the database, or use SQLite's online backup facility. For Docker, back up the `netminder-data` volume while the container is stopped. Store backups and the encryption key securely outside the repository.

## Contributing

Create a feature branch, keep changes focused, and run `bun run lint` and `bun run build` before opening a pull request. Include verification steps and screenshots for UI changes. See [AGENTS.md](./AGENTS.md) for workspace conventions.

Report bugs and questions through [GitHub issues](https://github.com/sirmalloc/netminder/issues).
