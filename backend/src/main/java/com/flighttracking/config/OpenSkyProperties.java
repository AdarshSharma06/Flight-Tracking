package com.flighttracking.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.opensky")
public record OpenSkyProperties(
        String baseUrl,
        String clientId,
        String clientSecret,
        int timeoutMs
) {
}
