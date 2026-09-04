package com.flighttracking.controller;

import com.flighttracking.ai.client.AiServiceClient;
import com.flighttracking.ai.dto.AtcExplanationRequest;
import com.flighttracking.ai.dto.AtcExplanationResponse;
import com.flighttracking.dto.MessageResponse;
import com.flighttracking.dto.PageResponse;
import com.flighttracking.dto.anomaly.AnomalyRequest;
import com.flighttracking.dto.anomaly.AnomalyResponse;
import com.flighttracking.dto.telemetry.TelemetryRequest;
import com.flighttracking.dto.telemetry.TelemetryResponse;
import com.flighttracking.dto.weather.WeatherDto;
import com.flighttracking.exception.ExternalApiException;
import com.flighttracking.exception.ResourceNotFoundException;
import com.flighttracking.service.AnomalyRecordService;
import com.flighttracking.service.TelemetryService;
import com.flighttracking.service.WeatherService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/atc")
public class AtcController {

    private static final Logger log = LoggerFactory.getLogger(AtcController.class);

    private final TelemetryService telemetryService;
    private final AnomalyRecordService anomalyRecordService;
    private final AiServiceClient aiServiceClient;
    private final WeatherService weatherService;

    public AtcController(TelemetryService telemetryService, AnomalyRecordService anomalyRecordService,
                         AiServiceClient aiServiceClient, WeatherService weatherService) {
        this.telemetryService = telemetryService;
        this.anomalyRecordService = anomalyRecordService;
        this.aiServiceClient = aiServiceClient;
        this.weatherService = weatherService;
    }

    @GetMapping("/test")
    public ResponseEntity<MessageResponse> atcAccess() {
        return ResponseEntity.ok(new MessageResponse("ATC employee access successful"));
    }

    // ---- Telemetry ----

    @PostMapping("/telemetry")
    public ResponseEntity<TelemetryResponse> createTelemetry(@Valid @RequestBody TelemetryRequest request) {
        TelemetryResponse response = telemetryService.create(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @Operation(summary = "List telemetry", description = "ATC only. Supports pagination via page/size.", security = @SecurityRequirement(name = "bearerAuth"))
    @GetMapping("/telemetry")
    public ResponseEntity<?> getTelemetry(
            @RequestParam(required = false) String flightNumber,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        if (page != null || size != null) {
            int p = page != null ? page : 0;
            int s = size != null ? size : 10;
            PageResponse<TelemetryResponse> paged = PageResponse.of(telemetryService.getAllPaginated(flightNumber, p, s));
            return ResponseEntity.ok(paged);
        }
        List<TelemetryResponse> list = telemetryService.getAll(flightNumber);
        return ResponseEntity.ok(list);
    }

    @GetMapping("/telemetry/{id}")
    public ResponseEntity<TelemetryResponse> getTelemetryById(@PathVariable Long id) {
        TelemetryResponse response = telemetryService.getById(id);
        return ResponseEntity.ok(response);
    }

    // ---- Anomaly Records ----

    @PostMapping("/anomalies")
    public ResponseEntity<AnomalyResponse> createAnomaly(@Valid @RequestBody AnomalyRequest request) {
        AnomalyResponse response = anomalyRecordService.create(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @Operation(summary = "List anomaly records", description = "ATC only. Supports pagination via page/size.", security = @SecurityRequirement(name = "bearerAuth"))
    @GetMapping("/anomalies")
    public ResponseEntity<?> getAnomalies(
            @RequestParam(required = false) String flightNumber,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        if (page != null || size != null) {
            int p = page != null ? page : 0;
            int s = size != null ? size : 10;
            PageResponse<AnomalyResponse> paged = PageResponse.of(anomalyRecordService.getAllPaginated(flightNumber, p, s));
            return ResponseEntity.ok(paged);
        }
        List<AnomalyResponse> list = anomalyRecordService.getAll(flightNumber);
        return ResponseEntity.ok(list);
    }

    @GetMapping("/anomalies/{id}")
    public ResponseEntity<AnomalyResponse> getAnomalyById(@PathVariable Long id) {
        AnomalyResponse response = anomalyRecordService.getById(id);
        return ResponseEntity.ok(response);
    }

    @PatchMapping("/anomalies/{id}/status")
    public ResponseEntity<AnomalyResponse> updateAnomalyStatus(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        String status = body.get("status");
        if (status == null || status.isBlank()) {
            throw new IllegalArgumentException("status is required");
        }
        AnomalyResponse response = anomalyRecordService.updateStatus(id, status);
        return ResponseEntity.ok(response);
    }

    // ---- AI Explanation (AI-7) ----

    @Operation(summary = "AI explanation of an anomaly",
            description = "ATC only. Returns a grounded natural-language explanation of an existing anomaly.",
            security = @SecurityRequirement(name = "bearerAuth"))
    @PostMapping("/anomalies/{id}/explain")
    public ResponseEntity<AtcExplanationResponse> explainAnomaly(
            @PathVariable Long id,
            Authentication authentication) {

        String userId = authentication != null ? authentication.getName() : "anonymous";

        AnomalyResponse anomaly = anomalyRecordService.getById(id);

        AtcExplanationRequest.TelemetryData telemetryData = null;
        AtcExplanationRequest.WeatherData weatherData = null;
        var limitations = new java.util.ArrayList<String>();

        if (anomaly.telemetryId() != null) {
            try {
                TelemetryResponse t = telemetryService.getById(anomaly.telemetryId());
                telemetryData = new AtcExplanationRequest.TelemetryData(
                        t.id(), t.flightNumber(), t.originIata(), t.destinationIata(),
                        t.latitude(), t.longitude(), t.altitude(), t.speed(),
                        t.direction(), t.heading(), t.flightStatus(),
                        t.aircraftRegistration(), t.recordedAt() != null ? t.recordedAt().toString() : null
                );
                if (t.originIata() != null && !t.originIata().isBlank()) {
                    try {
                        WeatherDto w = weatherService.getByAirport(t.originIata());
                        weatherData = new AtcExplanationRequest.WeatherData(
                                w.temperature(), w.windSpeed(), w.humidity(),
                                w.precipitation(), w.weatherCondition()
                        );
                    } catch (Exception e) {
                        log.debug("Could not fetch weather for anomaly {}: {}", id, e.getMessage());
                        limitations.add("Weather data unavailable for origin airport " + t.originIata());
                    }
                }
            } catch (Exception e) {
                log.debug("Could not fetch telemetry {} for anomaly {}: {}", anomaly.telemetryId(), id, e.getMessage());
                limitations.add("Linked telemetry record is unavailable");
            }
        } else {
            limitations.add("No telemetry data is linked to this anomaly");
        }

        AtcExplanationRequest aiRequest = new AtcExplanationRequest(
                id,
                anomaly.flightNumber(),
                anomaly.anomalyType(),
                anomaly.severity(),
                anomaly.description(),
                anomaly.status(),
                anomaly.detectedAt() != null ? anomaly.detectedAt().toString() : null,
                telemetryData,
                weatherData,
                limitations
        );

        AtcExplanationResponse response;
        try {
            response = aiServiceClient.explainAnomaly(aiRequest, userId);
        } catch (ExternalApiException e) {
            log.debug("AI explanation unavailable for anomaly {}: {}", id, e.getMessage());
            limitations.add("AI explanation is temporarily unavailable.");
            response = new AtcExplanationResponse(
                    "AI explanation is currently unavailable. The anomaly data is still available in the dashboard.",
                    id,
                    anomaly.flightNumber(),
                    java.util.List.of(),
                    java.util.List.of(),
                    limitations
            );
        }
        return ResponseEntity.ok(response);
    }
}
