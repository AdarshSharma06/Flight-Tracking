package com.flighttracking.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.flighttracking.client.IgnavClient;
import com.flighttracking.dto.ignav.*;
import com.flighttracking.exception.ExternalApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
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
        // If raw was single object with ignav_id, treat as single
        if (list.isEmpty() && root.has("ignav_id")) {
            try {
                IgnavItineraryDto dto = parseItinerary(root);
                if (dto != null) list.add(dto);
            } catch (Exception ignored) {}
        }
        return new IgnavSearchResponse(list, list.size(), root.has("request_id") ? root.get("request_id").asText() : null);
    }

    private IgnavItineraryDto parseItinerary(JsonNode n) {
        String ignavId = text(n, "ignav_id", "itinerary_id", "id");
        if (ignavId == null) return null;

        JsonNode price = n.get("price");
        Double amount = null;
        String currency = null;
        String status = null;
        if (price != null && price.isObject()) {
            amount = decimal(price, "amount", "value", "total");
            currency = text(price, "currency", "cur");
            status = text(price, "status", "state");
        }

        // legs
        List<IgnavItineraryDto.IgnavLegDto> legs = new ArrayList<>();
        JsonNode legsNode = n.get("legs");
        if (legsNode != null && legsNode.isArray()) {
            for (JsonNode leg : legsNode) {
                legs.add(new IgnavItineraryDto.IgnavLegDto(
                        text(leg, "origin", "from", "departure_airport"),
                        text(leg, "destination", "to", "arrival_airport"),
                        text(leg, "departure_time", "departure", "departure_at"),
                        text(leg, "arrival_time", "arrival", "arrival_at"),
                        text(leg, "airline", "carrier", "airline_name"),
                        text(leg, "flight_number", "flight", "number"),
                        text(leg, "aircraft", "plane", "equipment"),
                        text(leg, "duration")
                ));
            }
        }

        // Try to derive origin/destination/duration from legs or direct fields
        String origin = text(n, "origin", "from");
        String destination = text(n, "destination", "to");
        if (origin == null && !legs.isEmpty()) origin = legs.get(0).origin();
        if (destination == null && !legs.isEmpty()) destination = legs.get(legs.size()-1).destination();

        String airline = text(n, "airline", "carrier", "airline_name");
        String flightNumber = text(n, "flight_number", "flight", "number");
        if (airline == null && !legs.isEmpty()) airline = legs.get(0).airline();
        if (flightNumber == null && !legs.isEmpty()) flightNumber = legs.get(0).flightNumber();

        String departureTime = text(n, "departure_time", "departure", "departure_at", "outbound_departure");
        String arrivalTime = text(n, "arrival_time", "arrival", "arrival_at", "inbound_arrival");
        if (departureTime == null && !legs.isEmpty()) departureTime = legs.get(0).departureTime();
        if (arrivalTime == null && !legs.isEmpty()) arrivalTime = legs.get(legs.size()-1).arrivalTime();

        String duration = text(n, "duration", "total_duration");
        Integer stops = null;
        if (n.has("stops")) stops = n.get("stops").asInt();
        else if (n.has("num_stops")) stops = n.get("num_stops").asInt();
        else if (!legs.isEmpty()) stops = Math.max(0, legs.size() - 1);

        String aircraft = text(n, "aircraft", "plane");
        String cabin = text(n, "cabin", "cabin_class", "class");

        return new IgnavItineraryDto(
                ignavId, airline, text(n, "airline_code", "carrier_code"), flightNumber,
                origin, destination, departureTime, arrivalTime, duration, stops,
                aircraft, cabin, amount, currency, status, legs, List.of()
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
                // opt may be booking_option with leg_indexes + links, or direct link
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
                    // single link wrapped as option
                    List<IgnavBookingLinksResponse.ProviderLink> links = List.of(parseLink(opt));
                    opts.add(new IgnavBookingLinksResponse.BookingOption(List.of(0), links));
                }
            }
        }
        // Handle case where root has direct links array without booking_options wrapper
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
