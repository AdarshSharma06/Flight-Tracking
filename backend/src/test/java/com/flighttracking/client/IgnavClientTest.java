package com.flighttracking.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.flighttracking.config.IgnavProperties;
import com.flighttracking.dto.ignav.IgnavBookingLinksRequest;
import com.flighttracking.dto.ignav.IgnavSearchRequest;
import com.flighttracking.exception.ExternalApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class IgnavClientTest {

    @Mock private IgnavProperties properties;
    @Mock private RestClient restClient;
    @Mock private RestClient.RequestBodyUriSpec requestBodyUriSpec;
    @Mock private RestClient.RequestBodySpec requestBodySpec;
    private ObjectMapper objectMapper = new ObjectMapper();
    private IgnavClient client;

    @BeforeEach
    void setUp() {
        client = new IgnavClient(properties, restClient, objectMapper);
    }

    @SuppressWarnings("unchecked")
    private void mockExchange(String json, MediaType contentType, HttpStatus status) throws Exception {
        when(properties.apiKey()).thenReturn("testKey");
        when(restClient.post()).thenReturn(requestBodyUriSpec);
        when(requestBodyUriSpec.uri(anyString())).thenReturn(requestBodySpec);
        when(requestBodySpec.header(eq("X-Api-Key"), anyString())).thenReturn(requestBodySpec);
        when(requestBodySpec.contentType(any(MediaType.class))).thenReturn(requestBodySpec);
        doReturn(requestBodySpec).when(requestBodySpec).body(any(Object.class));
        when(requestBodySpec.exchange(any())).thenAnswer(inv -> {
            RestClient.RequestHeadersSpec.ExchangeFunction<com.fasterxml.jackson.databind.JsonNode> func = inv.getArgument(0);
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(contentType);
            byte[] bytes = json != null ? json.getBytes(contentType != null && contentType.getCharset() != null ? contentType.getCharset() : StandardCharsets.UTF_8) : new byte[0];
            RestClient.RequestHeadersSpec.ConvertibleClientHttpResponse mockResponse = mock(RestClient.RequestHeadersSpec.ConvertibleClientHttpResponse.class);
            when(mockResponse.getStatusCode()).thenReturn(status);
            when(mockResponse.getHeaders()).thenReturn(headers);
            when(mockResponse.getBody()).thenReturn(new ByteArrayInputStream(bytes));
            return func.exchange(null, mockResponse);
        });
    }

    @Test
    void bookingLinks_octetStream_withValidJson_succeeds() throws Exception {
        String json = "{\"booking_options\":[{\"leg_indexes\":[0],\"links\":[{\"provider_name\":\"TestAir\",\"url\":\"https://example.com/book\"}]}]}";
        mockExchange(json, MediaType.valueOf("application/octet-stream"), HttpStatus.OK);
        var result = client.bookingLinks(new IgnavBookingLinksRequest("test-id-123"));
        assertThat(result).isNotNull();
        assertThat(result.has("booking_options")).isTrue();
    }

    @Test
    void bookingLinks_jsonContentType_succeeds() throws Exception {
        String json = "{\"booking_options\":[{\"leg_indexes\":[0],\"links\":[{\"provider_name\":\"TestAir\",\"url\":\"https://example.com/book\"}]}]}";
        mockExchange(json, MediaType.APPLICATION_JSON, HttpStatus.OK);
        var result = client.bookingLinks(new IgnavBookingLinksRequest("test-id-123"));
        assertThat(result).isNotNull();
        assertThat(result.has("booking_options")).isTrue();
    }

    @Test
    void bookingLinks_non2xx_throws() throws Exception {
        String json = "{\"error\":\"not found\"}";
        mockExchange(json, MediaType.APPLICATION_JSON, HttpStatus.NOT_FOUND);
        assertThatThrownBy(() -> client.bookingLinks(new IgnavBookingLinksRequest("bad-id")))
                .isInstanceOf(ExternalApiException.class)
                .hasMessageContaining("HTTP 404");
    }

    @Test
    void bookingLinks_malformedJson_throwsControlledError() throws Exception {
        String json = "not a json {{{";
        mockExchange(json, MediaType.valueOf("application/octet-stream"), HttpStatus.OK);
        assertThatThrownBy(() -> client.bookingLinks(new IgnavBookingLinksRequest("test-id")))
                .isInstanceOf(ExternalApiException.class)
                .hasMessageContaining("invalid response format");
    }

    @Test
    void fareSearch_stillWorks_withJson() throws Exception {
        String json = "{\"itineraries\":[{\"ignav_id\":\"abc\",\"legs\":[]}]}";
        when(properties.apiKey()).thenReturn("testKey");
        when(restClient.post()).thenReturn(requestBodyUriSpec);
        when(requestBodyUriSpec.uri(eq("/fares/one-way"))).thenReturn(requestBodySpec);
        when(requestBodySpec.header(eq("X-Api-Key"), anyString())).thenReturn(requestBodySpec);
        when(requestBodySpec.contentType(any(MediaType.class))).thenReturn(requestBodySpec);
        doReturn(requestBodySpec).when(requestBodySpec).body(any(Object.class));
        when(requestBodySpec.exchange(any())).thenAnswer(inv -> {
            RestClient.RequestHeadersSpec.ExchangeFunction<com.fasterxml.jackson.databind.JsonNode> func = inv.getArgument(0);
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
            RestClient.RequestHeadersSpec.ConvertibleClientHttpResponse mockResponse = mock(RestClient.RequestHeadersSpec.ConvertibleClientHttpResponse.class);
            when(mockResponse.getStatusCode()).thenReturn(HttpStatus.OK);
            when(mockResponse.getHeaders()).thenReturn(headers);
            when(mockResponse.getBody()).thenReturn(new ByteArrayInputStream(bytes));
            return func.exchange(null, mockResponse);
        });
        var req = new IgnavSearchRequest("BOM","DEL","2026-09-15",null,1,null,null,null,null);
        var result = client.search(req);
        assertThat(result).isNotNull();
        assertThat(result.has("itineraries")).isTrue();
    }
}
