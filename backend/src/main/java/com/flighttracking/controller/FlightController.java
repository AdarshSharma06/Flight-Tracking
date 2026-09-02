package com.flighttracking.controller;

import com.flighttracking.dto.flight.FlightDto;
import com.flighttracking.dto.flight.FlightSearchResponse;
import com.flighttracking.dto.flight.FlightTrackingDto;
import com.flighttracking.service.FlightService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/flights")
@Validated
public class FlightController {

    private final FlightService flightService;

    public FlightController(FlightService flightService) {
        this.flightService = flightService;
    }

    @Operation(summary = "Search flights", description = "Search flights via AviationStack. Supports filtering and sorting.", security = @SecurityRequirement(name = "bearerAuth"))
    @GetMapping("/search")
    public ResponseEntity<FlightSearchResponse> search(
            @RequestParam(required = false) String flight_iata,
            @Pattern(regexp = "^[A-Za-z]{3}$", message = "dep_iata must be a 3-letter IATA code") @RequestParam(required = false) String dep_iata,
            @Pattern(regexp = "^[A-Za-z]{3}$", message = "arr_iata must be a 3-letter IATA code") @RequestParam(required = false) String arr_iata,
            @RequestParam(required = false) String airline_iata,
            @RequestParam(required = false) String flight_status,
            @Min(value = 1, message = "limit must be between 1 and 100") @Max(value = 100, message = "limit must be between 1 and 100") @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) String sortBy,
            @RequestParam(required = false) String order
    ) {
        FlightSearchResponse result;
        if ((sortBy == null || sortBy.isBlank()) && (order == null || order.isBlank())) {
            result = flightService.search(flight_iata, dep_iata, arr_iata, airline_iata, flight_status, limit);
        } else {
            result = flightService.searchWithSort(flight_iata, dep_iata, arr_iata, airline_iata, flight_status, limit, sortBy, order);
        }
        return ResponseEntity.ok(result);
    }

    @Operation(summary = "Get flight by number", security = @SecurityRequirement(name = "bearerAuth"))
    @GetMapping("/{flightNumber}")
    public ResponseEntity<FlightDto> getByFlightNumber(@PathVariable String flightNumber) {
        FlightDto dto = flightService.getByFlightNumber(flightNumber);
        return ResponseEntity.ok(dto);
    }

    @Operation(summary = "Get flight tracking", description = "Returns tracking with position/telemetry if available", security = @SecurityRequirement(name = "bearerAuth"))
    @GetMapping("/{flightNumber}/tracking")
    public ResponseEntity<FlightTrackingDto> getTracking(@PathVariable String flightNumber) {
        FlightTrackingDto dto = flightService.getTracking(flightNumber);
        return ResponseEntity.ok(dto);
    }
}
