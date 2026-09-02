package com.flighttracking.controller;

import com.flighttracking.dto.weather.WeatherDto;
import com.flighttracking.service.WeatherService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/weather")
@Validated
public class WeatherController {

    private final WeatherService weatherService;

    public WeatherController(WeatherService weatherService) {
        this.weatherService = weatherService;
    }

    @Operation(summary = "Get weather by coordinates", security = @SecurityRequirement(name = "bearerAuth"))
    @GetMapping
    public ResponseEntity<WeatherDto> getByCoordinates(
            @DecimalMin(value = "-90.0", message = "latitude must be between -90 and 90") @DecimalMax(value = "90.0", message = "latitude must be between -90 and 90") @RequestParam double latitude,
            @DecimalMin(value = "-180.0", message = "longitude must be between -180 and 180") @DecimalMax(value = "180.0", message = "longitude must be between -180 and 180") @RequestParam double longitude) {
        WeatherDto dto = weatherService.getByCoordinates(latitude, longitude);
        return ResponseEntity.ok(dto);
    }

    @Operation(summary = "Get weather by airport IATA", security = @SecurityRequirement(name = "bearerAuth"))
    @GetMapping("/airport/{iata}")
    public ResponseEntity<WeatherDto> getByAirport(@Pattern(regexp = "^[A-Za-z]{3}$", message = "IATA must be 3 letters") @PathVariable String iata) {
        WeatherDto dto = weatherService.getByAirport(iata);
        return ResponseEntity.ok(dto);
    }
}
