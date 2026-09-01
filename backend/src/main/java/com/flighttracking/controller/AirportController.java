package com.flighttracking.controller;

import com.flighttracking.dto.airport.AirportDto;
import com.flighttracking.dto.flight.FlightDto;
import com.flighttracking.service.AirportService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/airports")
public class AirportController {

    private final AirportService airportService;

    public AirportController(AirportService airportService) {
        this.airportService = airportService;
    }

    @GetMapping("/{iata}")
    public ResponseEntity<AirportDto> getAirport(@PathVariable String iata) {
        AirportDto dto = airportService.getAirport(iata);
        return ResponseEntity.ok(dto);
    }

    @GetMapping("/{iata}/departures")
    public ResponseEntity<Map<String, Object>> getDepartures(
            @PathVariable String iata,
            @RequestParam(required = false) Integer limit) {
        List<FlightDto> flights = airportService.getDepartures(iata, limit);
        return ResponseEntity.ok(Map.of(
                "airport", iata.toUpperCase(),
                "type", "departures",
                "count", flights.size(),
                "flights", flights
        ));
    }

    @GetMapping("/{iata}/arrivals")
    public ResponseEntity<Map<String, Object>> getArrivals(
            @PathVariable String iata,
            @RequestParam(required = false) Integer limit) {
        List<FlightDto> flights = airportService.getArrivals(iata, limit);
        return ResponseEntity.ok(Map.of(
                "airport", iata.toUpperCase(),
                "type", "arrivals",
                "count", flights.size(),
                "flights", flights
        ));
    }
}
