package com.flighttracking.client;

import com.flighttracking.config.AviationStackProperties;
import com.flighttracking.exception.ExternalApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;

@Component
public class AviationStackClient {

    private static final Logger log = LoggerFactory.getLogger(AviationStackClient.class);

    private final AviationStackProperties properties;
    private final RestClient restClient;

    public AviationStackClient(AviationStackProperties properties, RestClient aviationStackRestClient) {
        this.properties = properties;
        this.restClient = aviationStackRestClient;
    }

    public AviationStackResponse searchFlights(String flightIata, String depIata, String arrIata,
                                               String airlineIata, String flightStatus, Integer limit) {
        UriComponentsBuilder builder = UriComponentsBuilder.fromPath("/flights")
                .queryParam("access_key", properties.apiKey());
        if (flightIata != null && !flightIata.isBlank()) builder.queryParam("flight_iata", flightIata);
        if (depIata != null && !depIata.isBlank()) builder.queryParam("dep_iata", depIata);
        if (arrIata != null && !arrIata.isBlank()) builder.queryParam("arr_iata", arrIata);
        if (airlineIata != null && !airlineIata.isBlank()) builder.queryParam("airline_iata", airlineIata);
        if (flightStatus != null && !flightStatus.isBlank()) builder.queryParam("flight_status", flightStatus);
        if (limit != null) builder.queryParam("limit", limit);

        URI uri = URI.create(builder.toUriString());
        return execute(uri);
    }

    public AviationStackResponse getFlightsByIata(String iata) {
        return searchFlights(iata, null, null, null, null, 10);
    }

    private AviationStackResponse execute(URI uri) {
        if (properties.apiKey() == null || properties.apiKey().isBlank() || properties.apiKey().equals("test-key") || properties.apiKey().equals("demo")) {
            log.warn("AviationStack API key not configured (using placeholder) - uri={}", uri);
        }
        try {
            log.debug("Calling AviationStack: {}", uri);
            AviationStackResponse response = restClient.get()
                    .uri(uri)
                    .retrieve()
                    .body(AviationStackResponse.class);

            if (response == null) {
                throw new ExternalApiException("Empty response from AviationStack", 502);
            }
            if (response.error() != null) {
                String code = response.error().code();
                String msg = response.error().message();
                log.error("AviationStack error: {} - {}", code, msg);
                int status = switch (code) {
                    case "invalid_access_key", "inactive_user" -> 401;
                    case "https_access_restricted", "function_access_restricted" -> 403;
                    case "404_not_found", "invalid_api_function" -> 404;
                    case "usage_limit_reached", "rate_limit_reached" -> 429;
                    default -> 502;
                };
                throw new ExternalApiException("AviationStack error: " + code + " - " + msg, status);
            }
            return response;
        } catch (ExternalApiException e) {
            throw e;
        } catch (RestClientException e) {
            log.error("AviationStack request failed: {}", e.getMessage());
            throw new ExternalApiException("Failed to fetch from AviationStack: " + e.getMessage(), e);
        }
    }
}
