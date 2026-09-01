package com.flighttracking.service;

import com.flighttracking.client.AirportClient;
import com.flighttracking.client.AviationStackClient;
import com.flighttracking.client.AviationStackResponse;
import com.flighttracking.dto.airport.AirportDto;
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
class AirportServiceTest {

    @Mock
    AirportClient airportClient;
    @Mock
    AviationStackClient aviationStackClient;
    @InjectMocks
    AirportService service;

    @Test
    void getAirportSuccess() {
        when(airportClient.getByIata("DEL")).thenReturn(new AirportDto("DEL","VIDP","Indira Gandhi","New Delhi","India",28.5,77.1,"Asia/Kolkata","IN"));
        var dto = service.getAirport("DEL");
        assertThat(dto.iata()).isEqualTo("DEL");
        assertThat(dto.city()).isEqualTo("New Delhi");
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
        when(airportClient.getByIata("ZZZ")).thenThrow(new ResourceNotFoundException("not found"));
        assertThatThrownBy(() -> service.getAirport("ZZZ"))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void getDeparturesSuccess() {
        AviationStackResponse resp = new AviationStackResponse(
                new AviationStackResponse.Pagination(10,0,1,1),
                List.of(new AviationStackResponse.FlightData(
                        "2026-09-01","scheduled",
                        new AviationStackResponse.Departure("DEL Airport","Asia/Kolkata","DEL","VIDP","3","1",null,"2026-09-01T10:00:00+0000","2026-09-01T10:00:00+0000",null,null,null),
                        new AviationStackResponse.Arrival("JFK Airport","America/New_York","JFK","KJFK","4","B",null,"2026-09-01T18:00:00+0000","2026-09-01T18:00:00+0000",null,null,null,null),
                        new AviationStackResponse.Airline("IndiGo","6E","IGO"),
                        new AviationStackResponse.Flight("123","6E123","IGO123",null),
                        new AviationStackResponse.Aircraft("VT-ABC","A320","A320","a"),
                        null
                )), null
        );
        when(aviationStackClient.searchFlights(null,"DEL",null,null,null,5)).thenReturn(resp);
        var flights = service.getDepartures("DEL", 5);
        assertThat(flights).hasSize(1);
        assertThat(flights.get(0).departureIata()).isEqualTo("DEL");
    }

    @Test
    void getArrivalsSuccess() {
        AviationStackResponse resp = new AviationStackResponse(
                new AviationStackResponse.Pagination(10,0,0,0), List.of(), null
        );
        when(aviationStackClient.searchFlights(null,null,"DEL",null,null,null)).thenReturn(resp);
        var flights = service.getArrivals("DEL", null);
        assertThat(flights).isEmpty();
    }

    @Test
    void getDeparturesInvalidIataThrows() {
        assertThatThrownBy(() -> service.getDepartures("AB", null))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
