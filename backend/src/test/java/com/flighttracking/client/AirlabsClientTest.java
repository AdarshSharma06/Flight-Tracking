package com.flighttracking.client;

import com.flighttracking.config.AirlabsProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AirlabsClientTest {

    @Mock
    private AirlabsProperties properties;

    @Mock
    private RestClient restClient;

    @Mock
    private RestClient.RequestHeadersUriSpec requestHeadersUriSpec;

    @Mock
    private RestClient.RequestHeadersSpec requestHeadersSpec;

    @Mock
    private RestClient.ResponseSpec responseSpec;

    @InjectMocks
    private AirlabsClient client;

    private void mockRestClientWithResponse(Map<String, Object> responseMap) {
        when(properties.apiKey()).thenReturn("testKey");
        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.uri(any(java.util.function.Function.class))).thenAnswer(inv -> {
            // capture uriBuilder function but not needed
            return requestHeadersSpec;
        });
        when(requestHeadersSpec.retrieve()).thenReturn(responseSpec);
        when(responseSpec.onStatus(any(), any())).thenReturn(responseSpec);
        when(responseSpec.body(eq(Map.class))).thenReturn(responseMap);
    }

    @Test
    void constructsCorrectEndpointWithNormalizedFlightIata() {
        Map<String, Object> inner = new HashMap<>();
        inner.put("flight_iata", "6E6706");
        inner.put("lat", 19.0);
        inner.put("lng", 72.0);
        Map<String, Object> wrapper = new HashMap<>();
        wrapper.put("response", inner);
        mockRestClientWithResponse(wrapper);

        var result = client.getFlightByIata("6E6706");
        assertThat(result).isNotNull();
        assertThat(result.flightIata()).isEqualTo("6E6706");
        assertThat(result.lat()).isEqualTo(19.0);
        assertThat(result.lng()).isEqualTo(72.0);

        // Verify with whitespace normalization
        Map<String, Object> inner2 = new HashMap<>();
        inner2.put("flight_iata", "6E6706");
        inner2.put("lat", 19.0);
        Map<String, Object> wrapper2 = new HashMap<>();
        wrapper2.put("response", inner2);
        // reset mocks for second call
        when(properties.apiKey()).thenReturn("testKey");
        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        when(responseSpec.body(eq(Map.class))).thenReturn(wrapper2);

        var result2 = client.getFlightByIata("6E 6706");
        assertThat(result2).isNotNull();
        assertThat(result2.flightIata()).isEqualTo("6E6706");
    }

    @Test
    void whitespaceNormalizationVariants() {
        Map<String, Object> inner = new HashMap<>();
        inner.put("flight_iata", "6E6706");
        Map<String, Object> wrapper = new HashMap<>();
        wrapper.put("response", inner);
        mockRestClientWithResponse(wrapper);

        // All these should normalize to 6E6706 and not throw
        assertThat(client.getFlightByIata("6E6706")).isNotNull();
        // second call needs re-mock
        when(properties.apiKey()).thenReturn("testKey");
        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        when(responseSpec.body(eq(Map.class))).thenReturn(wrapper);
        assertThat(client.getFlightByIata("6E 6706")).isNotNull();

        when(properties.apiKey()).thenReturn("testKey");
        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        when(responseSpec.body(eq(Map.class))).thenReturn(wrapper);
        assertThat(client.getFlightByIata(" 6e 6706 ")).isNotNull();
    }

    @Test
    void mapsLatLngAltSpeedDirVSpeedUpdated() {
        Map<String, Object> inner = new HashMap<>();
        inner.put("flight_iata", "6E6706");
        inner.put("flight_icao", "IGO6706");
        inner.put("lat", 19.09);
        inner.put("lng", 72.87);
        inner.put("alt", 31000);
        inner.put("dir", 95);
        inner.put("speed", 480);
        inner.put("v_speed", 1200);
        inner.put("status", "en-route");
        inner.put("updated", 1700000000L);
        inner.put("hex", "800123");
        Map<String, Object> wrapper = new HashMap<>();
        wrapper.put("response", inner);
        mockRestClientWithResponse(wrapper);

        var result = client.getFlightByIata("6E6706");
        assertThat(result.lat()).isEqualTo(19.09);
        assertThat(result.lng()).isEqualTo(72.87);
        assertThat(result.alt()).isEqualTo(31000.0);
        assertThat(result.dir()).isEqualTo(95.0);
        assertThat(result.speed()).isEqualTo(480.0);
        assertThat(result.vSpeed()).isEqualTo(1200.0);
        assertThat(result.updated()).isEqualTo(1700000000L);
        assertThat(result.flightIcao()).isEqualTo("IGO6706");
        assertThat(result.hex()).isEqualTo("800123");
    }

    @Test
    void missingLatLngReturnsNull() {
        Map<String, Object> inner = new HashMap<>();
        inner.put("flight_iata", "6E6706");
        inner.put("alt", 31000);
        // no lat/lng
        Map<String, Object> wrapper = new HashMap<>();
        wrapper.put("response", inner);
        mockRestClientWithResponse(wrapper);

        var result = client.getFlightByIata("6E6706");
        assertThat(result.lat()).isNull();
        assertThat(result.lng()).isNull();
        assertThat(result.alt()).isEqualTo(31000.0);
    }

    @Test
    void missingOptionalFieldsDoNotCrash() {
        Map<String, Object> inner = new HashMap<>();
        inner.put("flight_iata", "6E6706");
        inner.put("lat", 19.0);
        Map<String, Object> wrapper = new HashMap<>();
        wrapper.put("response", inner);
        mockRestClientWithResponse(wrapper);

        var result = client.getFlightByIata("6E6706");
        assertThat(result.lat()).isEqualTo(19.0);
        assertThat(result.speed()).isNull();
        assertThat(result.dir()).isNull();
    }

    @Test
    void emptyResponseReturnsNull() {
        Map<String, Object> wrapper = new HashMap<>();
        wrapper.put("response", new HashMap<>());
        mockRestClientWithResponse(wrapper);

        var result = client.getFlightByIata("6E6706");
        assertThat(result).isNull();
    }

    @Test
    void nullResponseReturnsNull() {
        Map<String, Object> wrapper = new HashMap<>();
        wrapper.put("response", null);
        mockRestClientWithResponse(wrapper);

        var result = client.getFlightByIata("6E6706");
        assertThat(result).isNull();
    }

    @Test
    void blankFlightIataReturnsNullWithoutCallingApi() {
        var result = client.getFlightByIata(" ");
        assertThat(result).isNull();
        verify(restClient, never()).get();
    }

    @Test
    void handles429And401AsExternalApiException() {
        when(properties.apiKey()).thenReturn("testKey");
        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.uri(any(java.util.function.Function.class))).thenReturn(requestHeadersSpec);
        when(requestHeadersSpec.retrieve()).thenReturn(responseSpec);
        when(responseSpec.onStatus(any(), any())).thenAnswer(inv -> {
            // simulate error handler throwing
            var handler = inv.getArgument(1, org.springframework.web.client.RestClient.ResponseSpec.ErrorHandler.class);
            // we don't invoke handler; instead mock body to throw
            return responseSpec;
        });
        when(responseSpec.body(eq(Map.class))).thenThrow(new com.flighttracking.exception.ExternalApiException("AirLabs error HTTP 429", 429));

        assertThatThrownBy(() -> client.getFlightByIata("6E6706"))
                .isInstanceOf(com.flighttracking.exception.ExternalApiException.class);
    }
}
