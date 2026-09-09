-- V8__add_ignav_fields_to_bookings.sql
-- Add Ignav-specific fields for Booking page external booking flow

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ignav_id VARCHAR(64);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS price_amount DOUBLE PRECISION;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS price_currency VARCHAR(10);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS price_status VARCHAR(20);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_name VARCHAR(100);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_type VARCHAR(30);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_url TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cabin VARCHAR(30);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS duration VARCHAR(30);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stops INTEGER;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ignav_legs_json TEXT;

CREATE INDEX IF NOT EXISTS idx_bookings_ignav_id ON bookings(ignav_id);
