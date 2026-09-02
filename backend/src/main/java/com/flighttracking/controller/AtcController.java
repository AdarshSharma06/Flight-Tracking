package com.flighttracking.controller;

import com.flighttracking.dto.MessageResponse;
import com.flighttracking.dto.PageResponse;
import com.flighttracking.dto.anomaly.AnomalyRequest;
import com.flighttracking.dto.anomaly.AnomalyResponse;
import com.flighttracking.dto.telemetry.TelemetryRequest;
import com.flighttracking.dto.telemetry.TelemetryResponse;
import com.flighttracking.service.AnomalyRecordService;
import com.flighttracking.service.TelemetryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/atc")
public class AtcController {

    private final TelemetryService telemetryService;
    private final AnomalyRecordService anomalyRecordService;

    public AtcController(TelemetryService telemetryService, AnomalyRecordService anomalyRecordService) {
        this.telemetryService = telemetryService;
        this.anomalyRecordService = anomalyRecordService;
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
}
