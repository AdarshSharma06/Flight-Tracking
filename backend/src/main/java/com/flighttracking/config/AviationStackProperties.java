package com.flighttracking.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.aviationstack")
public record AviationStackProperties(
        String apiKey,
        String baseUrl,
        int timeoutMs
) {
}
