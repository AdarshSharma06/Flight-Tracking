package com.flighttracking.dto.flight;

import java.util.List;

public record FlightSearchResponse(
        List<FlightDto> flights,
        int count
) {
}
