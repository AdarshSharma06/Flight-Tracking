package com.flighttracking.dto.ignav;

import jakarta.validation.constraints.NotBlank;

public record IgnavBookingLinksRequest(
        @NotBlank String ignavId
) {
}
