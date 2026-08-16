# WireTAP Backend

A self-contained Docker stack that owns the long-term CAN capture database and
fronts it with an API, so **nothing connects to PostgreSQL directly** — not the
WireTAP desktop app, not microcontroller capture devices, not the Raspberry Pi
`wiretap-server`. The stack is:

- **TimescaleDB** (PostgreSQL 16 + TimescaleDB) — capture storage, one database
  per capture. Not published to the network.
- **`wiretap-backend`** (Rust / axum) — the only process that talks to Postgres.
  Two listeners plus a built-in admin UI:
  - **Binary ingest** (TCP 9323) — the protocol in
    [docs/ingest-protocol.md](../docs/ingest-protocol.md), for MCUs and the Pi's
    forward mode. Writes are **ACK-after-write**: a batch is stored in Postgres
    before the device is acknowledged, so a database outage back-pressures the
    device into its own disk cache (nothing is buffered in gateway RAM).
  - **HTTP API** (8423) — the analytical query surface the desktop uses, plus
    capture import, database management and health.
  - **Admin UI** at `/admin` — API keys, databases, live ingest sessions,
    activity, health.
- **pgBackRest** (optional) — scheduled physical backups with PITR.

```
 MCU ────binary 9323───▶┌─ wiretap-backend ─┐
 Pi (forward mode) ────▶│  ingest + HTTP    │───▶ timescaledb  (not published)
 WireTAP desktop ──HTTP▶│  + /admin SPA     │      [+ pgbackrest, optional]
 Browser → /admin ─────▶└───────────────────┘
```

## Quick start

```bash
cd tools/wiretap-backend
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD and WIRETAP_ADMIN_KEY (openssl rand -hex 32)
docker compose up -d --build
curl -fsS http://localhost:8423/v1/health      # {"status":"ok",...}
open http://localhost:8423/admin               # sign in with WIRETAP_ADMIN_KEY
```

The default capture database (`wiretap`) and the API-key store are created on
first start.

## API keys & roles

Keys live in the database (`wiretap_meta.api_keys`, sha256-hashed); the
plaintext is shown once at creation in the admin UI. `WIRETAP_ADMIN_KEY` from
the environment is a break-glass admin key that always works and can't be
revoked from the UI.

| Role | Can |
|------|-----|
| `read` | run queries, list databases, stream frames |
| `ingest` | push frames (TCP or import); optionally pinned to one database |
| `admin` | everything, plus key/database management and activity control |

Create per-device `ingest` keys (optionally database-pinned) and per-user
`read` keys from the admin UI. Keys can be **revoked** (instant, reversible),
**restored**, or **permanently deleted**.

## Databases (one per capture)

Independent captures (a vehicle, a site, a bench rig) each get their own
database — drop a finished capture with `DROP DATABASE`, back them up
independently, and keep a runaway experiment from polluting the archive. Same
*system* with multiple CAN buses stays in one database, separated by the `bus`
column.

A database is created when: an admin creates it in the UI / API; an ingest
client names an unknown one in its HELLO (auto-create, when enabled); or a
capture import targets one with `?create=true`. Auto-create is gated by
`WIRETAP_AUTO_CREATE` (default on).

An admin can **delete** a capture database (UI Delete button or
`DELETE /v1/databases/{db}`), after confirmation. It's refused while a device is
actively ingesting into it (409) and for the default/meta database
(`WIRETAP_DEFAULT_DB`, which holds the API-key store).

## Configuration (environment)

| Var | Default | Purpose |
|-----|---------|---------|
| `POSTGRES_PASSWORD` | — (required) | Postgres superuser password (compose-internal) |
| `WIRETAP_ADMIN_KEY` | — | Break-glass admin key |
| `WIRETAP_DEFAULT_DB` | `wiretap` | Default capture database |
| `WIRETAP_AUTO_CREATE` | `true` | Allow ingest/import to auto-create databases |
| `RUST_LOG` | `wiretap_backend=info` | Log filter |

Full list (listen addresses, ingest keepalive/batch caps) is in
[src/config.rs](src/config.rs).

## Optional: pgBackRest backups

```bash
docker compose --profile backup up -d
```

A sidecar initialises the `wiretap` stanza, switches WAL archiving on, and runs
diff backups daily (full on Sundays) into the `pgbackrest-repo` volume.
`archive_mode` is on from first boot, so enabling backups later needs no
restart. To restore, stop the backend, run `pgbackrest --stanza=wiretap restore`
against the data volume, and start again — rehearse this against a scratch
volume first.

## Migrating an existing archive into the container

If you already have months of captures in a host PostgreSQL, move them into the
container with [tools/wiretap-server/migrate_to_timescale.py](../wiretap-server/migrate_to_timescale.py).
It copies `public.can_frame` day-by-day from the source into the container's
hypertable, validating each day by row count + checksum and compressing as it
goes; it's resumable, so re-running skips finished days. (A plain `pg_dump`
won't work — the new hypertable drops the legacy `row_id`/`id_hex`/`data_hex`
columns, so the column sets don't match.)

```bash
# 1. Bring the stack up (creates the target database + schema)
docker compose up -d

# 2. Switch new writes to the backend first (e.g. the Pi's [forward] mode) so
#    the source archive is static, then migrate. The container's Postgres is
#    not published by default — temporarily expose it:
#      uncomment "127.0.0.1:5432:5432" under timescaledb in docker-compose.yml
#      docker compose up -d
#    It binds to 127.0.0.1, so it is not reachable off the host — but re-comment
#    the line and `docker compose up -d` again once the migration is done. The
#    gateway is the only thing that should be talking to that database.
SRC=postgresql://user:pass@old-host:5432/legacy_archive
TGT=postgresql://postgres:$POSTGRES_PASSWORD@127.0.0.1:5432/wiretap
pip install psycopg2-binary    # one-off, for the migrator
../wiretap-server/migrate_to_timescale.py --source-dsn "$SRC" --target-dsn "$TGT"

# 3. Verify counts and that the hourly rollup is populated
docker compose exec timescaledb psql -U postgres -d wiretap \
  -c "SELECT count(*) FROM can_frame;" \
  -c "SELECT sum(frame_count) FROM can_frame_hourly;"
```

Then point the Pi at the gateway (`[forward]` in `wiretap-server.toml`) so new
frames land in the container rather than the old database.

### Pointing the desktop app at the gateway

The desktop app no longer connects to PostgreSQL directly — a database source is
a WireTAP Backend profile and nothing else. On first launch after upgrading, any
direct PostgreSQL profile is **removed from your settings and named in a
notice**, and its stored password is deleted from the keychain. Nothing else is
touched: captures, catalogues and every other profile are untouched.

To replace it:

1. In the admin UI, create an API key (per user, revocable). Copy it — the
   plaintext is shown once. **`read` covers querying, replay and analysis**,
   which is everything the migration path needs. Three app features want more:

   | App feature | Needs |
   |---|---|
   | Query engines, inventory, replay, cancelling a query, listing databases | `read` |
   | Query app's Database Activity view (list / cancel / terminate backends) | `admin` |
   | Importing a local capture into the backend | `ingest` or `admin` |
   | Creating a capture database from the app | `admin` |

   Test Connection only calls `/v1/health`, which is unauthenticated, so it
   succeeds with any key — it proves the gateway is reachable, not that the key
   is accepted. Run a query to confirm the key works.
2. In the app, **Settings → Data I/O → + Profile**, choose **WireTAP Backend**
   and fill in:
   - **Backend URL** — the gateway, e.g. `http://gateway.local:8423`
   - **API Key** — the key from step 1 (stored in the OS keychain)
   - **Capture Database** — the database this profile reads, e.g. `wiretap`.
     One profile per capture database; add several if you migrated more than one.
3. Optionally set a **Default Playback Speed** for replay.

Everything that worked against a PostgreSQL profile works against a backend
profile: the Query app's engines, bookmarks and time ranges, replay with speed
control, and the headless MCP analysis tools (`frame_inventory`,
`frame_byte_profile`, `frame_checksum_scan`, `catalog_coverage`, and the
`query_*` engines) — pass the backend profile's id as `profile_id` exactly as
before. See [docs/mcp-analysis-tools.md](../../docs/mcp-analysis-tools.md),
which also records how sampling differs between a capture and an archive.

Once both read and ingest go through the gateway, retire the host PostgreSQL.

## Tests

```bash
cargo test                 # unit tests (proto codec, schema splitter, db names)
./smoke_test.sh            # HTTP endpoint + auth-matrix + import (needs stack up)
./parity_test.py           # backend SQL vs direct-psql ground truth
# protocol conformance against the running ingest listener:
python3 ../wiretap-server/test_ingest_client.py \
    --host localhost --port 9323 --token "$WIRETAP_ADMIN_KEY" \
    --database conformance --conformance
```
