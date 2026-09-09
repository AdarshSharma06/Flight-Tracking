package com.flighttracking.dto.ignav;

import java.util.List;

public record IgnavSearchResponse(
        List<IgnavItineraryDto> itineraries,
        Integer count,
        String requestId
) {
}
