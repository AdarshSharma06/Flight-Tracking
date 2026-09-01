package com.flighttracking.controller;

import com.flighttracking.dto.weather.WeatherDto;
import com.flighttracking.service.WeatherService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/weather")
public class WeatherController {

    private final WeatherService weatherService;

    public WeatherController(WeatherService weatherService) {
        this.weatherService = weatherService;
    }

    // GET /api/weather?latitude=28.55&longitude=77.08
    @GetMapping
    public ResponseEntity<WeatherDto> getByCoordinates(
            @RequestParam double latitude,
            @RequestParam double longitude) {
        WeatherDto dto = weatherService.getByCoordinates(latitude, longitude);
        return ResponseEntity.ok(dto);
    }

    // GET /api/weather/airport/{iata}  convenience for frontend
    @GetMapping("/airport/{iata}")
    public ResponseEntity<WeatherDto> getByAirport(@PathVariable String iata) {
        WeatherDto dto = weatherService.getByAirport(iata);
        return ResponseEntity.ok(dto);
    }
}
