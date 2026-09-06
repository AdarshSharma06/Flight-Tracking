package com.flighttracking.controller;

import com.flighttracking.repository.UserRepository;
import com.flighttracking.security.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class DebugControllerTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JwtService jwtService;

    @Autowired
    UserRepository userRepository;

    @Autowired
    org.springframework.security.crypto.password.PasswordEncoder encoder;

    private String authHeader() {
        String username = "debugTester";
        var userOpt = userRepository.findByUsername(username);
        if (userOpt.isEmpty()) {
            var u = new com.flighttracking.entity.User(username, encoder.encode("password123"), com.flighttracking.entity.Role.USER);
            userRepository.save(u);
        }
        return "Bearer " + jwtService.generateToken(username, "USER");
    }

    @Test
    void connectivityRequiresAuth() throws Exception {
        mockMvc.perform(get("/api/debug/opensky-connectivity"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void connectivityReturnsExpectedStructure() throws Exception {
        mockMvc.perform(get("/api/debug/opensky-connectivity").header("Authorization", authHeader()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.timestamp").exists())
                .andExpect(jsonPath("$.openskyApi.host").value("opensky-network.org"))
                .andExpect(jsonPath("$.openskyApi.result").exists())
                .andExpect(jsonPath("$.openskyAuth.host").value("auth.opensky-network.org"))
                .andExpect(jsonPath("$.openskyAuth.result").exists());
        // httpStatus may or may not be present depending on TIMEOUT/DNS etc, but host/result must exist
    }

    @Test
    void connectivityResultsAreWhitelisted() throws Exception {
        String json = mockMvc.perform(get("/api/debug/opensky-connectivity").header("Authorization", authHeader()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        // Ensure no secret leakage in response body
        String lower = json.toLowerCase();
        // these strings should never appear
        assert !lower.contains("client_secret");
        assert !lower.contains("api_key");
        assert !lower.contains("authorization");
        assert !lower.contains("bearer");
        assert !lower.contains("password");
        // result must be one of allowed values
        assert json.contains("REACHABLE") || json.contains("TIMEOUT") || json.contains("DNS_ERROR")
                || json.contains("TLS_ERROR") || json.contains("CONNECTION_ERROR") || json.contains("HTTP_ERROR");
    }
}
