package com.flighttracking.controller;

import com.flighttracking.dto.flight.FlightDto;
import com.flighttracking.dto.flight.FlightSearchResponse;
import com.flighttracking.service.FlightService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/flights")
public class FlightController {

    private final FlightService flightService;

    public FlightController(FlightService flightService) {
        this.flightService = flightService;
    }

    @GetMapping("/search")
    public ResponseEntity<FlightSearchResponse> search(
            @RequestParam(required = false) String flight_iata,
            @RequestParam(required = false) String dep_iata,
            @RequestParam(required = false) String arr_iata,
            @RequestParam(required = false) String airline_iata,
            @RequestParam(required = false) String flight_status,
            @RequestParam(required = false) Integer limit
    ) {
        FlightSearchResponse result = flightService.search(
                flight_iata, dep_iata, arr_iata, airline_iata, flight_status, limit
        );
        return ResponseEntity.ok(result);
    }

    @GetMapping("/{flightNumber}")
    public ResponseEntity<FlightDto> getByFlightNumber(@PathVariable String flightNumber) {
        FlightDto dto = flightService.getByFlightNumber(flightNumber);
        return ResponseEntity.ok(dto);
    }
}
