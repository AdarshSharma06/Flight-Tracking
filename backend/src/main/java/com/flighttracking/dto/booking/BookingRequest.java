package com.flighttracking.dto.booking;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record BookingRequest(
         @NotBlank(message = "flightNumber is required")
         @Size(max = 20, message = "flightNumber must be at most 20 characters")
         String flightNumber,

         @NotBlank(message = "origin is required")
         @Pattern(regexp = "^[A-Za-z]{3}$", message = "origin must be a 3-letter IATA code")
         String origin,

         @NotBlank(message = "destination is required")
         @Pattern(regexp = "^[A-Za-z]{3}$", message = "destination must be a 3-letter IATA code")
         String destination,

         @Size(max = 50, message = "departureScheduled too long")
         String departureScheduled,
         @Size(max = 50, message = "arrivalScheduled too long")
         String arrivalScheduled,
         @Size(max = 100, message = "airlineName must be at most 100 characters")
         String airlineName,
         @Size(max = 50, message = "aircraftRegistration must be at most 50 characters")
         String aircraftRegistration,
         @Size(max = 64) String ignavId,
         Double priceAmount,
         @Size(max = 10) String priceCurrency,
         @Size(max = 20) String priceStatus,
         @Size(max = 100) String providerName,
         @Size(max = 30) String providerType,
         @Size(max = 2000) String bookingUrl,
         @Size(max = 30) String cabin,
         @Size(max = 30) String duration,
         Integer stops,
         @Size(max = 5000) String ignavLegsJson
) {
    public BookingRequest {
        // Normalize empty strings to null for optional fields
        if (ignavId != null && ignavId.isBlank()) ignavId = null;
        if (priceCurrency != null && priceCurrency.isBlank()) priceCurrency = null;
        if (priceStatus != null && priceStatus.isBlank()) priceStatus = null;
        if (providerName != null && providerName.isBlank()) providerName = null;
        if (providerType != null && providerType.isBlank()) providerType = null;
        if (bookingUrl != null && bookingUrl.isBlank()) bookingUrl = null;
        if (cabin != null && cabin.isBlank()) cabin = null;
        if (duration != null && duration.isBlank()) duration = null;
        if (ignavLegsJson != null && ignavLegsJson.isBlank()) ignavLegsJson = null;
    }

    // Backward-compatible constructor for old clients (7 args)
    public BookingRequest(String flightNumber, String origin, String destination,
                          String departureScheduled, String arrivalScheduled,
                          String airlineName, String aircraftRegistration) {
        this(flightNumber, origin, destination, departureScheduled, arrivalScheduled,
                airlineName, aircraftRegistration,
                null, null, null, null, null, null, null, null, null, null, null);
    }
}
