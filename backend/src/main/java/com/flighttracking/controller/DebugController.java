package com.flighttracking.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.net.ssl.SSLException;
import java.net.ConnectException;
import java.net.URI;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;

/**
 * TEMPORARY diagnostic endpoint for Render outbound connectivity to OpenSky hosts.
 * No credentials are sent, no tokens requested, no secrets logged.
 * Easy to delete after the test.
 */
@RestController
@RequestMapping("/api/debug")
public class DebugController {

    private static final Logger log = LoggerFactory.getLogger(DebugController.class);

    @Operation(summary = "OpenSky connectivity check (temporary diagnostic)", security = @SecurityRequirement(name = "bearerAuth"))
    @GetMapping("/opensky-connectivity")
    public ResponseEntity<Map<String, Object>> checkOpenskyConnectivity() {
        Map<String, Object> apiResult = checkHost("opensky-network.org", "https://opensky-network.org/api/states/all?icao24=000000");
        Map<String, Object> authResult = checkHost("auth.opensky-network.org", "https://auth.opensky-network.org/.well-known/openid-configuration");

        Map<String, Object> body = Map.of(
                "timestamp", Instant.now().toString(),
                "openskyApi", apiResult,
                "openskyAuth", authResult
        );
        // Log only safe identifiers, no secrets/headers/bodies
        log.info("DEBUG opensky-connectivity api={} auth={}", apiResult, authResult);
        return ResponseEntity.ok(body);
    }

    private Map<String, Object> checkHost(String host, String url) {
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(5))
                .GET()
                .build();
        try {
            HttpResponse<Void> response = client.send(request, HttpResponse.BodyHandlers.discarding());
            int status = response.statusCode();
            String result = (status >= 200 && status < 400) ? "REACHABLE" : "HTTP_ERROR";
            return Map.of(
                    "host", host,
                    "result", result,
                    "httpStatus", status
            );
        } catch (HttpTimeoutException e) {
            return Map.of("host", host, "result", "TIMEOUT");
        } catch (UnknownHostException e) {
            return Map.of("host", host, "result", "DNS_ERROR");
        } catch (SSLException e) {
            return Map.of("host", host, "result", "TLS_ERROR");
        } catch (ConnectException e) {
            return Map.of("host", host, "result", "CONNECTION_ERROR");
        } catch (java.net.SocketTimeoutException e) {
            return Map.of("host", host, "result", "TIMEOUT");
        } catch (Exception e) {
            // Unwrap cause for better classification
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            if (cause instanceof UnknownHostException) {
                return Map.of("host", host, "result", "DNS_ERROR");
            }
            if (cause instanceof SSLException) {
                return Map.of("host", host, "result", "TLS_ERROR");
            }
            if (cause instanceof HttpTimeoutException || cause instanceof java.net.SocketTimeoutException) {
                return Map.of("host", host, "result", "TIMEOUT");
            }
            String msg = cause.getMessage() != null ? cause.getMessage().toLowerCase() : "";
            if (msg.contains("timed out") || msg.contains("timeout")) {
                return Map.of("host", host, "result", "TIMEOUT");
            }
            if (msg.contains("connection")) {
                return Map.of("host", host, "result", "CONNECTION_ERROR");
            }
            return Map.of("host", host, "result", "CONNECTION_ERROR");
        }
    }
}
