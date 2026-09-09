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
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

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
        List<AirportDto> minimal = List.of(
                new AirportDto("DEL", "VIDP", "Indira Gandhi International Airport", "New Delhi", "India", 28.5665, 77.1031, "Asia/Kolkata", "IN"),
                new AirportDto("JFK", "KJFK", "John F Kennedy International Airport", "New York", "United States", 40.6413, -73.7781, "America/New_York", "US"),
                new AirportDto("LAX", "KLAX", "Los Angeles International Airport", "Los Angeles", "United States", 33.9416, -118.4085, "America/Los_Angeles", "US"),
                new AirportDto("LHR", "EGLL", "London Heathrow Airport", "London", "United Kingdom", 51.47, -0.4543, "Europe/London", "GB"),
                new AirportDto("BOS", "KBOS", "Logan International Airport", "Boston", "United States", 42.3656, -71.0096, "America/New_York", "US"),
                new AirportDto("DXB", "OMDB", "Dubai International Airport", "Dubai", "United Arab Emirates", 25.2532, 55.3657, "Asia/Dubai", "AE"),
                new AirportDto("SIN", "WSSS", "Singapore Changi Airport", "Singapore", "Singapore", 1.3644, 103.9915, "Asia/Singapore", "SG"),
                new AirportDto("BLR", "VOBL", "Kempegowda International Airport", "Bengaluru", "India", 13.1986, 77.7066, "Asia/Kolkata", "IN"),
                new AirportDto("BOM", "VABB", "Chhatrapati Shivaji Maharaj International Airport", "Mumbai", "India", 19.0896, 72.8656, "Asia/Kolkata", "IN"),
                new AirportDto("CDG", "LFPG", "Charles de Gaulle Airport", "Paris", "France", 49.0097, 2.5479, "Europe/Paris", "FR"),
                new AirportDto("FRA", "EDDF", "Frankfurt Airport", "Frankfurt", "Germany", 50.0379, 8.5622, "Europe/Berlin", "DE"),
                new AirportDto("HND", "RJTT", "Tokyo Haneda Airport", "Tokyo", "Japan", 35.5494, 139.7798, "Asia/Tokyo", "JP")
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

    public List<AirportDto> search(String query) {
        if (query == null || query.isBlank()) {
            return List.of();
        }
        String q = query.trim().toUpperCase();
        List<AirportDto> results = new ArrayList<>();

        // Exact IATA match first
        AirportDto exact = airportByIata.get(q);
        if (exact != null) {
            results.add(exact);
            return results;
        }

        // Partial matches: IATA prefix, ICAO, name, city
        String lowerQ = query.trim().toLowerCase();
        for (AirportDto a : airportByIata.values()) {
            if (results.size() >= 10) break;
            if (a.iata() != null && a.iata().toUpperCase().startsWith(q)) {
                results.add(a);
            } else if (a.icao() != null && a.icao().toUpperCase().startsWith(q)) {
                results.add(a);
            } else if (a.name() != null && a.name().toLowerCase().contains(lowerQ)) {
                results.add(a);
            } else if (a.city() != null && a.city().toLowerCase().contains(lowerQ)) {
                results.add(a);
            }
        }
        return results;
    }
}
