package com.flighttracking.controller;

import com.flighttracking.dto.airport.AirportDto;
import com.flighttracking.exception.ResourceNotFoundException;
import com.flighttracking.service.AirportService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class AirportControllerTest {

    @Autowired MockMvc mockMvc;
    @MockitoBean AirportService airportService;
    @Autowired com.flighttracking.security.JwtService jwtService;
    @Autowired com.flighttracking.repository.UserRepository userRepository;
    @Autowired org.springframework.security.crypto.password.PasswordEncoder encoder;

    private String auth() {
        String u = "airportTester";
        if (userRepository.findByUsername(u).isEmpty()) {
            userRepository.save(new com.flighttracking.entity.User(u, encoder.encode("password123"), com.flighttracking.entity.Role.USER));
        }
        return "Bearer " + jwtService.generateToken(u, "USER");
    }

    @Test
    void airportRequiresAuth() throws Exception {
        mockMvc.perform(get("/api/airports/DEL")).andExpect(status().isUnauthorized());
    }

    @Test
    void getAirportSuccess() throws Exception {
        when(airportService.getAirport("DEL")).thenReturn(new AirportDto("DEL","VIDP","IGI","New Delhi","India",28.5665,77.1031,"Asia/Kolkata","IN"));
        mockMvc.perform(get("/api/airports/DEL").header("Authorization", auth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.iata").value("DEL"))
                .andExpect(jsonPath("$.name").value("IGI"));
    }

    @Test
    void getAirportInvalidIata400() throws Exception {
        when(airportService.getAirport("XX")).thenThrow(new IllegalArgumentException("IATA code must be 3 letters"));
        mockMvc.perform(get("/api/airports/XX").header("Authorization", auth()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getAirportNotFound404() throws Exception {
        when(airportService.getAirport("ZZZ")).thenThrow(new ResourceNotFoundException("Airport not found for IATA: ZZZ"));
        mockMvc.perform(get("/api/airports/ZZZ").header("Authorization", auth()))
                .andExpect(status().isNotFound());
    }

    @Test
    void departuresSuccess() throws Exception {
        when(airportService.getDepartures("DEL", null)).thenReturn(List.of());
        mockMvc.perform(get("/api/airports/DEL/departures").header("Authorization", auth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.airport").value("DEL"))
                .andExpect(jsonPath("$.type").value("departures"));
    }

    @Test
    void arrivalsSuccess() throws Exception {
        when(airportService.getArrivals("DEL", null)).thenReturn(List.of());
        mockMvc.perform(get("/api/airports/DEL/arrivals").header("Authorization", auth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("arrivals"));
    }
}
