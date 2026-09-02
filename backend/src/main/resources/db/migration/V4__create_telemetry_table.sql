-- V4__create_telemetry_table.sql
-- Telemetry infrastructure for ATC / tracking

CREATE TABLE IF NOT EXISTS telemetry (
    id BIGSERIAL PRIMARY KEY,
    flight_number VARCHAR(20) NOT NULL,
    flight_iata VARCHAR(20),
    flight_icao VARCHAR(20),
    airline_iata VARCHAR(10),
    origin_iata VARCHAR(10),
    destination_iata VARCHAR(10),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    altitude DOUBLE PRECISION,
    speed DOUBLE PRECISION,
    direction DOUBLE PRECISION,
    heading DOUBLE PRECISION,
    flight_status VARCHAR(30),
    route_info VARCHAR(500),
    aircraft_registration VARCHAR(50),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_flight_number ON telemetry(flight_number);
CREATE INDEX IF NOT EXISTS idx_telemetry_recorded_at ON telemetry(recorded_at);
