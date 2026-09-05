package com.flighttracking.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * AeroDataBox API response DTOs.
 * Maps from AeroDataBox OpenAPI contracts to application domain.
 */
public class AerodataboxResponse {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ErrorContract(String errorComponent, String message, String detail) {}

    // --- Flight Contracts ---

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record FlightContract(
            String number,
            String callSign,
            @JsonProperty("status") FlightStatus status,
            @JsonProperty("codeshareStatus") CodeshareStatus codeshareStatus,
            @JsonProperty("isCargo") Boolean isCargo,
            @JsonProperty("lastUpdatedUtc") String lastUpdatedUtc,
            @JsonProperty("departure") FlightAirportMovementContract departure,
            @JsonProperty("arrival") FlightAirportMovementContract arrival,
            @JsonProperty("aircraft") FlightAircraftContract aircraft,
            @JsonProperty("airline") FlightAirlineContract airline,
            @JsonProperty("location") FlightLocationContract location
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record FlightAirportMovementContract(
            @JsonProperty("airport") ListingAirportContract airport,
            @JsonProperty("scheduledTime") DateTimeContract scheduledTime,
            @JsonProperty("revisedTime") DateTimeContract revisedTime,
            @JsonProperty("predictedTime") DateTimeContract predictedTime,
            @JsonProperty("runwayTime") DateTimeContract runwayTime,
            @JsonProperty("terminal") String terminal,
            @JsonProperty("gate") String gate,
            @JsonProperty("baggageBelt") String baggageBelt,
            @JsonProperty("runway") String runway,
            @JsonProperty("quality") List<String> quality
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record DateTimeContract(
            @JsonProperty("utc") String utc,
            @JsonProperty("local") String local
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ListingAirportContract(
            @JsonProperty("icao") String icao,
            @JsonProperty("iata") String iata,
            @JsonProperty("name") String name,
            @JsonProperty("shortName") String shortName,
            @JsonProperty("municipalityName") String municipalityName,
            @JsonProperty("location") GeoCoordinatesContract location,
            @JsonProperty("countryCode") String countryCode,
            @JsonProperty("timeZone") String timeZone
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record GeoCoordinatesContract(
            @JsonProperty("lat") Double lat,
            @JsonProperty("lon") Double lon
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record FlightAircraftContract(
            @JsonProperty("reg") String reg,
            @JsonProperty("modeS") String modeS,
            @JsonProperty("model") String model
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record FlightAirlineContract(
            @JsonProperty("name") String name,
            @JsonProperty("iata") String iata,
            @JsonProperty("icao") String icao
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record FlightLocationContract(
            @JsonProperty("altitude") DistanceContract altitude,
            @JsonProperty("groundSpeed") SpeedContract groundSpeed,
            @JsonProperty("trueTrack") AzimuthContract trueTrack,
            @JsonProperty("vsiFpm") Integer vsiFpm,
            @JsonProperty("lat") Double lat,
            @JsonProperty("lon") Double lon,
            @JsonProperty("reportedAtUtc") String reportedAtUtc
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record DistanceContract(
            @JsonProperty("meter") Double meter,
            @JsonProperty("feet") Double feet,
            @JsonProperty("km") Double km
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SpeedContract(
            @JsonProperty("kmPerHour") Double kmPerHour,
            @JsonProperty("knots") Double knots,
            @JsonProperty("meterPerSecond") Double meterPerSecond
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record AzimuthContract(
            @JsonProperty("degree") Double degree
    ) {}

    public enum FlightStatus {
        Unknown, Expected, EnRoute, CheckIn, Boarding, GateClosed,
        Departed, Delayed, Approaching, Arrived, Canceled, Diverted, CanceledUncertain
    }

    public enum CodeshareStatus {
        Unknown, IsOperator, IsCodeshared
    }

    // --- FIDS Contracts ---

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record AirportFidsContract(
            @JsonProperty("departures") List<AirportFlightContract> departures,
            @JsonProperty("arrivals") List<AirportFlightContract> arrivals
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record AirportFlightContract(
            @JsonProperty("number") String number,
            @JsonProperty("callSign") String callSign,
            @JsonProperty("status") FlightStatus status,
            @JsonProperty("codeshareStatus") CodeshareStatus codeshareStatus,
            @JsonProperty("isCargo") Boolean isCargo,
            @JsonProperty("movement") FlightAirportMovementContract movement,
            @JsonProperty("departure") FlightAirportMovementContract departure,
            @JsonProperty("arrival") FlightAirportMovementContract arrival,
            @JsonProperty("aircraft") FlightAircraftContract aircraft,
            @JsonProperty("airline") FlightAirlineContract airline,
            @JsonProperty("location") FlightLocationContract location
    ) {}

    // --- Airport Contracts ---

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record AirportContract(
            @JsonProperty("icao") String icao,
            @JsonProperty("iata") String iata,
            @JsonProperty("fullName") String fullName,
            @JsonProperty("shortName") String shortName,
            @JsonProperty("municipalityName") String municipalityName,
            @JsonProperty("location") GeoCoordinatesContract location,
            @JsonProperty("country") CountryContract country,
            @JsonProperty("timeZone") String timeZone
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record CountryContract(
            @JsonProperty("code") String code,
            @JsonProperty("name") String name
    ) {}
}
