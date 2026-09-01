package com.flighttracking.client;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flighttracking.dto.airport.AirportDto;
import com.flighttracking.exception.ResourceNotFoundException;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Airport client: primary would be an external API (AviationStack airports endpoint is
 * restricted on free tier - requires Basic plan). To keep the app functional on free tier
 * and avoid requiring a second API key, we bundle a curated airport dataset (mwgg/Airports MIT)
 * as fallback. Architecture remains replaceable: if AVIATIONSTACK_API_KEY has paid access,
 * this client can be extended to call external API first.
 */
@Component
public class AirportClient {

    private static final Logger log = LoggerFactory.getLogger(AirportClient.class);

    private final Map<String, AirportDto> airportByIata = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper;

    public AirportClient(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    public void load() {
        try {
            ClassPathResource resource = new ClassPathResource("data/airports.json");
            if (!resource.exists()) {
                log.warn("data/airports.json not found on classpath - airport lookup will rely on fallback minimal set");
                loadMinimalFallback();
                return;
            }
            try (InputStream is = resource.getInputStream()) {
                List<AirportDto> list = objectMapper.readValue(is, new TypeReference<>() {});
                for (AirportDto a : list) {
                    if (a.iata() != null && !a.iata().isBlank()) {
                        airportByIata.put(a.iata().toUpperCase(), a);
                    }
                }
                log.info("Loaded {} airports from data/airports.json", airportByIata.size());
            }
        } catch (Exception e) {
            log.error("Failed to load airports.json, using minimal fallback", e);
            loadMinimalFallback();
        }
        if (airportByIata.isEmpty()) {
            loadMinimalFallback();
        }
    }

    private void loadMinimalFallback() {
        // Minimal curated set for testing when resource missing - covers required test cases
        List<AirportDto> minimal = List.of(
                new AirportDto("DEL", "VIDP", "Indira Gandhi International Airport", "New Delhi", "India", 28.5665, 77.1031, "Asia/Kolkata", "IN"),
                new AirportDto("JFK", "KJFK", "John F Kennedy International Airport", "New York", "United States", 40.6413, -73.7781, "America/New_York", "US"),
                new AirportDto("LAX", "KLAX", "Los Angeles International Airport", "Los Angeles", "United States", 33.9416, -118.4085, "America/Los_Angeles", "US"),
                new AirportDto("LHR", "EGLL", "London Heathrow Airport", "London", "United Kingdom", 51.47, -0.4543, "Europe/London", "GB"),
                new AirportDto("BOS", "KBOS", "Logan International Airport", "Boston", "United States", 42.3656, -71.0096, "America/New_York", "US"),
                new AirportDto("DXB", "OMDB", "Dubai International Airport", "Dubai", "United Arab Emirates", 25.2532, 55.3657, "Asia/Dubai", "AE"),
                new AirportDto("SIN", "WSSS", "Singapore Changi Airport", "Singapore", "Singapore", 1.3644, 103.9915, "Asia/Singapore", "SG")
        );
        for (AirportDto a : minimal) {
            airportByIata.put(a.iata(), a);
        }
        log.info("Loaded minimal fallback {} airports", minimal.size());
    }

    public AirportDto getByIata(String iata) {
        if (iata == null || !iata.matches("(?i)^[A-Z]{3}$")) {
            throw new IllegalArgumentException("Invalid IATA code: must be 3 letters");
        }
        String key = iata.toUpperCase();
        AirportDto dto = airportByIata.get(key);
        if (dto == null) {
            throw new ResourceNotFoundException("Airport not found for IATA: " + key);
        }
        return dto;
    }

    public boolean exists(String iata) {
        return airportByIata.containsKey(iata.toUpperCase());
    }
}
