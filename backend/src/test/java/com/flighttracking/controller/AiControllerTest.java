package com.flighttracking.controller;

import com.flighttracking.ai.client.AiServiceClient;
import com.flighttracking.ai.dto.ChatRequest;
import com.flighttracking.ai.dto.ChatResponse;
import com.flighttracking.entity.Role;
import com.flighttracking.entity.User;
import com.flighttracking.repository.UserRepository;
import com.flighttracking.security.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class AiControllerTest {

    @Autowired MockMvc mockMvc;
    @MockitoBean AiServiceClient aiServiceClient;
    @Autowired JwtService jwtService;
    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder encoder;

    private String auth() {
        String u = "aiTester";
        if (userRepository.findByUsername(u).isEmpty()) {
            userRepository.save(new User(u, encoder.encode("password123"), Role.USER));
        }
        return "Bearer " + jwtService.generateToken(u, "USER");
    }

    @Test
    void chatRequiresAuth() throws Exception {
        mockMvc.perform(post("/api/ai/chat")
                        .contentType("application/json")
                        .content("{\"message\":\"What is an airport?\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void chatEmptyMessageReturns400() throws Exception {
        mockMvc.perform(post("/api/ai/chat")
                        .contentType("application/json")
                        .content("{\"message\":\"\"}")
                        .header("Authorization", auth()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void chatMissingMessageReturns400() throws Exception {
        mockMvc.perform(post("/api/ai/chat")
                        .contentType("application/json")
                        .content("{}")
                        .header("Authorization", auth()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void chatSuccessWithMockedClient() throws Exception {
        ChatResponse mockResponse = new ChatResponse(
                "An airport is a facility for aircraft operations.",
                "gpt-4o-mini",
                "req-test-123",
                null
        );
        when(aiServiceClient.chat(any(ChatRequest.class), anyString()))
                .thenReturn(mockResponse);

        mockMvc.perform(post("/api/ai/chat")
                        .contentType("application/json")
                        .content("{\"message\":\"What is an airport?\"}")
                        .header("Authorization", auth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.answer").value("An airport is a facility for aircraft operations."))
                .andExpect(jsonPath("$.model").value("gpt-4o-mini"))
                .andExpect(jsonPath("$.requestId").value("req-test-123"));
    }

    @Test
    void chatResponseShapeMatchesContract() {
        ChatResponse resp = new ChatResponse("answer", "model", "req-id", null);
        assert resp.answer().equals("answer");
        assert resp.model().equals("model");
        assert resp.requestId().equals("req-id");
        assert resp.conversationId() == null;
    }
}
