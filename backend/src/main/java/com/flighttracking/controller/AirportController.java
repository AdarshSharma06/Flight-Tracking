package com.flighttracking.controller;

import com.flighttracking.dto.airport.AirportDto;
import com.flighttracking.dto.flight.FlightDto;
import com.flighttracking.service.AirportService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/airports")
@Validated
public class AirportController {

    private final AirportService airportService;

    public AirportController(AirportService airportService) {
        this.airportService = airportService;
    }

    @Operation(summary = "Get airport by IATA", security = @SecurityRequirement(name = "bearerAuth"))
    @GetMapping("/{iata}")
    public ResponseEntity<AirportDto> getAirport(@Pattern(regexp = "^[A-Za-z]{3}$", message = "IATA must be 3 letters") @PathVariable String iata) {
        AirportDto dto = airportService.getAirport(iata);
        return ResponseEntity.ok(dto);
    }

    @Operation(summary = "Get departures", security = @SecurityRequirement(name = "bearerAuth"))
    @GetMapping("/{iata}/departures")
    public ResponseEntity<Map<String, Object>> getDepartures(
            @Pattern(regexp = "^[A-Za-z]{3}$", message = "IATA must be 3 letters") @PathVariable String iata,
            @Min(value = 1, message = "limit must be between 1 and 100") @Max(value = 100, message = "limit must be between 1 and 100") @RequestParam(required = false) Integer limit) {
        List<FlightDto> flights = airportService.getDepartures(iata, limit);
        return ResponseEntity.ok(Map.of(
                "airport", iata.toUpperCase(),
                "type", "departures",
                "count", flights.size(),
                "flights", flights
        ));
    }

    @Operation(summary = "Get arrivals", security = @SecurityRequirement(name = "bearerAuth"))
    @GetMapping("/{iata}/arrivals")
    public ResponseEntity<Map<String, Object>> getArrivals(
            @Pattern(regexp = "^[A-Za-z]{3}$", message = "IATA must be 3 letters") @PathVariable String iata,
            @Min(value = 1, message = "limit must be between 1 and 100") @Max(value = 100, message = "limit must be between 1 and 100") @RequestParam(required = false) Integer limit) {
        List<FlightDto> flights = airportService.getArrivals(iata, limit);
        return ResponseEntity.ok(Map.of(
                "airport", iata.toUpperCase(),
                "type", "arrivals",
                "count", flights.size(),
                "flights", flights
        ));
    }
}
