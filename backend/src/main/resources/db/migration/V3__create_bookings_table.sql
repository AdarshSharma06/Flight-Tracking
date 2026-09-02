-- V3__create_bookings_table.sql
-- Booking persistence for Part 4

CREATE TABLE IF NOT EXISTS bookings (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    flight_number VARCHAR(20) NOT NULL,
    origin VARCHAR(10) NOT NULL,
    destination VARCHAR(10) NOT NULL,
    departure_scheduled VARCHAR(50),
    arrival_scheduled VARCHAR(50),
    airline_name VARCHAR(100),
    aircraft_registration VARCHAR(50),
    status VARCHAR(30) NOT NULL DEFAULT 'CONFIRMED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_flight_number ON bookings(flight_number);
