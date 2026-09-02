package com.flighttracking.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record AviationStackResponse(
        Pagination pagination,
        List<FlightData> data,
        Error error
) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Pagination(int limit, int offset, int count, int total) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Error(String code, String message, String info) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record FlightData(
            @JsonProperty("flight_date") String flightDate,
            @JsonProperty("flight_status") String flightStatus,
            Departure departure,
            Arrival arrival,
            Airline airline,
            Flight flight,
            Aircraft aircraft,
            Live live
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Live(
            String updated,
            Double latitude,
            Double longitude,
            Double altitude,
            Double direction,
            @JsonProperty("speed_horizontal") Double speedHorizontal,
            @JsonProperty("speed_vertical") Double speedVertical,
            @JsonProperty("is_ground") Boolean isGround
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Departure(
            String airport,
            String timezone,
            String iata,
            String icao,
            String terminal,
            String gate,
            String delay,
            String scheduled,
            String estimated,
            String actual,
            @JsonProperty("estimated_runway") String estimatedRunway,
            @JsonProperty("actual_runway") String actualRunway
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Arrival(
            String airport,
            String timezone,
            String iata,
            String icao,
            String terminal,
            String gate,
            String delay,
            String scheduled,
            String estimated,
            String actual,
            @JsonProperty("estimated_runway") String estimatedRunway,
            @JsonProperty("actual_runway") String actualRunway,
            String baggage
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Airline(
            String name,
            String iata,
            String icao
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Flight(
            String number,
            String iata,
            String icao,
            Object codeshared
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Aircraft(
            String registration,
            String iata,
            String icao,
            String icao24
    ) {}
}
