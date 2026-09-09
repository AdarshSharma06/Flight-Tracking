package com.flighttracking.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.flighttracking.client.IgnavClient;
import com.flighttracking.dto.ignav.*;
import com.flighttracking.exception.ExternalApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
public class IgnavService {

    private static final Logger log = LoggerFactory.getLogger(IgnavService.class);
    private final IgnavClient client;

    public IgnavService(IgnavClient client) {
        this.client = client;
    }

    public IgnavSearchResponse search(IgnavSearchRequest req) {
        JsonNode raw = client.search(req);
        return normalizeSearch(raw);
    }

    public IgnavBookingLinksResponse bookingLinks(IgnavBookingLinksRequest req) {
        JsonNode raw = client.bookingLinks(req);
        return normalizeBookingLinks(raw, req.ignavId());
    }

    private IgnavSearchResponse normalizeSearch(JsonNode root) {
        List<IgnavItineraryDto> list = new ArrayList<>();
        JsonNode itineraries = null;
        if (root.has("itineraries")) itineraries = root.get("itineraries");
        else if (root.has("data")) itineraries = root.get("data");
        else if (root.has("results")) itineraries = root.get("results");
        else if (root.isArray()) itineraries = root;
        else if (root.has("flights")) itineraries = root.get("flights");

        if (itineraries != null && itineraries.isArray()) {
            for (JsonNode n : itineraries) {
                try {
                    IgnavItineraryDto dto = parseItinerary(n);
                    if (dto != null) list.add(dto);
                } catch (Exception e) {
                    log.warn("Failed to parse itinerary: {}", e.getMessage());
                }
            }
        }
        if (list.isEmpty() && root.has("ignav_id")) {
            try {
                IgnavItineraryDto dto = parseItinerary(root);
                if (dto != null) list.add(dto);
            } catch (Exception ignored) {}
        }

        // Top-6 cheapest: sort by price, take up to 6
        list.sort(Comparator.comparingDouble(d -> d.priceAmount() != null ? d.priceAmount() : Double.MAX_VALUE));
        List<IgnavItineraryDto> top6 = list.size() > 6 ? list.subList(0, 6) : list;

        return new IgnavSearchResponse(top6, top6.size(), root.has("request_id") ? root.get("request_id").asText() : null);
    }

    private IgnavItineraryDto parseItinerary(JsonNode n) {
        String ignavId = text(n, "ignav_id", "itinerary_id", "id");
        if (ignavId == null) return null;

        // Price
        JsonNode price = n.get("price");
        Double amount = null;
        String currency = null;
        String status = null;
        if (price != null && price.isObject()) {
            amount = decimal(price, "amount", "value", "total");
            currency = text(price, "currency", "cur");
            status = text(price, "status", "state");
        }

        // Read outbound object (actual Ignav format)
        JsonNode outbound = n.get("outbound");
        List<IgnavItineraryDto.IgnavSegmentDto> segments = new ArrayList<>();
        String airline = null;
        String airlineCode = null;
        String flightNumber = null;
        String origin = null;
        String destination = null;
        String departureTime = null;
        String arrivalTime = null;
        String duration = null;
        Integer stops = null;
        String aircraft = null;

        if (outbound != null && outbound.isObject()) {
            airline = text(outbound, "carrier", "airline", "carrier_name");
            if (outbound.has("duration_minutes")) {
                int mins = outbound.get("duration_minutes").asInt();
                duration = String.format("%dh%02dm", mins / 60, mins % 60);
            }

            JsonNode segs = outbound.get("segments");
            if (segs != null && segs.isArray()) {
                for (JsonNode seg : segs) {
                    segments.add(new IgnavItineraryDto.IgnavSegmentDto(
                            text(seg, "departure_airport", "origin"),
                            text(seg, "arrival_airport", "destination"),
                            text(seg, "departure_time_local", "departure_time"),
                            text(seg, "arrival_time_local", "arrival_time"),
                            text(seg, "departure_time_utc"),
                            text(seg, "arrival_time_utc"),
                            seg.has("duration_minutes") ? String.format("%dh%02dm", seg.get("duration_minutes").asInt() / 60, seg.get("duration_minutes").asInt() % 60) : null,
                            text(seg, "marketing_carrier_code"),
                            text(seg, "flight_number"),
                            text(seg, "operating_carrier_name"),
                            text(seg, "aircraft")
                    ));
                }
            }

            if (!segments.isEmpty()) {
                origin = segments.get(0).origin();
                destination = segments.get(segments.size() - 1).destination();
                departureTime = segments.get(0).departureTime();
                arrivalTime = segments.get(segments.size() - 1).arrivalTime();
                if (airlineCode == null) airlineCode = segments.get(0).marketingCarrierCode();
                if (flightNumber == null) flightNumber = segments.get(0).flightNumber();
                if (aircraft == null) aircraft = segments.get(segments.size() - 1).aircraft();
                stops = Math.max(0, segments.size() - 1);
            }
        }

        // Fallback: try legacy "legs" format if outbound parsing yielded nothing
        if (segments.isEmpty()) {
            List<IgnavItineraryDto.IgnavLegDto> legs = new ArrayList<>();
            JsonNode legsNode = n.get("legs");
            if (legsNode != null && legsNode.isArray()) {
                for (JsonNode leg : legsNode) {
                    legs.add(new IgnavItineraryDto.IgnavLegDto(
                            text(leg, "origin", "from", "departure_airport"),
                            text(leg, "destination", "to", "arrival_airport"),
                            text(leg, "departure_time", "departure"),
                            text(leg, "arrival_time", "arrival"),
                            text(leg, "airline", "carrier"),
                            text(leg, "flight_number", "flight"),
                            text(leg, "aircraft", "plane"),
                            text(leg, "duration")
                    ));
                }
            }
            if (origin == null && !legs.isEmpty()) origin = legs.get(0).origin();
            if (destination == null && !legs.isEmpty()) destination = legs.get(legs.size() - 1).destination();
            if (airline == null && !legs.isEmpty()) airline = legs.get(0).airline();
            if (flightNumber == null && !legs.isEmpty()) flightNumber = legs.get(0).flightNumber();
            if (departureTime == null && !legs.isEmpty()) departureTime = legs.get(0).departureTime();
            if (arrivalTime == null && !legs.isEmpty()) arrivalTime = legs.get(legs.size() - 1).arrivalTime();
            if (stops == null && !legs.isEmpty()) stops = Math.max(0, legs.size() - 1);
        }

        String cabin = text(n, "cabin_class", "cabin", "class");
        Boolean requiresSelfTransfer = null;
        if (n.has("requires_self_transfer")) requiresSelfTransfer = n.get("requires_self_transfer").asBoolean();
        String bags = text(n, "bags");

        return new IgnavItineraryDto(
                ignavId, airline, airlineCode, flightNumber,
                origin, destination, departureTime, arrivalTime, duration, stops,
                aircraft, cabin, amount, currency, status,
                requiresSelfTransfer, bags, List.of(), segments
        );
    }

    private IgnavBookingLinksResponse normalizeBookingLinks(JsonNode root, String ignavId) {
        List<IgnavBookingLinksResponse.BookingOption> opts = new ArrayList<>();
        JsonNode bookingOptions = null;
        if (root.has("booking_options")) bookingOptions = root.get("booking_options");
        else if (root.has("bookingOptions")) bookingOptions = root.get("bookingOptions");
        else if (root.has("options")) bookingOptions = root.get("options");
        else if (root.has("links")) bookingOptions = root.get("links");
        else if (root.isArray()) bookingOptions = root;

        if (bookingOptions != null && bookingOptions.isArray()) {
            for (JsonNode opt : bookingOptions) {
                if (opt.has("links") && opt.get("links").isArray()) {
                    List<Integer> legIndexes = new ArrayList<>();
                    JsonNode li = opt.get("leg_indexes");
                    if (li == null) li = opt.get("legIndexes");
                    if (li != null && li.isArray()) for (JsonNode v : li) legIndexes.add(v.asInt());
                    List<IgnavBookingLinksResponse.ProviderLink> links = new ArrayList<>();
                    for (JsonNode l : opt.get("links")) {
                        links.add(parseLink(l));
                    }
                    opts.add(new IgnavBookingLinksResponse.BookingOption(legIndexes, links));
                } else if (opt.has("provider_name") || opt.has("url")) {
                    List<IgnavBookingLinksResponse.ProviderLink> links = List.of(parseLink(opt));
                    opts.add(new IgnavBookingLinksResponse.BookingOption(List.of(0), links));
                }
            }
        }
        if (opts.isEmpty() && root.has("url")) {
            opts.add(new IgnavBookingLinksResponse.BookingOption(List.of(0), List.of(parseLink(root))));
        }
        return new IgnavBookingLinksResponse(ignavId, opts);
    }

    private IgnavBookingLinksResponse.ProviderLink parseLink(JsonNode n) {
        JsonNode price = n.get("price");
        Double amount = null;
        String currency = null;
        String status = null;
        if (price != null && price.isObject()) {
            amount = decimal(price, "amount", "value", "total");
            currency = text(price, "currency", "cur");
            status = text(price, "status", "state");
        } else {
            amount = decimal(n, "amount", "price_amount");
            currency = text(n, "currency", "price_currency");
            status = text(n, "status");
        }
        return new IgnavBookingLinksResponse.ProviderLink(
                text(n, "provider_name", "provider", "name"),
                text(n, "provider_type", "type"),
                amount, currency, status,
                text(n, "url", "link", "booking_url", "href")
        );
    }

    private String text(JsonNode n, String... keys) {
        for (String k : keys) {
            if (n.has(k) && !n.get(k).isNull()) {
                String v = n.get(k).asText();
                if (v != null && !v.isBlank() && !v.equals("null")) return v;
            }
        }
        return null;
    }

    private Double decimal(JsonNode n, String... keys) {
        for (String k : keys) {
            if (n.has(k) && !n.get(k).isNull()) {
                try {
                    return n.get(k).asDouble();
                } catch (Exception ignored) {}
            }
        }
        return null;
    }
}
