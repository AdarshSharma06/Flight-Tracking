package com.flighttracking.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.airlabs")
public record AirlabsProperties(
        String apiKey,
        String baseUrl,
        int timeoutMs
) {
}
