package com.flighttracking.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flighttracking.config.IgnavProperties;
import com.flighttracking.dto.ignav.IgnavBookingLinksRequest;
import com.flighttracking.dto.ignav.IgnavSearchRequest;
import com.flighttracking.exception.ExternalApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.HashMap;
import java.util.Map;

@Component
public class IgnavClient {

    private static final Logger log = LoggerFactory.getLogger(IgnavClient.class);

    private final IgnavProperties properties;
    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    public IgnavClient(IgnavProperties properties, RestClient ignavRestClient, ObjectMapper objectMapper) {
        this.properties = properties;
        this.restClient = ignavRestClient;
        this.objectMapper = objectMapper;
    }

    public JsonNode search(IgnavSearchRequest req) {
        ensureApiKey();
        Map<String, Object> body = new HashMap<>();
        body.put("origin", req.origin().toUpperCase());
        body.put("destination", req.destination().toUpperCase());
        body.put("departure_date", req.departureDate());
        if (req.returnDate() != null && !req.returnDate().isBlank()) {
            body.put("return_date", req.returnDate());
        }
        body.put("adults", req.adults() != null ? req.adults() : 1);
        if (req.cabin() != null) body.put("cabin", req.cabin());
        if (req.maxStops() != null) body.put("max_stops", req.maxStops());
        if (req.market() != null) body.put("market", req.market());
        if (req.tripType() != null) body.put("trip_type", req.tripType());

        // Try primary endpoint, fallback to alternative paths
        String[] paths = {"/search", "/api/search", "/flights/search", "/v1/search"};
        Exception last = null;
        for (String p : paths) {
            try {
                log.debug("Calling Ignav search path={} body={}", p, body);
                JsonNode resp = post(p, body);
                if (resp != null) return resp;
            } catch (Exception e) {
                last = e;
                log.warn("Ignav search failed on path {}: {}", p, e.getMessage());
                // if 404, try next path
                if (e.getMessage() != null && e.getMessage().contains("404")) continue;
                throw e;
            }
        }
        throw new ExternalApiException("Ignav search failed: " + (last != null ? last.getMessage() : "unknown"), last);
    }

    public JsonNode bookingLinks(IgnavBookingLinksRequest req) {
        ensureApiKey();
        Map<String, Object> body = new HashMap<>();
        body.put("ignav_id", req.ignavId());
        // Some Ignav variants expect itinerary_id
        body.put("itinerary_id", req.ignavId());
        body.put("id", req.ignavId());

        String[] paths = {"/booking-links", "/api/booking-links", "/flights/booking-links", "/booking/links"};
        Exception last = null;
        for (String p : paths) {
            try {
                log.debug("Calling Ignav booking-links path={} ignavId={}", p, req.ignavId());
                JsonNode resp = post(p, body);
                if (resp != null) return resp;
            } catch (Exception e) {
                last = e;
                log.warn("Ignav booking-links failed on path {}: {}", p, e.getMessage());
                if (e.getMessage() != null && e.getMessage().contains("404")) continue;
                throw e;
            }
        }
        throw new ExternalApiException("Ignav booking-links failed: " + (last != null ? last.getMessage() : "unknown"), last);
    }

    private JsonNode post(String path, Map<String, Object> body) {
        try {
            String json = restClient.post()
                    .uri(path)
                    .header("x-api-key", properties.apiKey())
                    .header("X-API-Key", properties.apiKey())
                    .header("Authorization", "Bearer " + properties.apiKey())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(String.class);
            if (json == null) return objectMapper.createObjectNode();
            return objectMapper.readTree(json);
        } catch (Exception e) {
            log.error("Ignav POST {} failed: {}", path, e.getMessage());
            throw new ExternalApiException("Ignav API error on " + path + ": " + e.getMessage(), e);
        }
    }

    private void ensureApiKey() {
        if (properties.apiKey() == null || properties.apiKey().isBlank()) {
            throw new ExternalApiException("Ignav API key not configured (IGNAV_API_KEY)", 500);
        }
    }
}
