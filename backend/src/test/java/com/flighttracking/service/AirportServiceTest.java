package com.flighttracking.service;

import com.flighttracking.client.AirportClient;
import com.flighttracking.dto.airport.AirportDto;
import com.flighttracking.dto.flight.FlightDto;
import com.flighttracking.exception.ExternalApiException;
import com.flighttracking.exception.ResourceNotFoundException;
import com.flighttracking.provider.FlightProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AirportServiceTest {

    @Mock
    AirportClient airportClient;
    @Mock
    FlightProvider flightProvider;
    @InjectMocks
    AirportService service;

    private AirportDto sampleAirport() {
        return new AirportDto("DEL","VIDP","Indira Gandhi International Airport","New Delhi","India",28.5,77.1,"Asia/Kolkata","IN");
    }

    @Test
    void getAirportUsesFlightProviderFirst() {
        when(flightProvider.getAirportByIata("DEL")).thenReturn(Optional.of(sampleAirport()));
        var dto = service.getAirport("DEL");
        assertThat(dto.iata()).isEqualTo("DEL");
        assertThat(dto.city()).isEqualTo("New Delhi");
        verify(flightProvider).getAirportByIata("DEL");
        verify(airportClient, never()).getByIata(anyString());
    }

    @Test
    void getAirportFallsBackToLocalJsonWhenProviderEmpty() {
        when(flightProvider.getAirportByIata("DEL")).thenReturn(Optional.empty());
        when(airportClient.getByIata("DEL")).thenReturn(sampleAirport());
        var dto = service.getAirport("DEL");
        assertThat(dto.iata()).isEqualTo("DEL");
        verify(flightProvider).getAirportByIata("DEL");
        verify(airportClient).getByIata("DEL");
    }

    @Test
    void getAirportProviderExceptionPropagates() {
        when(flightProvider.getAirportByIata("DEL"))
                .thenThrow(new ExternalApiException("AeroDataBox unavailable", 502));
        assertThatThrownBy(() -> service.getAirport("DEL"))
                .isInstanceOf(ExternalApiException.class);
        verify(airportClient, never()).getByIata(anyString());
    }

    @Test
    void getAirportProviderTimeoutPropagates() {
        when(flightProvider.getAirportByIata("DEL"))
                .thenThrow(new ExternalApiException("Request timeout", 504));
        assertThatThrownBy(() -> service.getAirport("DEL"))
                .isInstanceOf(ExternalApiException.class);
        verify(airportClient, never()).getByIata(anyString());
    }

    @Test
    void getAirportInvalidIataThrows() {
        assertThatThrownBy(() -> service.getAirport("XX"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.getAirport("123"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void getAirportNotFoundPropagates() {
        when(flightProvider.getAirportByIata("ZZZ")).thenReturn(Optional.empty());
        when(airportClient.getByIata("ZZZ")).thenThrow(new ResourceNotFoundException("not found"));
        assertThatThrownBy(() -> service.getAirport("ZZZ"))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void getDeparturesSuccess() {
        FlightDto dto = new FlightDto(
                "6E123","6E123","IGO123",
                "IndiGo","6E","IGO",
                "Delhi Airport","DEL","VIDP","3","1",null,null,null,null,
                "JFK Airport","JFK","KJFK","4","B",null,null,null,null,
                "scheduled","VT-ABC","A320","a"
        );
        when(flightProvider.getAirportDepartures("DEL", 5)).thenReturn(List.of(dto));
        var flights = service.getDepartures("DEL", 5);
        assertThat(flights).hasSize(1);
        assertThat(flights.get(0).departureIata()).isEqualTo("DEL");
    }

    @Test
    void getArrivalsSuccess() {
        when(flightProvider.getAirportArrivals("DEL", null)).thenReturn(List.of());
        var flights = service.getArrivals("DEL", null);
        assertThat(flights).isEmpty();
    }

    @Test
    void getDeparturesInvalidIataThrows() {
        assertThatThrownBy(() -> service.getDepartures("AB", null))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
