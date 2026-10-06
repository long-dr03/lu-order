# PostgreSQL deployment and recovery

## Release checks

- Runtime uses PostgreSQL only (`DATABASE_URL` required); SQLite remains only in the read-only export tool.
- 63 integration tests run on disposable PostgreSQL databases, including all six roles, production/QC/shipping/payroll, concurrent retries, stale versions, rollback, case-insensitive accounts, and backup restoration into a separate database.
- Money, IDs, timestamps, binary photos, account hashes and historical records are preserved by the migration. Current migration version: 10.
- Public health probe: `/api/health`, returns 200 only after migrations and a database query succeed; returns no credentials or internal errors.

## Dokploy layout

- Application listens on `0.0.0.0:3000`; domain routes to container port 3000.
- PostgreSQL 17 has its own named volume and no published external port.
- Runtime login is a separate non-superuser role, owning the application's schema. No database creation or role management permission.
- Application backup files use a separate volume at `/app/backups`; scheduled backups survive container replacement.
- Keep `DATABASE_URL`, `APP_ORIGIN`, `SESSION_COOKIE_SECURE=true`, and `BACKUP_DIR=/app/backups` in runtime environment settings. Disable environment-file generation during image build. Never commit credentials or backups.

## Data transfer record

The pre-migration remote SQLite database was empty. The local SQLite source was exported read-only and restored into an isolated PostgreSQL database before transferring it to Dokploy. Comparison of all 25 source tables matched 437 rows, including binary photos and password hashes: 6 accounts, 7 orders, 13 production logs, 2 photos, and total historical wages of 49,700,000 VND.

Source backups are retained locally in the ignored `backups/migration-postgres-2026-10-06/` directory. Full database snapshots contain private data. The data-integrity report is also local/ignored: pre-existing historical reconciliation differences are retained, not silently corrected during migration.

## Restore and rollback

1. Stop writes and take a current full backup before any rollback.
2. Create an empty PostgreSQL database and set its private `DATABASE_URL`.
3. Restore a LUUTA `.pg.json.gz` snapshot using `npm run db:restore -- <file>`; the command refuses a populated target and rolls back on error. A native `.dump` instead uses PostgreSQL `pg_restore --single-transaction --exit-on-error --no-owner --no-privileges`.
4. Compare table counts, totals, images and role-scoped API responses before changing the application's connection.
5. Redeploy, verify `/api/health`, sign-in, and a backup download. Preserve the previous database for recovery.

Do not deploy an old SQLite-only image against the PostgreSQL runtime configuration. Rolling code back across this migration also requires explicitly restoring the matching database and connection settings. Never overwrite the only copy of a database. Store a backup off the server as well as on its persistent volume.

## Local development

The local database service is `luuta-postgres-local` (PostgreSQL 17), published only on `127.0.0.1:55433`, with named volume `luuta-postgres-local-data`. Connection credentials stay in `.env.local`. Stopping/restarting the container retains data; do not remove the volume.

Tests require a separate `TEST_DATABASE_URL` with permission to create disposable databases. They never fall back to the production `DATABASE_URL`.
