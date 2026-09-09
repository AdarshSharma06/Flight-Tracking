package com.flighttracking.dto.ignav;

import java.util.List;

public record IgnavItineraryDto(
        String ignavId,
        String airline,
        String airlineCode,
        String flightNumber,
        String origin,
        String destination,
        String departureTime,
        String arrivalTime,
        String duration,
        Integer stops,
        String aircraft,
        String cabin,
        Double priceAmount,
        String priceCurrency,
        String priceStatus,
        List<IgnavLegDto> legs,
        List<IgnavSegmentDto> segments
) {
    public record IgnavLegDto(
            String origin,
            String destination,
            String departureTime,
            String arrivalTime,
            String airline,
            String flightNumber,
            String aircraft,
            String duration
    ) {}

    public record IgnavSegmentDto(
            String origin,
            String destination,
            String departureTime,
            String arrivalTime,
            String duration
    ) {}
}
