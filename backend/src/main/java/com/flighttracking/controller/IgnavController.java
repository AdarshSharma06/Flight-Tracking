package com.flighttracking.controller;

import com.flighttracking.dto.ignav.*;
import com.flighttracking.service.IgnavService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/ignav")
public class IgnavController {

    private final IgnavService ignavService;

    public IgnavController(IgnavService ignavService) {
        this.ignavService = ignavService;
    }

    @Operation(summary = "Ignav flight search", description = "Proxy to Ignav search for Booking page", security = @SecurityRequirement(name = "bearerAuth"))
    @PostMapping("/search")
    public ResponseEntity<IgnavSearchResponse> search(@Valid @RequestBody IgnavSearchRequest request) {
        // Basic validation beyond bean validation
        if (request.origin().equalsIgnoreCase(request.destination())) {
            throw new IllegalArgumentException("Origin and destination must differ");
        }
        IgnavSearchResponse resp = ignavService.search(request);
        return ResponseEntity.ok(resp);
    }

    @Operation(summary = "Ignav booking links", description = "Get booking links for exact Ignav itinerary", security = @SecurityRequirement(name = "bearerAuth"))
    @PostMapping("/booking-links")
    public ResponseEntity<IgnavBookingLinksResponse> bookingLinks(@Valid @RequestBody IgnavBookingLinksRequest request) {
        IgnavBookingLinksResponse resp = ignavService.bookingLinks(request);
        return ResponseEntity.ok(resp);
    }
}
