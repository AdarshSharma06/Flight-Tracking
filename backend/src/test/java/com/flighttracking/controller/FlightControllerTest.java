package com.flighttracking.controller;

import com.flighttracking.dto.flight.FlightDto;
import com.flighttracking.dto.flight.FlightSearchResponse;
import com.flighttracking.service.FlightService;
import com.flighttracking.exception.ExternalApiException;
import com.flighttracking.exception.ResourceNotFoundException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class FlightControllerTest {

    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    FlightService flightService;

    @Autowired
    com.flighttracking.security.JwtService jwtService;
    @Autowired
    com.flighttracking.repository.UserRepository userRepository;
    @Autowired
    org.springframework.security.crypto.password.PasswordEncoder encoder;

    private String authHeader() {
        // create a test user if not exists and generate token
        String username = "flightTester";
        var userOpt = userRepository.findByUsername(username);
        if (userOpt.isEmpty()) {
            var u = new com.flighttracking.entity.User(username, encoder.encode("password123"), com.flighttracking.entity.Role.USER);
            userRepository.save(u);
        }
        return "Bearer " + jwtService.generateToken(username, "USER");
    }

    @Test
    void searchRequiresAuth() throws Exception {
        mockMvc.perform(get("/api/flights/search"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void searchSuccess() throws Exception {
        FlightDto dto = new FlightDto("123","6E123","IGO123","IndiGo","6E","IGO",
                "IGI","DEL","VIDP","3","A","2026-09-01T10:00:00+0000","2026-09-01T10:00:00+0000",null,null,
                "JFK Airport","JFK","KJFK","4","B","2026-09-01T18:00:00+0000","2026-09-01T18:00:00+0000",null,null,
                "scheduled","VT-ABC","A320","A320");
        when(flightService.search(any(), any(), any(), any(), any(), any()))
                .thenReturn(new FlightSearchResponse(List.of(dto),1));
        mockMvc.perform(get("/api/flights/search").header("Authorization", authHeader()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.flights[0].flightIata").value("6E123"))
                .andExpect(jsonPath("$.count").value(1));
    }

    @Test
    void getByFlightNumberSuccess() throws Exception {
        FlightDto dto = new FlightDto("123","6E123","IGO123","IndiGo","6E","IGO",
                "IGI","DEL","VIDP","3","A","2026-09-01T10:00:00+0000","2026-09-01T10:00:00+0000",null,null,
                "JFK","JFK","KJFK","4","B","2026-09-01T18:00:00+0000","2026-09-01T18:00:00+0000",null,null,
                "scheduled","VT-ABC","A320","A320");
        when(flightService.getByFlightNumber("6E123")).thenReturn(dto);
        mockMvc.perform(get("/api/flights/6E123").header("Authorization", authHeader()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.flightIata").value("6E123"));
    }

    @Test
    void getByFlightNumberNotFoundReturns404() throws Exception {
        when(flightService.getByFlightNumber("XX999")).thenThrow(new ResourceNotFoundException("Flight not found: XX999"));
        mockMvc.perform(get("/api/flights/XX999").header("Authorization", authHeader()))
                .andExpect(status().isNotFound());
    }

    @Test
    void externalFailureReturns502() throws Exception {
        when(flightService.search(any(), any(), any(), any(), any(), any())).thenThrow(new ExternalApiException("down",502));
        mockMvc.perform(get("/api/flights/search").header("Authorization", authHeader()))
                .andExpect(status().isBadGateway());
    }

    @Test
    void invalidIataReturns400() throws Exception {
        when(flightService.search(any(), eq("INVALID"), any(), any(), any(), any())).thenThrow(new IllegalArgumentException("dep_iata must be a 3-letter IATA code"));
        mockMvc.perform(get("/api/flights/search").param("dep_iata","INVALID").header("Authorization", authHeader()))
                .andExpect(status().isBadRequest());
    }
}
