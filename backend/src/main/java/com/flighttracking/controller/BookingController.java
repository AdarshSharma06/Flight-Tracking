package com.flighttracking.controller;

import com.flighttracking.dto.PageResponse;
import com.flighttracking.dto.booking.BookingRequest;
import com.flighttracking.dto.booking.BookingResponse;
import com.flighttracking.service.BookingService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/bookings")
public class BookingController {

    private final BookingService bookingService;

    public BookingController(BookingService bookingService) {
        this.bookingService = bookingService;
    }

    @Operation(summary = "Create booking", description = "Create a booking for authenticated user", security = @SecurityRequirement(name = "bearerAuth"))
    @PostMapping
    public ResponseEntity<BookingResponse> create(@Valid @RequestBody BookingRequest request) {
        BookingResponse response = bookingService.createBooking(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @Operation(summary = "List my bookings", description = "Returns authenticated user's bookings. Supports optional pagination via page/size.", security = @SecurityRequirement(name = "bearerAuth"))
    @GetMapping
    public ResponseEntity<?> list(
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        if (page != null || size != null) {
            int p = page != null ? page : 0;
            int s = size != null ? size : 10;
            PageResponse<BookingResponse> paged = PageResponse.of(bookingService.getMyBookingsPaginated(p, s));
            return ResponseEntity.ok(paged);
        }
        List<BookingResponse> bookings = bookingService.getMyBookings();
        return ResponseEntity.ok(bookings);
    }

    @Operation(summary = "Get booking by id", description = "Returns booking if owned by authenticated user", security = @SecurityRequirement(name = "bearerAuth"))
    @GetMapping("/{id}")
    public ResponseEntity<BookingResponse> getById(@PathVariable Long id) {
        BookingResponse response = bookingService.getById(id);
        return ResponseEntity.ok(response);
    }
}
