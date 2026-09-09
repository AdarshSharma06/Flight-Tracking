package com.flighttracking.client;

import com.flighttracking.dto.airport.AirportExplorerDto;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.*;

@Component
public class OverpassClient {

    private static final Logger log = LoggerFactory.getLogger(OverpassClient.class);
    private static final double BBOX_OFFSET = 0.025;
    private static final ObjectMapper objectMapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    private final RestClient primaryClient;
    private final RestClient secondaryClient;
    private final RestClient tertiaryClient;

    public OverpassClient(RestClient overpassRestClient, RestClient overpassSecondaryRestClient, RestClient overpassFallbackRestClient) {
        this.primaryClient = overpassRestClient;
        this.secondaryClient = overpassSecondaryRestClient;
        this.tertiaryClient = overpassFallbackRestClient;
    }

    public AirportExplorerDto fetchAirportData(String iata, double latitude, double longitude) {
        double south = latitude - BBOX_OFFSET;
        double west = longitude - BBOX_OFFSET;
        double north = latitude + BBOX_OFFSET;
        double east = longitude + BBOX_OFFSET;
        String bbox = south + "," + west + "," + north + "," + east;

        String query = "[out:json][timeout:25];\n"
                + "(\n"
                + "  way[\"aeroway\"=\"runway\"](" + bbox + ");\n"
                + "  way[\"aeroway\"=\"taxiway\"](" + bbox + ");\n"
                + "  way[\"aeroway\"=\"terminal\"](" + bbox + ");\n"
                + "  way[\"aeroway\"=\"gate\"](" + bbox + ");\n"
                + "  node[\"aeroway\"=\"gate\"](" + bbox + ");\n"
                + "  way[\"aeroway\"=\"parking_position\"](" + bbox + ");\n"
                + "  node[\"aeroway\"=\"parking_position\"](" + bbox + ");\n"
                + "  way[\"aeroway\"=\"apron\"](" + bbox + ");\n"
                + "  way[\"amenity\"=\"parking\"](" + bbox + ");\n"
                + "  node[\"railway\"=\"station\"](" + bbox + ");\n"
                + "  node[\"railway\"=\"stop\"](" + bbox + ");\n"
                + "  node[\"highway\"=\"bus_stop\"](" + bbox + ");\n"
                + "  node[\"amenity\"=\"restaurant\"](" + bbox + ");\n"
                + "  node[\"amenity\"=\"cafe\"](" + bbox + ");\n"
                + "  node[\"amenity\"=\"bar\"](" + bbox + ");\n"
                + ");\n"
                + "out body;\n"
                + ">;\n"
                + "out skel qt;";

        MultiValueMap<String, String> formData = new LinkedMultiValueMap<>();
        formData.add("data", query);

        // --- Primary: overpass.private.coffee ---
        try {
            log.info("[PRIMARY] Overpass POST for {} via overpass.private.coffee — bbox={}", iata, bbox);
            String raw = callOverpassRaw(primaryClient, formData);
            return parseAndBuild(iata, raw, "PRIMARY");
        } catch (RestClientException e) {
            log.warn("[PRIMARY FAILED] overpass.private.coffee for {}: {}", iata, e.getMessage());
        } catch (Exception e) {
            log.warn("[PRIMARY FAILED] overpass.private.coffee for {}: {}", iata, e.getMessage());
        }

        // --- Secondary: maps.mail.ru ---
        try {
            log.info("[SECONDARY] Overpass POST for {} via maps.mail.ru — bbox={}", iata, bbox);
            String raw = callOverpassRaw(secondaryClient, formData);
            return parseAndBuild(iata, raw, "SECONDARY");
        } catch (RestClientException e) {
            log.warn("[SECONDARY FAILED] maps.mail.ru for {}: {}", iata, e.getMessage());
        } catch (Exception e) {
            log.warn("[SECONDARY FAILED] maps.mail.ru for {}: {}", iata, e.getMessage());
        }

        // --- Tertiary: overpass-api.de ---
        try {
            log.info("[TERTIARY] Overpass POST for {} via overpass-api.de — bbox={}", iata, bbox);
            String raw = callOverpassRaw(tertiaryClient, formData);
            return parseAndBuild(iata, raw, "TERTIARY");
        } catch (RestClientException e) {
            log.error("[TERTIARY FAILED] overpass-api.de for {}: {}", iata, e.getMessage(), e);
        } catch (Exception e) {
            log.error("[TERTIARY FAILED] overpass-api.de for {}: {}", iata, e.getMessage(), e);
        }

        log.error("All Overpass endpoints failed for {} — returning empty explorer", iata);
        return emptyExplorer(iata);
    }

    private String callOverpassRaw(RestClient client, MultiValueMap<String, String> formData) {
        ResponseEntity<String> response = client.post()
                .uri("/api/interpreter")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(formData)
                .retrieve()
                .toEntity(String.class);
        if (response.getBody() == null || response.getBody().isBlank()) {
            throw new RestClientException("Empty response body");
        }
        return response.getBody();
    }

    private AirportExplorerDto parseAndBuild(String iata, String rawBody, String tag) throws Exception {
        log.info("[{}] Raw response length={} chars", tag, rawBody.length());
        OverpassResponse response = objectMapper.readValue(rawBody, OverpassResponse.class);
        if (response.elements == null) {
            log.warn("[{}] Parsed response has null elements for {}", tag, iata);
            return emptyExplorer(iata);
        }
        log.info("[SUCCESS via {}] Parsed {} elements for {}", tag, response.elements.size(), iata);
        return parseResponse(iata, response);
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
            if (tags.isEmpty()) continue;

            String aeroway = tags.get("aeroway");
            String building = tags.get("building");
            String amenity = tags.get("amenity");
            String railway = tags.get("railway");
            String highway = tags.get("highway");

            AirportExplorerDto.GeoFeature feature = null;

            if ("way".equals(el.type) && el.nodes != null && !el.nodes.isEmpty()) {
                List<double[]> geometry = resolveWayGeometry(el.nodes, nodeMap);
                if (geometry.isEmpty()) continue;
                double[] center = computeCenter(geometry);
                feature = new AirportExplorerDto.GeoFeature(
                        String.valueOf(el.id),
                        aeroway != null ? aeroway : building != null ? building : amenity != null ? amenity : "unknown",
                        tags.getOrDefault("name", ""),
                        tags.getOrDefault("ref", tags.getOrDefault("designation", "")),
                        center[0], center[1],
                        List.of(geometry),
                        tags
                );
            } else if ("node".equals(el.type) && el.lat != null && el.lon != null) {
                String category = aeroway != null ? aeroway : amenity != null ? amenity
                        : railway != null ? railway : highway != null ? highway : "unknown";
                feature = new AirportExplorerDto.GeoFeature(
                        String.valueOf(el.id), category,
                        tags.getOrDefault("name", ""),
                        tags.getOrDefault("ref", ""),
                        el.lat, el.lon,
                        List.of(),
                        tags
                );
            } else if ("relation".equals(el.type) && el.members != null) {
                continue;
            }

            if (feature == null) continue;

            String cat = feature.category();
            switch (cat) {
                case "runway" -> runways.add(feature);
                case "taxiway" -> taxiways.add(feature);
                case "terminal" -> terminals.add(feature);
                case "gate" -> gates.add(feature);
                case "parking_position", "parking" -> parking.add(feature);
                case "apron" -> buildings.add(feature);
                case "station", "stop", "bus_stop" -> transport.add(feature);
                case "restaurant", "cafe", "bar", "duty_free", "atm", "bank" -> amenities.add(feature);
                default -> {
                    if ("hotel".equals(building) || "aerodrome".equals(building)) {
                        buildings.add(feature);
                    } else if (amenity != null) {
                        amenities.add(feature);
                    }
                }
            }
        }

        log.info("Parsed {}: runways={}, taxiways={}, terminals={}, buildings={}, gates={}, parking={}, transport={}, amenities={}",
                iata, runways.size(), taxiways.size(), terminals.size(), buildings.size(), gates.size(), parking.size(), transport.size(), amenities.size());

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
        public List<Object> members;
    }
}
