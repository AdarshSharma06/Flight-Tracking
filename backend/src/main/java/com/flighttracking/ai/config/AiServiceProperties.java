package com.flighttracking.ai.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.ai")
public record AiServiceProperties(
        String baseUrl,
        int timeoutMs,
        String apiKey
) {
}