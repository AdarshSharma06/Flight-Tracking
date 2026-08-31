package com.flighttracking.dto;

public record RegisterResponse(
        Long id,
        String username,
        String role,
        String message
) {
}
