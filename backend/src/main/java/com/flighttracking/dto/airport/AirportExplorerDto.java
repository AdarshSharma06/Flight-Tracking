package com.flighttracking.dto.airport;

import java.util.List;
import java.util.Map;

public record AirportExplorerDto(
        String iata,
        List<GeoFeature> runways,
        List<GeoFeature> taxiways,
        List<GeoFeature> terminals,
        List<GeoFeature> buildings,
        List<GeoFeature> gates,
        List<GeoFeature> parking,
        List<GeoFeature> transport,
        List<GeoFeature> amenities
) {
    public record GeoFeature(
            String id,
            String category,
            String name,
            String ref,
            double latitude,
            double longitude,
            List<List<double[]>> geometry,
            Map<String, String> properties
    ) {}
}
