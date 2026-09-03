package com.flighttracking.ai.client;

import com.flighttracking.ai.dto.AiHealthResponse;
import com.flighttracking.ai.dto.ChatRequest;
import com.flighttracking.ai.dto.ChatResponse;
import com.flighttracking.exception.ExternalApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
public class AiServiceClient {

    private static final Logger log = LoggerFactory.getLogger(AiServiceClient.class);

    private final RestClient restClient;

    public AiServiceClient(RestClient aiServiceRestClient) {
        this.restClient = aiServiceRestClient;
    }

    public AiHealthResponse healthCheck() {
        try {
            log.debug("Checking AI service health");
            AiHealthResponse response = restClient.get()
                    .uri("/health")
                    .retrieve()
                    .body(AiHealthResponse.class);

            if (response == null) {
                throw new ExternalApiException("Empty response from AI service", 502);
            }
            return response;
        } catch (RestClientException e) {
            log.error("AI service health check failed: {}", e.getMessage());
            throw new ExternalApiException("Failed to connect to AI service: " + e.getMessage(), e);
        }
    }

    public ChatResponse chat(ChatRequest request, String userId) {
        try {
            log.debug("Sending chat request to AI service");
            ChatResponse response = restClient.post()
                    .uri("/api/ai/chat")
                    .header("X-User-Id", userId != null ? userId : "anonymous")
                    .body(request)
                    .retrieve()
                    .body(ChatResponse.class);

            if (response == null) {
                throw new ExternalApiException("Empty response from AI service", 502);
            }
            return response;
        } catch (RestClientException e) {
            log.error("AI service chat request failed: {}", e.getMessage());
            throw new ExternalApiException("AI service error: " + e.getMessage(), e);
        }
    }
}