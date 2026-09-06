package com.flighttracking.client;

import com.flighttracking.config.AirlabsProperties;
import com.flighttracking.exception.ExternalApiException;
import com.flighttracking.util.FlightNumberUtils;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * AirLabs live telemetry client.
 * Live lookup: GET /api/v9/flights?flight_iata={IATA}&_fields=...&api_key={key}
 * Real-Time Flights API returns live ADS-B records as array in "response".
 * Server-side only, API key via query param, no secret logging.
 */
@Component
public class AirlabsClient {

    private static final Logger log = LoggerFactory.getLogger(AirlabsClient.class);

    private static final String LIVE_FIELDS = "flight_iata,flight_icao,hex,reg_number,lat,lng,alt,speed,v_speed,dir,status,updated,aircraft_icao,airline_iata,airline_icao,dep_iata,dep_icao,arr_iata,arr_icao";

    private final AirlabsProperties properties;
    private final RestClient restClient;

    public AirlabsClient(AirlabsProperties properties, RestClient airlabsRestClient) {
        this.properties = properties;
        this.restClient = airlabsRestClient;
    }

    /**
     * Live flight lookup via Real-Time Flights endpoint.
     * One tracking request -> at most one AirLabs call.
     * Returns selected live record or null if no valid live position.
     */
    public AirlabsFlight getFlightByIata(String flightIata) {
        return getLiveFlightByIata(flightIata);
    }

    public AirlabsFlight getLiveFlightByIata(String flightIata) {
        String normalized = FlightNumberUtils.normalize(flightIata);
        if (normalized == null || normalized.isBlank()) {
            log.info("AIRLABS_TRACKING flight={} result=NO_LIVE_POSITION reason=blank_flight_iata", flightIata);
            return null;
        }
        if (properties.apiKey() == null || properties.apiKey().isBlank()) {
            log.warn("AIRLABS_TRACKING flight={} result=PROVIDER_ERROR reason=missing_api_key", normalized);
            throw new ExternalApiException("AirLabs API key not configured", 503);
        }
        try {
            Map response = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/api/v9/flights")
                            .queryParam("flight_iata", normalized)
                            .queryParam("_fields", LIVE_FIELDS)
                            .queryParam("api_key", properties.apiKey())
                            .build())
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, (req, res) -> {
                        int status = res.getStatusCode().value();
                        String msg = "AirLabs error HTTP " + status;
                        throw new ExternalApiException(msg, status);
                    })
                    .body(Map.class);

            if (response == null) {
                log.info("AIRLABS_TRACKING flight={} result=PROVIDER_ERROR reason=null_response", normalized);
                return null;
            }
            Object error = response.get("error");
            if (error != null) {
                log.warn("AIRLABS_TRACKING flight={} result=PROVIDER_ERROR error={}", normalized, safeError(error));
                return null;
            }
            Object respObj = response.get("response");
            if (respObj == null) {
                log.info("AIRLABS_TRACKING flight={} result=NO_LIVE_POSITION records=0 reason=null_response", normalized);
                return null;
            }
            List<Map<String, Object>> records = toRecordList(respObj);
            if (records.isEmpty()) {
                log.info("AIRLABS_TRACKING flight={} result=NO_LIVE_POSITION records=0", normalized);
                return null;
            }
            // Filter to exact flight_iata match (normalized upper)
            List<Map<String, Object>> matched = new ArrayList<>();
            for (Map<String, Object> m : records) {
                String fi = toString(m.get("flight_iata"));
                if (fi != null && FlightNumberUtils.normalize(fi).equals(normalized)) {
                    matched.add(m);
                }
            }
            List<Map<String, Object>> candidates = matched.isEmpty() ? records : matched;
            log.info("AIRLABS_TRACKING flight={} result=RECEIVED records={} matched={}", normalized, records.size(), matched.size());

            // Select best live record
            Map<String, Object> best = selectBest(candidates);
            if (best == null) {
                log.info("AIRLABS_TRACKING flight={} result=NO_LIVE_POSITION reason=no_valid_coordinates", normalized);
                return null;
            }
            AirlabsFlight flight = mapToFlight(best);
            // Validate coordinates
            if (!isValidCoordinate(flight.lat(), flight.lng())) {
                log.info("AIRLABS_TRACKING flight={} result=NO_LIVE_POSITION reason=invalid_or_missing_coordinates latPresent={} lngPresent={}", normalized, flight.lat() != null, flight.lng() != null);
                return null;
            }
            log.info("AIRLABS_TRACKING flight={} result=LIVE_POSITION_FOUND latPresent=true lngPresent=true status={} updated={}", normalized, flight.status(), flight.updated());
            return flight;

        } catch (ExternalApiException e) {
            int status = e.getStatus();
            String result = (status == 429 || status == 401 || status == 403) ? "PROVIDER_ERROR" : "PROVIDER_ERROR";
            log.warn("AIRLABS_TRACKING flight={} result={} status={}", normalized, result, status);
            throw e;
        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage().toLowerCase() : "";
            if (msg.contains("timed out") || msg.contains("timeout")) {
                log.warn("AIRLABS_TRACKING flight={} result=TIMEOUT", normalized);
            } else if (msg.contains("unable to resolve") || msg.contains("unknownhost") || msg.contains("dns")) {
                log.warn("AIRLABS_TRACKING flight={} result=DNS_ERROR", normalized);
            } else if (msg.contains("certificate") || msg.contains("ssl") || msg.contains("tls")) {
                log.warn("AIRLABS_TRACKING flight={} result=TLS_ERROR", normalized);
            } else if (msg.contains("connection")) {
                log.warn("AIRLABS_TRACKING flight={} result=CONNECTION_ERROR", normalized);
            } else {
                log.warn("AIRLABS_TRACKING flight={} result=CONNECTION_ERROR type={}", normalized, e.getClass().getSimpleName());
            }
            throw new ExternalApiException("AirLabs API error: " + e.getMessage(), e);
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> toRecordList(Object respObj) {
        List<Map<String, Object>> list = new ArrayList<>();
        if (respObj instanceof List<?> l) {
            for (Object o : l) {
                if (o instanceof Map<?, ?> m) {
                    list.add((Map<String, Object>) m);
                }
            }
        } else if (respObj instanceof Map<?, ?> m) {
            // Single object case (defensive, though /flights should be array)
            if (!((Map<?, ?>) m).isEmpty()) {
                list.add((Map<String, Object>) m);
            }
        }
        return list;
    }

    private Map<String, Object> selectBest(List<Map<String, Object>> records) {
        // Filter to those with valid coordinates first
        List<Map<String, Object>> valid = new ArrayList<>();
        for (Map<String, Object> m : records) {
            Double lat = toDouble(m.get("lat"));
            Double lng = toDouble(m.get("lng"));
            if (isValidCoordinate(lat, lng)) {
                valid.add(m);
            }
        }
        if (valid.isEmpty()) return null;
        // Score and sort
        valid.sort(Comparator
                .comparingInt((Map<String, Object> m) -> score(m)).reversed()
                .thenComparing(m -> toLong(m.get("updated")) != null ? -toLong(m.get("updated")) : Long.MAX_VALUE)
        );
        return valid.get(0);
    }

    private int score(Map<String, Object> m) {
        int s = 0;
        String status = toString(m.get("status"));
        if (status != null) {
            String st = status.trim().toLowerCase();
            if (st.equals("en-route") || st.equals("en_route") || st.equals("enroute") || st.equals("active") || st.equals("airborne") || st.equals("in_air")) {
                s += 10;
            }
        }
        // Completeness
        if (m.get("lat") != null && m.get("lng") != null) s += 5;
        if (m.get("alt") != null) s += 1;
        if (m.get("speed") != null) s += 1;
        if (m.get("dir") != null) s += 1;
        if (m.get("hex") != null) s += 1;
        return s;
    }

    private boolean isValidCoordinate(Double lat, Double lng) {
        if (lat == null || lng == null) return false;
        if (lat < -90.0 || lat > 90.0) return false;
        if (lng < -180.0 || lng > 180.0) return false;
        return true;
    }

    private String safeError(Object error) {
        if (error == null) return "unknown";
        String s = error.toString();
        // Never include api_key
        if (s.toLowerCase().contains("api_key") || s.toLowerCase().contains("apikey")) return "error_filtered";
        // Truncate
        return s.length() > 200 ? s.substring(0, 200) : s;
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
