-- V5__create_anomaly_records_table.sql
-- Anomaly record infrastructure for future AI/ML integration (Part 4: infrastructure only, no ML)

CREATE TABLE IF NOT EXISTS anomaly_records (
    id BIGSERIAL PRIMARY KEY,
    flight_number VARCHAR(20) NOT NULL,
    flight_iata VARCHAR(20),
    anomaly_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    description TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    telemetry_id BIGINT REFERENCES telemetry(id) ON DELETE SET NULL,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anomaly_flight_number ON anomaly_records(flight_number);
CREATE INDEX IF NOT EXISTS idx_anomaly_severity ON anomaly_records(severity);
CREATE INDEX IF NOT EXISTS idx_anomaly_status ON anomaly_records(status);
CREATE INDEX IF NOT EXISTS idx_anomaly_detected_at ON anomaly_records(detected_at);
