package com.flighttracking.service;

import com.flighttracking.dto.HealthResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;

@Service
public class HealthService {

    private final String applicationName;

    public HealthService(@Value("${spring.application.name:flight-tracking-backend}") String applicationName) {
        this.applicationName = applicationName;
    }

    public HealthResponse checkHealth() {
        return new HealthResponse("UP", applicationName, Instant.now());
    }
}
