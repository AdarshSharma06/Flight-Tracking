package com.flighttracking.dto.ignav;

import java.util.List;

public record IgnavBookingLinksResponse(
        String ignavId,
        List<BookingOption> bookingOptions
) {
    public record BookingOption(
            List<Integer> legIndexes,
            List<ProviderLink> links
    ) {}

    public record ProviderLink(
            String providerName,
            String providerType,
            Double priceAmount,
            String priceCurrency,
            String priceStatus,
            String url
    ) {}
}
