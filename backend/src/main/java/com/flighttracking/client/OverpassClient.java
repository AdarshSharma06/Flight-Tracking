package com.flighttracking.client;

import com.flighttracking.config.OverpassProperties;
import com.flighttracking.dto.airport.AirportExplorerDto;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.*;

@Component
public class OverpassClient {

    private static final Logger log = LoggerFactory.getLogger(OverpassClient.class);
    private static final double BBOX_OFFSET = 0.025;

    private final RestClient restClient;
    private final OverpassProperties properties;

    public OverpassClient(RestClient overpassRestClient, OverpassProperties properties) {
        this.restClient = overpassRestClient;
        this.properties = properties;
    }

    public AirportExplorerDto fetchAirportData(String iata, double latitude, double longitude) {
        double south = latitude - BBOX_OFFSET;
        double west = longitude - BBOX_OFFSET;
        double north = latitude + BBOX_OFFSET;
        double east = longitude + BBOX_OFFSET;
        String bbox = south + "," + west + "," + north + "," + east;

        String query = "[out:json][timeout:12];\n"
                + "(\n"
                + "  way[\"aeroway\"=\"runway\"](" + bbox + ");\n"
                + "  way[\"aeroway\"=\"taxiway\"](" + bbox + ");\n"
                + "  way[\"building\"=\"terminal\"](" + bbox + ");\n"
                + "  way[\"building\"=\"aerodrome\"](" + bbox + ");\n"
                + "  way[\"building\"=\"hotel\"](" + bbox + ");\n"
                + "  node[\"aeroway\"=\"gate\"](" + bbox + ");\n"
                + "  way[\"amenity\"=\"parking\"](" + bbox + ");\n"
                + "  node[\"amenity\"=\"parking_entrance\"](" + bbox + ");\n"
                + "  node[\"highway\"=\"bus_stop\"](" + bbox + ");\n"
                + "  node[\"railway\"=\"station\"](" + bbox + ");\n"
                + "  node[\"railway\"=\"stop\"](" + bbox + ");\n"
                + "  node[\"aeroway\"=\"helipad\"](" + bbox + ");\n"
                + "  node[\"amenity\"=\"restaurant\"](" + bbox + ");\n"
                + "  node[\"amenity\"=\"cafe\"](" + bbox + ");\n"
                + "  node[\"amenity\"=\"bar\"](" + bbox + ");\n"
                + "  node[\"shop\"=\"duty_free\"](" + bbox + ");\n"
                + "  node[\"tourism\"=\"hotel\"](" + bbox + ");\n"
                + "  node[\"amenity\"=\"atm\"](" + bbox + ");\n"
                + "  node[\"amenity\"=\"bank\"](" + bbox + ");\n"
                + ");\n"
                + "out body;\n"
                + ">;\n"
                + "out skel qt;";

        URI uri = UriComponentsBuilder.fromPath("/interpreter")
                .queryParam("data", query)
                .build().toUri();

        try {
            log.debug("Calling Overpass API for airport {}: {}", iata, uri);
            OverpassResponse response = restClient.get()
                    .uri(uri)
                    .retrieve()
                    .body(OverpassResponse.class);

            if (response == null || response.elements == null) {
                log.warn("Empty Overpass response for {}", iata);
                return emptyExplorer(iata);
            }

            return parseResponse(iata, response);
        } catch (RestClientException e) {
            log.error("Overpass API request failed for {}: {}", iata, e.getMessage());
            return emptyExplorer(iata);
        } catch (Exception e) {
            log.error("Failed to parse Overpass response for {}: {}", iata, e.getMessage());
            return emptyExplorer(iata);
        }
    }

    private AirportExplorerDto parseResponse(String iata, OverpassResponse response) {
        Map<Long, double[]> nodeMap = new HashMap<>();
        for (OverpassElement el : response.elements) {
            if ("node".equals(el.type) && el.lat != null && el.lon != null) {
                nodeMap.put(el.id, new double[]{el.lat, el.lon});
            }
        }

        List<AirportExplorerDto.GeoFeature> runways = new ArrayList<>();
        List<AirportExplorerDto.GeoFeature> taxiways = new ArrayList<>();
        List<AirportExplorerDto.GeoFeature> terminals = new ArrayList<>();
        List<AirportExplorerDto.GeoFeature> buildings = new ArrayList<>();
        List<AirportExplorerDto.GeoFeature> gates = new ArrayList<>();
        List<AirportExplorerDto.GeoFeature> parking = new ArrayList<>();
        List<AirportExplorerDto.GeoFeature> transport = new ArrayList<>();
        List<AirportExplorerDto.GeoFeature> amenities = new ArrayList<>();

        for (OverpassElement el : response.elements) {
            Map<String, String> tags = el.tags != null ? el.tags : Map.of();
            String category = tags.getOrDefault("aeroway", tags.getOrDefault("building",
                    tags.getOrDefault("amenity", tags.getOrDefault("railway",
                            tags.getOrDefault("highway", tags.getOrDefault("shop",
                                    tags.getOrDefault("tourism", "")))))));

            AirportExplorerDto.GeoFeature feature = null;

            if ("way".equals(el.type) && el.nodes != null) {
                List<double[]> geometry = resolveWayGeometry(el.nodes, nodeMap);
                double[] center = computeCenter(geometry);
                feature = new AirportExplorerDto.GeoFeature(
                        String.valueOf(el.id), category,
                        tags.getOrDefault("name", ""),
                        tags.getOrDefault("ref", tags.getOrDefault("designation", "")),
                        center[0], center[1],
                        List.of(geometry),
                        tags
                );
            } else if ("node".equals(el.type) && el.lat != null && el.lon != null) {
                feature = new AirportExplorerDto.GeoFeature(
                        String.valueOf(el.id), category,
                        tags.getOrDefault("name", ""),
                        tags.getOrDefault("ref", ""),
                        el.lat, el.lon,
                        List.of(),
                        tags
                );
            }

            if (feature == null) continue;

            if ("runway".equals(category)) runways.add(feature);
            else if ("taxiway".equals(category)) taxiways.add(feature);
            else if ("terminal".equals(category) || "aerodrome".equals(category)) terminals.add(feature);
            else if ("gate".equals(category)) gates.add(feature);
            else if ("parking".equals(category)) parking.add(feature);
            else if ("hotel".equals(category)) buildings.add(feature);
            else if ("station".equals(category) || "stop".equals(category)
                    || ("bus_stop".equals(tags.get("highway")))) transport.add(feature);
            else if ("restaurant".equals(category) || "cafe".equals(category)
                    || "bar".equals(category) || "duty_free".equals(category)
                    || "atm".equals(category) || "bank".equals(category)) amenities.add(feature);
        }

        return new AirportExplorerDto(iata.toUpperCase(), runways, taxiways, terminals, buildings, gates, parking, transport, amenities);
    }

    private List<double[]> resolveWayGeometry(List<Long> nodeIds, Map<Long, double[]> nodeMap) {
        List<double[]> geometry = new ArrayList<>();
        for (Long nodeId : nodeIds) {
            double[] coords = nodeMap.get(nodeId);
            if (coords != null) {
                geometry.add(coords);
            }
        }
        return geometry;
    }

    private double[] computeCenter(List<double[]> geometry) {
        if (geometry.isEmpty()) return new double[]{0, 0};
        double sumLat = 0, sumLon = 0;
        for (double[] c : geometry) {
            sumLat += c[0];
            sumLon += c[1];
        }
        return new double[]{sumLat / geometry.size(), sumLon / geometry.size()};
    }

    private AirportExplorerDto emptyExplorer(String iata) {
        return new AirportExplorerDto(iata.toUpperCase(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    static class OverpassResponse {
        public List<OverpassElement> elements;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    static class OverpassElement {
        public String type;
        public long id;
        public Double lat;
        public Double lon;
        public List<Long> nodes;
        public Map<String, String> tags;
    }
}
