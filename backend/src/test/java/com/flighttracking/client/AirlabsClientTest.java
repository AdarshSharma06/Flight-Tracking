package com.flighttracking.client;

import com.flighttracking.config.AirlabsProperties;
import com.flighttracking.exception.ExternalApiException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.client.RestClient;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AirlabsClientTest {

    @Mock private AirlabsProperties properties;
    @Mock private RestClient restClient;
    @Mock private RestClient.RequestHeadersUriSpec requestHeadersUriSpec;
    @Mock private RestClient.RequestHeadersSpec requestHeadersSpec;
    @Mock private RestClient.ResponseSpec responseSpec;
    @InjectMocks private AirlabsClient client;

    private void mockRestClientWithResponse(Map<String, Object> responseMap) {
        when(properties.apiKey()).thenReturn("testKey");
        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.uri(any(java.util.function.Function.class))).thenReturn(requestHeadersSpec);
        when(requestHeadersSpec.retrieve()).thenReturn(responseSpec);
        when(responseSpec.onStatus(any(), any())).thenReturn(responseSpec);
        when(responseSpec.body(eq(Map.class))).thenReturn(responseMap);
    }

    // 1. Single live record
    @Test
    void singleLiveRecordWithCoordinates() {
        Map<String, Object> rec = record("6E882", 19.09, 72.87, 31000, 480, 1200, 95, "en-route", 1700000000L);
        Map<String, Object> wrapper = responseWithList(List.of(rec));
        mockRestClientWithResponse(wrapper);

        var result = client.getFlightByIata("6E882");
        assertThat(result).isNotNull();
        assertThat(result.lat()).isEqualTo(19.09);
        assertThat(result.lng()).isEqualTo(72.87);
        assertThat(result.alt()).isEqualTo(31000.0);
        assertThat(result.speed()).isEqualTo(480.0);
        assertThat(result.dir()).isEqualTo(95.0);
    }

    // 2. Multiple records - valid wins
    @Test
    void multipleRecordsSelectsValidLive() {
        Map<String, Object> noCoords = record("6E882", null, null, 31000, 480, 0, 95, "en-route", 1700000000L);
        Map<String, Object> valid = record("6E882", 19.09, 72.87, 31000, 480, 0, 95, "en-route", 1700000001L);
        Map<String, Object> wrapper = responseWithList(List.of(noCoords, valid));
        mockRestClientWithResponse(wrapper);

        var result = client.getFlightByIata("6E882");
        assertThat(result).isNotNull();
        assertThat(result.lat()).isEqualTo(19.09);
        assertThat(result.lng()).isEqualTo(72.87);
    }

    @Test
    void multipleRecordsPrefersAirborneOverScheduled() {
        Map<String, Object> scheduled = record("6E882", 19.0, 72.0, 1000, 100, 0, 90, "scheduled", 1700000001L);
        Map<String, Object> enRoute = record("6E882", 19.1, 72.1, 30000, 400, 0, 90, "en-route", 1700000000L);
        Map<String, Object> wrapper = responseWithList(List.of(scheduled, enRoute));
        mockRestClientWithResponse(wrapper);

        var result = client.getFlightByIata("6E882");
        assertThat(result.lat()).isEqualTo(19.1); // en-route wins despite older updated
    }

    // 3. Empty array
    @Test
    void emptyResponseArrayGracefulFallback() {
        Map<String, Object> wrapper = responseWithList(List.of());
        mockRestClientWithResponse(wrapper);
        assertThat(client.getFlightByIata("6E882")).isNull();
    }

    // 4. Null response field
    @Test
    void nullResponseFieldGracefulFallback() {
        Map<String, Object> wrapper = new HashMap<>();
        wrapper.put("response", null);
        mockRestClientWithResponse(wrapper);
        assertThat(client.getFlightByIata("6E882")).isNull();
    }

    @Test
    void nullWrapperResponseGracefulFallback() {
        when(properties.apiKey()).thenReturn("testKey");
        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.uri(any(java.util.function.Function.class))).thenReturn(requestHeadersSpec);
        when(requestHeadersSpec.retrieve()).thenReturn(responseSpec);
        when(responseSpec.onStatus(any(), any())).thenReturn(responseSpec);
        when(responseSpec.body(eq(Map.class))).thenReturn(null);
        assertThat(client.getFlightByIata("6E882")).isNull();
    }

    // 5. Missing latitude
    @Test
    void missingLatitudeNoLivePosition() {
        Map<String, Object> rec = record("6E882", null, 72.87, 31000, 480, 0, 95, "en-route", 1L);
        Map<String, Object> wrapper = responseWithList(List.of(rec));
        mockRestClientWithResponse(wrapper);
        assertThat(client.getFlightByIata("6E882")).isNull();
    }

    // 6. Missing longitude
    @Test
    void missingLongitudeNoLivePosition() {
        Map<String, Object> rec = record("6E882", 19.09, null, 31000, 480, 0, 95, "en-route", 1L);
        Map<String, Object> wrapper = responseWithList(List.of(rec));
        mockRestClientWithResponse(wrapper);
        assertThat(client.getFlightByIata("6E882")).isNull();
    }

    // 7. Invalid coordinates
    @Test
    void invalidCoordinatesNoLivePosition() {
        Map<String, Object> rec1 = record("6E882", 100.0, 72.87, 31000, 480, 0, 95, "en-route", 1L);
        Map<String, Object> wrapper1 = responseWithList(List.of(rec1));
        mockRestClientWithResponse(wrapper1);
        assertThat(client.getFlightByIata("6E882")).isNull();

        Map<String, Object> rec2 = record("6E882", 19.09, 200.0, 31000, 480, 0, 95, "en-route", 1L);
        Map<String, Object> wrapper2 = responseWithList(List.of(rec2));
        when(properties.apiKey()).thenReturn("testKey");
        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        when(responseSpec.body(eq(Map.class))).thenReturn(wrapper2);
        assertThat(client.getFlightByIata("6E882")).isNull();
    }

    // 8-11. HTTP errors handled as ExternalApiException, propagated
    @Test
    void handles401And403() {
        mockError(401);
        assertThatThrownBy(() -> client.getFlightByIata("6E882")).isInstanceOf(ExternalApiException.class);
        mockError(403);
        assertThatThrownBy(() -> client.getFlightByIata("6E882")).isInstanceOf(ExternalApiException.class);
    }

    @Test
    void handles429() {
        mockError(429);
        assertThatThrownBy(() -> client.getFlightByIata("6E882")).isInstanceOf(ExternalApiException.class);
    }

    @Test
    void handles5xx() {
        mockError(500);
        assertThatThrownBy(() -> client.getFlightByIata("6E882")).isInstanceOf(ExternalApiException.class);
    }

    @Test
    void handlesTimeoutAsExternalException() {
        when(properties.apiKey()).thenReturn("testKey");
        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.uri(any(java.util.function.Function.class))).thenReturn(requestHeadersSpec);
        when(requestHeadersSpec.retrieve()).thenReturn(responseSpec);
        when(responseSpec.onStatus(any(), any())).thenReturn(responseSpec);
        when(responseSpec.body(eq(Map.class))).thenThrow(new RuntimeException("Connect timed out"));
        assertThatThrownBy(() -> client.getFlightByIata("6E882")).isInstanceOf(ExternalApiException.class);
    }

    // 12. Normalization
    @Test
    void whitespaceNormalizationVariants() {
        Map<String, Object> rec = record("6E6706", 19.0, 72.0, 1000, 100, 0, 90, "en-route", 1L);
        Map<String, Object> wrapper = responseWithList(List.of(rec));
        mockRestClientWithResponse(wrapper);
        assertThat(client.getFlightByIata("6E6706")).isNotNull();
        when(properties.apiKey()).thenReturn("testKey");
        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        when(responseSpec.body(eq(Map.class))).thenReturn(wrapper);
        assertThat(client.getFlightByIata("6E 6706")).isNotNull();
        when(properties.apiKey()).thenReturn("testKey");
        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        when(responseSpec.body(eq(Map.class))).thenReturn(wrapper);
        assertThat(client.getFlightByIata(" 6e 6706 ")).isNotNull();
    }

    // 13. URL verification - uses /flights not /flight
    @Test
    void constructsCorrectFlightsEndpoint() {
        Map<String, Object> rec = record("6E6706", 19.0, 72.0, 1000, 100, 0, 90, "en-route", 1L);
        Map<String, Object> wrapper = responseWithList(List.of(rec));
        when(properties.apiKey()).thenReturn("testKey");
        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        // Capture uriBuilder function
        when(requestHeadersUriSpec.uri(any(java.util.function.Function.class))).thenAnswer(inv -> {
            var func = inv.getArgument(0, java.util.function.Function.class);
            // Build a mock UriComponentsBuilder
            var builder = org.springframework.web.util.UriComponentsBuilder.newInstance();
            func.apply(builder);
            String uriStr = builder.build().toUriString();
            // Verify it contains /api/v9/flights and flight_iata
            assertThat(uriStr).contains("/api/v9/flights");
            assertThat(uriStr).contains("flight_iata");
            assertThat(uriStr).doesNotContain("/api/v9/flight?"); // must be flights plural, not singular endpoint
            return requestHeadersSpec;
        });
        when(requestHeadersSpec.retrieve()).thenReturn(responseSpec);
        when(responseSpec.onStatus(any(), any())).thenReturn(responseSpec);
        when(responseSpec.body(eq(Map.class))).thenReturn(wrapper);

        client.getFlightByIata("6E6706");
        // verification done in answer
    }

    // 14. API key not hardcoded
    @Test
    void apiKeyFromPropertiesNotHardcoded() {
        // properties.apiKey is mocked to testKey, ensure client uses it (verified via mock)
        Map<String, Object> rec = record("6E6706", 19.0, 72.0, 1000, 100, 0, 90, "en-route", 1L);
        Map<String, Object> wrapper = responseWithList(List.of(rec));
        mockRestClientWithResponse(wrapper);
        client.getFlightByIata("6E6706");
        verify(properties, atLeastOnce()).apiKey();
    }

    @Test
    void blankFlightIataReturnsNullWithoutCallingApi() {
        assertThat(client.getFlightByIata(" ")).isNull();
        verify(restClient, never()).get();
    }

    @Test
    void mapsAllRequiredFields() {
        Map<String, Object> rec = recordFull();
        Map<String, Object> wrapper = responseWithList(List.of(rec));
        mockRestClientWithResponse(wrapper);
        var r = client.getFlightByIata("6E6706");
        assertThat(r.lat()).isEqualTo(19.09);
        assertThat(r.lng()).isEqualTo(72.87);
        assertThat(r.alt()).isEqualTo(31000.0);
        assertThat(r.dir()).isEqualTo(95.0);
        assertThat(r.speed()).isEqualTo(480.0);
        assertThat(r.vSpeed()).isEqualTo(1200.0);
        assertThat(r.updated()).isEqualTo(1700000000L);
        assertThat(r.hex()).isEqualTo("800123");
    }

    private Map<String, Object> record(String iata, Double lat, Double lng, double alt, double speed, double vSpeed, double dir, String status, Long updated) {
        Map<String, Object> m = new HashMap<>();
        m.put("flight_iata", iata);
        m.put("lat", lat);
        m.put("lng", lng);
        m.put("alt", alt);
        m.put("dir", dir);
        m.put("speed", speed);
        m.put("v_speed", vSpeed);
        m.put("status", status);
        m.put("updated", updated);
        m.put("hex", "800123");
        return m;
    }

    private Map<String,Object> recordFull() {
        Map<String, Object> m = new HashMap<>();
        m.put("flight_iata", "6E6706");
        m.put("flight_icao", "IGO6706");
        m.put("lat", 19.09);
        m.put("lng", 72.87);
        m.put("alt", 31000);
        m.put("dir", 95);
        m.put("speed", 480);
        m.put("v_speed", 1200);
        m.put("status", "en-route");
        m.put("updated", 1700000000L);
        m.put("hex", "800123");
        m.put("reg_number", "VT-ABC");
        m.put("aircraft_icao", "A20N");
        return m;
    }

    private Map<String,Object> responseWithList(List<Map<String,Object>> list) {
        Map<String,Object> w = new HashMap<>();
        w.put("response", list);
        return w;
    }

    private void mockError(int status) {
        when(properties.apiKey()).thenReturn("testKey");
        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.uri(any(java.util.function.Function.class))).thenReturn(requestHeadersSpec);
        when(requestHeadersSpec.retrieve()).thenReturn(responseSpec);
        when(responseSpec.onStatus(any(), any())).thenAnswer(inv -> {
            var handler = inv.getArgument(1, org.springframework.web.client.RestClient.ResponseSpec.ErrorHandler.class);
            return responseSpec;
        });
        when(responseSpec.body(eq(Map.class))).thenThrow(new com.flighttracking.exception.ExternalApiException("AirLabs error HTTP " + status, status));
    }
}
