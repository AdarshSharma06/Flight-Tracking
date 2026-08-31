-- V2__create_users_table.sql
-- Creates users table for authentication

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
