PRAGMA foreign_keys = ON;

CREATE TABLE scanner_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    revision INTEGER NOT NULL DEFAULT 0,
    state_json TEXT NOT NULL CHECK (json_valid(state_json)),
    commit_token TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE scanner_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setup_id INTEGER,
    kind TEXT NOT NULL CHECK (kind IN ('early', 'confirmed', 'system')),
    symbol TEXT NOT NULL DEFAULT '',
    bar_ts_utc TEXT,
    created_at_utc TEXT NOT NULL,
    price REAL,
    message TEXT NOT NULL,
    delivery_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (delivery_status IN ('pending', 'sending', 'delivered', 'failed')),
    delivery_lease_until TEXT,
    delivery_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(delivery_json))
) STRICT;

CREATE INDEX idx_scanner_events_delivery
    ON scanner_events (delivery_status, delivery_lease_until, id);

CREATE INDEX idx_scanner_events_setup
    ON scanner_events (setup_id, id DESC);

CREATE TABLE scanner_deadletter (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES scanner_events(id),
    channel TEXT NOT NULL CHECK (channel = 'telegram'),
    error TEXT NOT NULL,
    attempts INTEGER NOT NULL,
    last_try_at TEXT NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1))
) STRICT;

CREATE INDEX idx_scanner_deadletter_unresolved
    ON scanner_deadletter (resolved, id);

INSERT INTO scanner_state (id, revision, state_json, updated_at)
VALUES (
    1,
    0,
    '{"schemaVersion":1,"nextSetupId":1,"setups":[],"lastCycle":null}',
    '1970-01-01T00:00:00.000Z'
);

