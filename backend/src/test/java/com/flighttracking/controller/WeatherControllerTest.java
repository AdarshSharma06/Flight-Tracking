package com.flighttracking.controller;

import com.flighttracking.dto.weather.WeatherDto;
import com.flighttracking.exception.ExternalApiException;
import com.flighttracking.service.WeatherService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class WeatherControllerTest {

    @Autowired MockMvc mockMvc;
    @MockitoBean WeatherService weatherService;
    @Autowired com.flighttracking.security.JwtService jwtService;
    @Autowired com.flighttracking.repository.UserRepository userRepository;
    @Autowired org.springframework.security.crypto.password.PasswordEncoder encoder;

    private String auth() {
        String u="weatherTester";
        if(userRepository.findByUsername(u).isEmpty()){
            userRepository.save(new com.flighttracking.entity.User(u, encoder.encode("password123"), com.flighttracking.entity.Role.USER));
        }
        return "Bearer "+jwtService.generateToken(u,"USER");
    }

    @Test
    void weatherRequiresAuth() throws Exception {
        mockMvc.perform(get("/api/weather").param("latitude","28.5").param("longitude","77.1"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void weatherByCoordinatesSuccess() throws Exception {
        WeatherDto dto = new WeatherDto(28.5,77.1,"Asia/Kolkata",30.0,32.0,65.0,0.0,5.0,1,"Mainly clear","2026-09-01T10:00");
        when(weatherService.getByCoordinates(28.5,77.1)).thenReturn(dto);
        mockMvc.perform(get("/api/weather").param("latitude","28.5").param("longitude","77.1").header("Authorization",auth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.temperature").value(30.0))
                .andExpect(jsonPath("$.weatherCondition").value("Mainly clear"));
    }

    @Test
    void weatherMissingParams400() throws Exception {
        mockMvc.perform(get("/api/weather").header("Authorization",auth()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void weatherInvalidCoordinates400() throws Exception {
        when(weatherService.getByCoordinates(200,0)).thenThrow(new IllegalArgumentException("Latitude must be between -90 and 90"));
        mockMvc.perform(get("/api/weather").param("latitude","200").param("longitude","0").header("Authorization",auth()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void weatherByAirportSuccess() throws Exception {
        WeatherDto dto = new WeatherDto(28.5665,77.1031,"Asia/Kolkata",31.0,33.0,70.0,0.0,6.0,2,"Partly cloudy","2026-09-01T10:00");
        when(weatherService.getByAirport("DEL")).thenReturn(dto);
        mockMvc.perform(get("/api/weather/airport/DEL").header("Authorization",auth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.temperature").value(31.0));
    }

    @Test
    void weatherExternalFailure502() throws Exception {
        when(weatherService.getByCoordinates(28.5,77.1)).thenThrow(new ExternalApiException("down",502));
        mockMvc.perform(get("/api/weather").param("latitude","28.5").param("longitude","77.1").header("Authorization",auth()))
                .andExpect(status().isBadGateway());
    }
}
