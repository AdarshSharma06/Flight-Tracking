package com.flighttracking.config;

import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    public CacheManager cacheManager() {
        // Simple in-memory caches; suitable for single instance (Render free tier)
        // No Redis/distributed infra. TTL handled via @Cacheable with manual eviction if needed.
        // Caches: airports, weather - stable external data, not user-specific.
        // Never cache: bookings, telemetry, auth.
        return new ConcurrentMapCacheManager("airports", "weather");
    }
}
