package com.flighttracking;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.flighttracking.dto.booking.BookingRequest;
import com.flighttracking.repository.BookingRepository;
import com.flighttracking.repository.UserRepository;
import com.flighttracking.repository.TelemetryRepository;
import com.flighttracking.repository.AnomalyRecordRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class HardeningTest {

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired UserRepository userRepository;
    @Autowired BookingRepository bookingRepository;
    @Autowired TelemetryRepository telemetryRepository;
    @Autowired AnomalyRecordRepository anomalyRecordRepository;

    @BeforeEach
    void clean() {
        anomalyRecordRepository.deleteAll();
        telemetryRepository.deleteAll();
        bookingRepository.deleteAll();
        userRepository.deleteAll();
    }

    private String registerAndLogin(String u) throws Exception {
        mockMvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new com.flighttracking.dto.RegisterRequest(u, "password123"))))
                .andExpect(status().isCreated());
        var res = mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new com.flighttracking.dto.LoginRequest(u, "password123"))))
                .andExpect(status().isOk()).andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString()).get("token").asText();
    }

    @Test
    void openApiDocsAccessible() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk());
    }

    @Test
    void validationReturns400ConsistentStructure() throws Exception {
        String token = registerAndLogin("valUser");
        // invalid booking: origin too short (should be 3 letters, but @Pattern requires 3 letters)
        BookingRequest bad = new BookingRequest("6E123", "D", "JFK", null, null, null, null);
        mockMvc.perform(post("/api/bookings").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(bad)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.error").exists())
                .andExpect(jsonPath("$.path").exists())
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    void paginationForBookings() throws Exception {
        String token = registerAndLogin("pageUser");
        for (int i = 0; i < 3; i++) {
            BookingRequest r = new BookingRequest("6E10" + i, "DEL", "JFK", null, null, null, null);
            mockMvc.perform(post("/api/bookings").header("Authorization", "Bearer " + token)
                            .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(r)))
                    .andExpect(status().isCreated());
        }
        // paginated request
        mockMvc.perform(get("/api/bookings").param("page", "0").param("size", "2").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray())
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(2));

        // invalid pagination -> 400
        mockMvc.perform(get("/api/bookings").param("page", "-1").param("size", "2").header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/bookings").param("page", "0").param("size", "100").header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest());
    }

    @Test
    void noStackTraceOnServerError() throws Exception {
        // malformed JSON
        String token = registerAndLogin("stackUser");
        mockMvc.perform(post("/api/bookings").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content("{ invalid json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Malformed request body"));
        // ensure no stack trace in response
        var res = mockMvc.perform(post("/api/bookings").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content("{ invalid json"))
                .andExpect(status().isBadRequest()).andReturn();
        String body = res.getResponse().getContentAsString();
        org.assertj.core.api.Assertions.assertThat(body).doesNotContain("stackTrace");
        org.assertj.core.api.Assertions.assertThat(body).doesNotContain("at com.flighttracking");
    }

    @Test
    void corsHeadersAvailable() throws Exception {
        // Simple CORS check: OPTIONS preflight should be handled
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options("/api/health")
                        .header("Origin", "http://localhost:3000")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isOk());
    }
}
