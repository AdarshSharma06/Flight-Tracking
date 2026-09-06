package com.flighttracking.client;

import com.flighttracking.config.AerodataboxProperties;
import com.flighttracking.exception.ExternalApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Component
public class AerodataboxClient {

    private static final Logger log = LoggerFactory.getLogger(AerodataboxClient.class);

    private final AerodataboxProperties properties;
    private final RestClient restClient;

    public AerodataboxClient(AerodataboxProperties properties, RestClient aerodataboxRestClient) {
        this.properties = properties;
        this.restClient = aerodataboxRestClient;
    }

    // --- Flight Endpoints ---

    public List<AerodataboxResponse.FlightContract> getFlightByNumber(String flightNumber) {
        LocalDate today = LocalDate.now();
        String dateFrom = today.minusDays(1).format(DateTimeFormatter.ISO_LOCAL_DATE);
        String dateTo = today.plusDays(3).format(DateTimeFormatter.ISO_LOCAL_DATE);
        return getFlightsByDateRange("number", flightNumber, dateFrom, dateTo);
    }

    public List<AerodataboxResponse.FlightContract> getFlightByNumberOnDate(String flightNumber, String date) {
        UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(properties.baseUrl())
                .path("/flights/number/{flightNumber}/{date}")
                .queryParam("withLocation", true);

        URI uri = URI.create(builder.buildAndExpand(flightNumber, date).toUriString());
        AerodataboxResponse.FlightContract[] response = executeGet(uri, AerodataboxResponse.FlightContract[].class);
        return response != null ? List.of(response) : List.of();
    }

    public List<AerodataboxResponse.FlightContract> getFlightsByDateRange(String searchBy, String searchParam,
                                                                           String dateFrom, String dateTo) {
        UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(properties.baseUrl())
                .path("/flights/{searchBy}/{searchParam}/{dateFrom}/{dateTo}");

        URI uri = URI.create(builder.buildAndExpand(searchBy, searchParam, dateFrom, dateTo).toUriString());
        AerodataboxResponse.FlightContract[] response = executeGet(uri, AerodataboxResponse.FlightContract[].class);
        return response != null ? List.of(response) : List.of();
    }

    // --- FIDS Endpoints (Airport Departures/Arrivals) ---

    public AerodataboxResponse.AirportFidsContract getAirportFids(String iataCode, String direction) {
        long offsetMinutes = -120;
        long durationMinutes = 720;

        UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(properties.baseUrl())
                .path("/flights/airports/iata/{code}")
                .queryParam("offsetMinutes", offsetMinutes)
                .queryParam("durationMinutes", durationMinutes)
                .queryParam("withLeg", true)
                .queryParam("withCancelled", true)
                .queryParam("withCodeshared", false);

        if (direction != null) {
            builder.queryParam("direction", direction);
        }

        URI uri = URI.create(builder.buildAndExpand(iataCode).toUriString());
        return executeGet(uri, AerodataboxResponse.AirportFidsContract.class);
    }

    // --- Airport Endpoint ---

    public AerodataboxResponse.AirportContract getAirportByIata(String iataCode) {
        UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(properties.baseUrl())
                .path("/airports/iata/{code}");

        URI uri = URI.create(builder.buildAndExpand(iataCode).toUriString());
        return executeGet(uri, AerodataboxResponse.AirportContract.class);
    }

    // --- Generic Execute ---

    private <T> T executeGet(URI uri, Class<T> responseType) {
        if (properties.apiKey() == null || properties.apiKey().isBlank()) {
            log.warn("AeroDataBox API key not configured - uri={}", uri);
        }
        try {
            log.debug("Calling AeroDataBox: {}", uri);
            T response = restClient.get()
                    .uri(uri)
                    .header("x-api-market-key", properties.apiKey())
                    .retrieve()
                    .body(responseType);
            return response;
        } catch (Exception e) {
            log.error("AeroDataBox request failed: {} - uri={}", e.getMessage(), uri);
            throw new ExternalApiException("AeroDataBox API error: " + e.getMessage(), e);
        }
    }
}
