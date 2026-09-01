package com.flighttracking.service;

import com.flighttracking.client.AviationStackClient;
import com.flighttracking.client.AviationStackResponse;
import com.flighttracking.dto.flight.FlightSearchResponse;
import com.flighttracking.exception.ExternalApiException;
import com.flighttracking.exception.ResourceNotFoundException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FlightServiceTest {

    @Mock
    private AviationStackClient client;

    @InjectMocks
    private FlightService service;

    private AviationStackResponse sampleResponse(String flightIata, String dep, String arr) {
        AviationStackResponse.FlightData data = new AviationStackResponse.FlightData(
                "2026-09-01", "scheduled",
                new AviationStackResponse.Departure("Delhi Airport", "Asia/Kolkata", dep, "VIDP", "3", "A", null, "2026-09-01T10:00:00+0000", "2026-09-01T10:00:00+0000", null, null, null),
                new AviationStackResponse.Arrival("JFK Airport", "America/New_York", arr, "KJFK", "4", "B", null, "2026-09-01T18:00:00+0000", "2026-09-01T18:00:00+0000", null, null, null, null),
                new AviationStackResponse.Airline("IndiGo", "6E", "IGO"),
                new AviationStackResponse.Flight("123", flightIata, "IGO123", null),
                new AviationStackResponse.Aircraft("VT-ABC", "A320", "A320", "abc123"),
                null
        );
        return new AviationStackResponse(
                new AviationStackResponse.Pagination(10, 0, 1, 1),
                List.of(data),
                null
        );
    }

    @Test
    void searchSuccess() {
        when(client.searchFlights("6E123", "DEL", "JFK", null, null, 10))
                .thenReturn(sampleResponse("6E123", "DEL", "JFK"));
        FlightSearchResponse res = service.search("6E123", "DEL", "JFK", null, null, 10);
        assertThat(res.flights()).hasSize(1);
        assertThat(res.count()).isEqualTo(1);
        assertThat(res.flights().get(0).flightIata()).isEqualTo("6E123");
        assertThat(res.flights().get(0).departureIata()).isEqualTo("DEL");
    }

    @Test
    void searchInvalidIataThrows() {
        assertThatThrownBy(() -> service.search(null, "INVALID", null, null, null, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void searchExternalFailurePropagates() {
        when(client.searchFlights(null, null, null, null, null, null))
                .thenThrow(new ExternalApiException("provider down", 502));
        assertThatThrownBy(() -> service.search(null, null, null, null, null, null))
                .isInstanceOf(ExternalApiException.class);
    }

    @Test
    void getByFlightNumberSuccess() {
        when(client.getFlightsByIata("6E123"))
                .thenReturn(sampleResponse("6E123", "DEL", "JFK"));
        var dto = service.getByFlightNumber("6E123");
        assertThat(dto.flightIata()).isEqualTo("6E123");
        assertThat(dto.status()).isEqualTo("scheduled");
    }

    @Test
    void getByFlightNumberNotFound() {
        when(client.getFlightsByIata("XX999"))
                .thenReturn(new AviationStackResponse(new AviationStackResponse.Pagination(10,0,0,0), List.of(), null));
        assertThatThrownBy(() -> service.getByFlightNumber("XX999"))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void getByFlightNumberBlankThrows() {
        assertThatThrownBy(() -> service.getByFlightNumber(" "))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
