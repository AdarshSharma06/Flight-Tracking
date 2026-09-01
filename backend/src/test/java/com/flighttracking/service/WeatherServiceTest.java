package com.flighttracking.service;

import com.flighttracking.client.AirportClient;
import com.flighttracking.client.OpenMeteoClient;
import com.flighttracking.dto.airport.AirportDto;
import com.flighttracking.dto.weather.WeatherDto;
import com.flighttracking.exception.ExternalApiException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WeatherServiceTest {

    @Mock
    OpenMeteoClient openMeteoClient;
    @Mock
    AirportClient airportClient;
    @InjectMocks
    WeatherService service;

    @Test
    void getByCoordinatesSuccess() {
        WeatherDto dto = new WeatherDto(28.5,77.1,"Asia/Kolkata",30.0,32.0,65.0,0.0,5.0,1,"Mainly clear","2026-09-01T10:00");
        when(openMeteoClient.getCurrentWeather(28.5,77.1)).thenReturn(dto);
        var res = service.getByCoordinates(28.5,77.1);
        assertThat(res.temperature()).isEqualTo(30.0);
        assertThat(res.weatherCondition()).isEqualTo("Mainly clear");
    }

    @Test
    void getByAirportSuccess() {
        when(airportClient.getByIata("DEL")).thenReturn(new AirportDto("DEL","VIDP","IGI","New Delhi","India",28.5665,77.1031,"Asia/Kolkata","IN"));
        WeatherDto dto = new WeatherDto(28.5665,77.1031,"Asia/Kolkata",31.0,33.0,70.0,0.0,6.0,2,"Partly cloudy","2026-09-01T10:00");
        when(openMeteoClient.getCurrentWeather(28.5665,77.1031)).thenReturn(dto);
        var res = service.getByAirport("DEL");
        assertThat(res.latitude()).isEqualTo(28.5665);
    }

    @Test
    void getByAirportInvalidIataThrows() {
        assertThatThrownBy(() -> service.getByAirport("XX"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void getByAirportNotFoundPropagates() {
        when(airportClient.getByIata("ZZZ")).thenThrow(new com.flighttracking.exception.ResourceNotFoundException("not found"));
        assertThatThrownBy(() -> service.getByAirport("ZZZ"))
                .isInstanceOf(com.flighttracking.exception.ResourceNotFoundException.class);
    }

    @Test
    void getByCoordinatesExternalFailurePropagates() {
        when(openMeteoClient.getCurrentWeather(0,0)).thenThrow(new ExternalApiException("down",502));
        assertThatThrownBy(() -> service.getByCoordinates(0,0))
                .isInstanceOf(ExternalApiException.class);
    }

    @Test
    void getByAirportMissingCoordinatesThrows() {
        when(airportClient.getByIata("DEL")).thenReturn(new AirportDto("DEL","VIDP","IGI","New Delhi","India",null,null,"Asia/Kolkata","IN"));
        assertThatThrownBy(() -> service.getByAirport("DEL"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
