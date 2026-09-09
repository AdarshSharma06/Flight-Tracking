package com.flighttracking.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.ignav")
public record IgnavProperties(
        String apiKey,
        String baseUrl,
        int timeoutMs
) {
}
