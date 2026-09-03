package com.flighttracking.controller;

import com.flighttracking.ai.client.AiServiceClient;
import com.flighttracking.ai.dto.ChatRequest;
import com.flighttracking.ai.dto.ChatResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai")
public class AiController {

    private final AiServiceClient aiServiceClient;

    public AiController(AiServiceClient aiServiceClient) {
        this.aiServiceClient = aiServiceClient;
    }

    @PostMapping("/chat")
    public ResponseEntity<ChatResponse> chat(
            @Valid @RequestBody ChatRequest request,
            Authentication authentication) {

        String userId = authentication != null ? authentication.getName() : "anonymous";
        ChatResponse response = aiServiceClient.chat(request, userId);
        return ResponseEntity.ok(response);
    }
}
