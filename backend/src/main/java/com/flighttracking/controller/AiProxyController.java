package com.flighttracking.controller;

import com.flighttracking.ai.config.AiServiceProperties;
import com.flighttracking.dto.airport.AirportDto;
import com.flighttracking.dto.flight.FlightSearchResponse;
import com.flighttracking.dto.flight.FlightTrackingDto;
import com.flighttracking.dto.weather.WeatherDto;
import com.flighttracking.service.AirportService;
import com.flighttracking.service.FlightService;
import com.flighttracking.service.WeatherService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/ai/proxy")
public class AiProxyController {

    private final AiServiceProperties aiProps;
    private final FlightService flightService;
    private final AirportService airportService;
    private final WeatherService weatherService;

    public AiProxyController(
            AiServiceProperties aiProps,
            FlightService flightService,
            AirportService airportService,
            WeatherService weatherService) {
        this.aiProps = aiProps;
        this.flightService = flightService;
        this.airportService = airportService;
        this.weatherService = weatherService;
    }

    private boolean validateApiKey(HttpServletRequest request) {
        String key = request.getHeader("X-AI-Service-Key");
        return aiProps.apiKey() != null && aiProps.apiKey().equals(key);
    }

    @GetMapping("/flights/search")
    public ResponseEntity<?> searchFlights(
            @RequestParam(required = false) String flight_iata,
            @RequestParam(required = false) String dep_iata,
            @RequestParam(required = false) String arr_iata,
            @RequestParam(required = false) String airline_iata,
            @RequestParam(required = false) String flight_status,
            @RequestParam(required = false, defaultValue = "10") Integer limit,
            HttpServletRequest request) {
        if (!validateApiKey(request)) {
            return ResponseEntity.status(401).body(Map.of("error", "Invalid or missing AI service key"));
        }
        try {
            FlightSearchResponse result = flightService.search(
                    flight_iata, dep_iata, arr_iata, airline_iata, flight_status, limit);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/flights/{flightNumber}")
    public ResponseEntity<?> getFlight(
            @PathVariable String flightNumber,
            HttpServletRequest request) {
        if (!validateApiKey(request)) {
            return ResponseEntity.status(401).body(Map.of("error", "Invalid or missing AI service key"));
        }
        try {
            return ResponseEntity.ok(flightService.getByFlightNumber(flightNumber));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/flights/{flightNumber}/tracking")
    public ResponseEntity<?> getFlightTracking(
            @PathVariable String flightNumber,
            HttpServletRequest request) {
        if (!validateApiKey(request)) {
            return ResponseEntity.status(401).body(Map.of("error", "Invalid or missing AI service key"));
        }
        try {
            FlightTrackingDto result = flightService.getTracking(flightNumber);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/airports/{iata}")
    public ResponseEntity<?> getAirport(
            @PathVariable String iata,
            HttpServletRequest request) {
        if (!validateApiKey(request)) {
            return ResponseEntity.status(401).body(Map.of("error", "Invalid or missing AI service key"));
        }
        try {
            AirportDto result = airportService.getAirport(iata);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/airports/{iata}/departures")
    public ResponseEntity<?> getDepartures(
            @PathVariable String iata,
            @RequestParam(required = false, defaultValue = "10") Integer limit,
            HttpServletRequest request) {
        if (!validateApiKey(request)) {
            return ResponseEntity.status(401).body(Map.of("error", "Invalid or missing AI service key"));
        }
        try {
            var flights = airportService.getDepartures(iata, limit);
            return ResponseEntity.ok(Map.of(
                    "airport", iata.toUpperCase(),
                    "type", "departures",
                    "count", flights.size(),
                    "flights", flights
            ));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/airports/{iata}/arrivals")
    public ResponseEntity<?> getArrivals(
            @PathVariable String iata,
            @RequestParam(required = false, defaultValue = "10") Integer limit,
            HttpServletRequest request) {
        if (!validateApiKey(request)) {
            return ResponseEntity.status(401).body(Map.of("error", "Invalid or missing AI service key"));
        }
        try {
            var flights = airportService.getArrivals(iata, limit);
            return ResponseEntity.ok(Map.of(
                    "airport", iata.toUpperCase(),
                    "type", "arrivals",
                    "count", flights.size(),
                    "flights", flights
            ));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/weather/airport/{iata}")
    public ResponseEntity<?> getWeather(
            @PathVariable String iata,
            HttpServletRequest request) {
        if (!validateApiKey(request)) {
            return ResponseEntity.status(401).body(Map.of("error", "Invalid or missing AI service key"));
        }
        try {
            WeatherDto result = weatherService.getByAirport(iata);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
