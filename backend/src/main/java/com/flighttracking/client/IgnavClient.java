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

import java.nio.charset.StandardCharsets;
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
        if (req.cabin() != null) body.put("cabin_class", req.cabin());
        if (req.maxStops() != null) body.put("max_stops", req.maxStops());
        if (req.market() != null) body.put("market", req.market());

        log.debug("Calling Ignav /fares/one-way body={}", body);
        return post("/fares/one-way", body);
    }

    public JsonNode bookingLinks(IgnavBookingLinksRequest req) {
        ensureApiKey();
        Map<String, Object> body = new HashMap<>();
        body.put("ignav_id", req.ignavId());

        log.debug("Calling Ignav /fares/booking-links ignavId={}", req.ignavId());
        return post("/fares/booking-links", body);
    }

    private JsonNode post(String path, Map<String, Object> body) {
        try {
            byte[] bytes = restClient.post()
                    .uri(path)
                    .header("X-Api-Key", properties.apiKey())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(byte[].class);
            if (bytes == null || bytes.length == 0) return objectMapper.createObjectNode();
            String json = new String(bytes, StandardCharsets.UTF_8);
            if (json.isBlank()) return objectMapper.createObjectNode();
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
