package com.flighttracking.client;

import com.flighttracking.config.OpenSkyProperties;
import com.flighttracking.exception.ExternalApiException;
import com.flighttracking.provider.TrackingProvider;
import com.flighttracking.provider.TrackingProvider.LiveTrackingData;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

@Component
public class OpenSkyClient implements TrackingProvider {

    private static final Logger log = LoggerFactory.getLogger(OpenSkyClient.class);

    private final OpenSkyProperties properties;
    private final RestClient restClient;

    private final AtomicReference<CachedToken> tokenCache = new AtomicReference<>();

    public OpenSkyClient(OpenSkyProperties properties, RestClient openSkyRestClient) {
        this.properties = properties;
        this.restClient = openSkyRestClient;
    }

    @Override
    public Optional<LiveTrackingData> getByIcao24(String icao24) {
        if (icao24 == null || icao24.isBlank()) return Optional.empty();
        requireCredentials();
        return fetchStates(icao24.trim().toLowerCase())
                .map(this::mapStateToTracking);
    }

    @Override
    public Optional<LiveTrackingData> getByCallsign(String callsign) {
        if (callsign == null || callsign.isBlank()) return Optional.empty();
        requireCredentials();
        try {
            Map<String, Object> response = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/states/all")
                            .queryParam("callsign", callsign.trim().toUpperCase())
                            .build())
                    .headers(h -> h.setBearerAuth(getOrRefreshToken()))
                    .retrieve()
                    .body(Map.class);
            if (response == null) return Optional.empty();
            return extractFirstState(response)
                    .map(this::mapStateToTracking);
        } catch (ExternalApiException e) {
            throw e;
        } catch (Exception e) {
            log.warn("OpenSky callsign lookup failed for {}: {}", callsign, e.getMessage());
            return Optional.empty();
        }
    }

    private Optional<Map<String, Object>> fetchStates(String icao24) {
        try {
            Map<String, Object> response = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/states/all")
                            .queryParam("icao24", icao24)
                            .build())
                    .headers(h -> h.setBearerAuth(getOrRefreshToken()))
                    .retrieve()
                    .body(Map.class);
            if (response == null) return Optional.empty();
            return extractFirstState(response);
        } catch (ExternalApiException e) {
            throw e;
        } catch (Exception e) {
            log.warn("OpenSky state lookup failed for {}: {}", icao24, e.getMessage());
            return Optional.empty();
        }
    }

    @SuppressWarnings("unchecked")
    private Optional<Map<String, Object>> extractFirstState(Map<String, Object> response) {
        Object states = response.get("states");
        if (states instanceof java.util.List<?> list && !list.isEmpty()) {
            Object first = list.get(0);
            if (first instanceof java.util.List<?> stateArray) {
                return Optional.of(parseStateArray(stateArray));
            }
        }
        return Optional.empty();
    }

    private Map<String, Object> parseStateArray(java.util.List<?> arr) {
        Map<String, Object> map = new HashMap<>();
        String[] keys = {
                "icao24", "callsign", "originCountry", "timePosition", "lastContact",
                "longitude", "latitude", "baroAltitude", "onGround", "velocity",
                "trueTrack", "verticalRate", "sensors", "geoAltitude", "squawk",
                "spi", "positionSource", "category"
        };
        for (int i = 0; i < keys.length && i < arr.size(); i++) {
            map.put(keys[i], arr.get(i));
        }
        return map;
    }

    private LiveTrackingData mapStateToTracking(Map<String, Object> state) {
        return new LiveTrackingData(
                toString(state.get("icao24")),
                toString(state.get("callsign")),
                toString(state.get("originCountry")),
                toDouble(state.get("longitude")),
                toDouble(state.get("latitude")),
                toDouble(state.get("baroAltitude")),
                toDouble(state.get("geoAltitude")),
                toDouble(state.get("velocity")),
                toDouble(state.get("trueTrack")),
                toDouble(state.get("verticalRate")),
                toString(state.get("squawk")),
                toBoolean(state.get("onGround")),
                toLong(state.get("lastContact"))
        );
    }

    private String toString(Object val) {
        if (val == null) return null;
        String s = val.toString().trim();
        return s.isEmpty() || "null".equals(s) ? null : s;
    }

    private Double toDouble(Object val) {
        if (val == null) return null;
        if (val instanceof Number n) return n.doubleValue();
        try { return Double.parseDouble(val.toString()); } catch (Exception e) { return null; }
    }

    private Boolean toBoolean(Object val) {
        if (val == null) return null;
        if (val instanceof Boolean b) return b;
        return Boolean.parseBoolean(val.toString());
    }

    private Long toLong(Object val) {
        if (val == null) return null;
        if (val instanceof Number n) return n.longValue();
        try { return Long.parseLong(val.toString()); } catch (Exception e) { return null; }
    }

    // --- OAuth2 Token Management ---

    private void requireCredentials() {
        if (properties.clientId() == null || properties.clientId().isBlank()
                || properties.clientSecret() == null || properties.clientSecret().isBlank()) {
            throw new ExternalApiException(
                    "OpenSky credentials not configured (OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET)", 503);
        }
    }

    private String getOrRefreshToken() {
        requireCredentials();
        CachedToken cached = tokenCache.get();
        if (cached != null && Instant.now().isBefore(cached.expiresAt())) {
            return cached.token();
        }
        return refreshToken();
    }

    private synchronized String refreshToken() {
        CachedToken cached = tokenCache.get();
        if (cached != null && Instant.now().isBefore(cached.expiresAt())) {
            return cached.token();
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> tokenResponse = restClient.post()
                    .uri("https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token")
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .body("grant_type=client_credentials&client_id=" + properties.clientId()
                            + "&client_secret=" + properties.clientSecret())
                    .retrieve()
                    .body(Map.class);
            if (tokenResponse == null) {
                log.error("OpenSky token response was null");
                return null;
            }
            String token = (String) tokenResponse.get("access_token");
            Number expiresIn = (Number) tokenResponse.getOrDefault("expires_in", 1800);
            Instant expiresAt = Instant.now().plusSeconds(expiresIn.longValue() - 30);
            tokenCache.set(new CachedToken(token, expiresAt));
            log.debug("OpenSky OAuth2 token refreshed, valid for {}s", expiresIn);
            return token;
        } catch (Exception e) {
            log.error("Failed to refresh OpenSky OAuth2 token: {}", e.getMessage());
            return null;
        }
    }

    private record CachedToken(String token, Instant expiresAt) {}

    @Override
    public String getProviderName() {
        return "OpenSky";
    }
}
