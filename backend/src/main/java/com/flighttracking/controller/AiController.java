package com.flighttracking.controller;

import com.flighttracking.ai.client.AiServiceClient;
import com.flighttracking.ai.dto.ChatRequest;
import com.flighttracking.ai.dto.ChatResponse;
import com.flighttracking.ai.dto.RecommendationRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

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
            Authentication authentication,
            @org.springframework.web.bind.annotation.RequestHeader(value = "X-Request-ID", required = false) String requestId,
            jakarta.servlet.http.HttpServletRequest httpRequest) {

        // Prefer header, fall back to filter's attribute, then generate
        String rid = requestId;
        if (rid == null || rid.isBlank()) {
            Object attr = httpRequest.getAttribute("X-Request-ID");
            rid = attr != null ? attr.toString() : null;
        }
        String userId = authentication != null ? authentication.getName() : "anonymous";
        ChatResponse response = aiServiceClient.chat(request, userId, rid);
        return ResponseEntity.ok()
                .header("X-Request-ID", rid != null ? rid : "")
                .body(response);
    }

    @PostMapping("/recommend")
    public ResponseEntity<Map<String, Object>> recommend(
            @Valid @RequestBody RecommendationRequest request,
            Authentication authentication,
            @org.springframework.web.bind.annotation.RequestHeader(value = "X-Request-ID", required = false) String requestId,
            jakarta.servlet.http.HttpServletRequest httpRequest) {

        String rid = requestId;
        if (rid == null || rid.isBlank()) {
            Object attr = httpRequest.getAttribute("X-Request-ID");
            rid = attr != null ? attr.toString() : null;
        }
        String userId = authentication != null ? authentication.getName() : "anonymous";
        Map<String, Object> response = aiServiceClient.recommend(request, userId, rid);
        return ResponseEntity.ok()
                .header("X-Request-ID", rid != null ? rid : "")
                .body(response);
    }
}
