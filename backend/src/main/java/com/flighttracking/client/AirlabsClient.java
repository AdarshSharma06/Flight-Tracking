package com.flighttracking.client;

import com.flighttracking.config.AirlabsProperties;
import com.flighttracking.exception.ExternalApiException;
import com.flighttracking.util.FlightNumberUtils;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * AirLabs live telemetry client.
 * Single flight lookup: GET /api/v9/flight?flight_iata={IATA}&api_key={key}
 * Server-side only, API key via query param, no secret logging.
 */
@Component
public class AirlabsClient {

    private static final Logger log = LoggerFactory.getLogger(AirlabsClient.class);

    private final AirlabsProperties properties;
    private final RestClient restClient;

    public AirlabsClient(AirlabsProperties properties, RestClient airlabsRestClient) {
        this.properties = properties;
        this.restClient = airlabsRestClient;
    }

    public AirlabsFlight getFlightByIata(String flightIata) {
        String normalized = FlightNumberUtils.normalize(flightIata);
        if (normalized == null || normalized.isBlank()) {
            return null;
        }
        if (properties.apiKey() == null || properties.apiKey().isBlank()) {
            log.warn("AirLabs API key not configured - flight={}", normalized);
            throw new ExternalApiException("AirLabs API key not configured", 503);
        }
        try {
            // Build URI with RestClient builder to ensure encoding; api_key via query param
            Map response = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/api/v9/flight")
                            .queryParam("flight_iata", normalized)
                            .queryParam("api_key", properties.apiKey())
                            .build())
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, (req, res) -> {
                        int status = res.getStatusCode().value();
                        String msg = "AirLabs error HTTP " + status;
                        // Do not include api_key or headers in message
                        throw new ExternalApiException(msg, status);
                    })
                    .body(Map.class);

            if (response == null) return null;
            // AirLabs wraps payload in "response" field; also may contain "error"
            Object error = response.get("error");
            if (error != null) {
                // e.g., {"error":{"code":"rate_limit","message":"..."}}
                log.warn("AirLabs returned error for flight {}: {}", normalized, error);
                // Treat rate_limit / not found as graceful empty
                return null;
            }
            Object respObj = response.get("response");
            if (respObj == null) return null;
            if (respObj instanceof Map<?, ?> map) {
                // Empty response object means flight not found
                if (map.isEmpty()) return null;
                return mapToFlight((Map<String, Object>) map);
            }
            return null;
        } catch (ExternalApiException e) {
            throw e;
        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage().toLowerCase() : "";
            // Classify for safe log without secrets
            if (msg.contains("timed out") || msg.contains("timeout")) {
                log.warn("AirLabs live tracking unavailable for flight {}: TIMEOUT", normalized);
            } else if (msg.contains("unable to resolve") || msg.contains("unknownhost")) {
                log.warn("AirLabs live tracking unavailable for flight {}: DNS_ERROR", normalized);
            } else {
                log.warn("AirLabs live tracking unavailable for flight {}: {}", normalized, e.getClass().getSimpleName());
            }
            throw new ExternalApiException("AirLabs API error: " + e.getMessage(), e);
        }
    }

    private AirlabsFlight mapToFlight(Map<String, Object> m) {
        return new AirlabsFlight(
                toString(m.get("flight_iata")),
                toString(m.get("flight_icao")),
                toDouble(m.get("lat")),
                toDouble(m.get("lng")),
                toDouble(m.get("alt")),
                toDouble(m.get("dir")),
                toDouble(m.get("speed")),
                toDouble(m.get("v_speed")),
                toString(m.get("status")),
                toLong(m.get("updated")),
                toString(m.get("hex")),
                toString(m.get("reg_number")),
                toString(m.get("aircraft_icao")),
                toString(m.get("airline_iata")),
                toString(m.get("airline_icao")),
                toString(m.get("dep_iata")),
                toString(m.get("dep_icao")),
                toString(m.get("arr_iata")),
                toString(m.get("arr_icao"))
        );
    }

    private String toString(Object v) {
        if (v == null) return null;
        String s = v.toString().trim();
        return s.isEmpty() || "null".equalsIgnoreCase(s) ? null : s;
    }

    private Double toDouble(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.doubleValue();
        try { return Double.parseDouble(v.toString()); } catch (Exception e) { return null; }
    }

    private Long toLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(v.toString()); } catch (Exception e) { return null; }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record AirlabsFlight(
            String flightIata,
            String flightIcao,
            Double lat,
            Double lng,
            Double alt,
            Double dir,
            Double speed,
            Double vSpeed,
            String status,
            Long updated,
            String hex,
            String regNumber,
            String aircraftIcao,
            String airlineIata,
            String airlineIcao,
            String depIata,
            String depIcao,
            String arrIata,
            String arrIcao
    ) {}
}
