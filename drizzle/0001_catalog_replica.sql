-- Additive and idempotent. Apply with the transactional D1 migrations runner.
CREATE TABLE IF NOT EXISTS catalog_mode (
 id INTEGER PRIMARY KEY NOT NULL CHECK(id=1),
 enabled INTEGER NOT NULL CHECK(enabled=1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS catalog_nonces (
 nonce TEXT PRIMARY KEY NOT NULL,
 expires INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS catalog_replica (
 source_product_id TEXT PRIMARY KEY NOT NULL,
 source_version INTEGER NOT NULL CHECK(source_version>0),
 payload TEXT NOT NULL,
 digest TEXT NOT NULL,
 synced_at INTEGER NOT NULL
);
