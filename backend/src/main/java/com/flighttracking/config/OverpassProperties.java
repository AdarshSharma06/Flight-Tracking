package com.flighttracking.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.overpass")
public record OverpassProperties(
        String baseUrl,
        int timeoutMs
) {
}
