-- V1__baseline.sql
-- Baseline migration to verify Flyway setup.
-- This does not create domain tables; domain entities will be added in later parts.
-- We create a minimal example table to prove migrations run against PostgreSQL.
-- If you prefer zero tables, you could keep this empty and Flyway will still create flyway_schema_history.

CREATE TABLE IF NOT EXISTS schema_version_demo (
    id BIGSERIAL PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed a single row so we can verify the migration executed
INSERT INTO schema_version_demo (description) VALUES ('baseline migration - flyway configured') ON CONFLICT DO NOTHING;
