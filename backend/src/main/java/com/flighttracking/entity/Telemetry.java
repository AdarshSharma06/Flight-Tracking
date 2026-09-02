package com.flighttracking.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "telemetry")
public class Telemetry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "flight_number", nullable = false, length = 20)
    private String flightNumber;

    @Column(name = "flight_iata", length = 20)
    private String flightIata;

    @Column(name = "flight_icao", length = 20)
    private String flightIcao;

    @Column(name = "airline_iata", length = 10)
    private String airlineIata;

    @Column(name = "origin_iata", length = 10)
    private String originIata;

    @Column(name = "destination_iata", length = 10)
    private String destinationIata;

    private Double latitude;
    private Double longitude;
    private Double altitude;
    private Double speed;
    private Double direction;
    private Double heading;

    @Column(name = "flight_status", length = 30)
    private String flightStatus;

    @Column(name = "route_info", length = 500)
    private String routeInfo;

    @Column(name = "aircraft_registration", length = 50)
    private String aircraftRegistration;

    @Column(name = "recorded_at", nullable = false)
    private Instant recordedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public Telemetry() {}

    @PrePersist
    void prePersist() {
        Instant now = Instant.now();
        if (recordedAt == null) recordedAt = now;
        if (createdAt == null) createdAt = now;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getFlightNumber() { return flightNumber; }
    public void setFlightNumber(String flightNumber) { this.flightNumber = flightNumber; }
    public String getFlightIata() { return flightIata; }
    public void setFlightIata(String flightIata) { this.flightIata = flightIata; }
    public String getFlightIcao() { return flightIcao; }
    public void setFlightIcao(String flightIcao) { this.flightIcao = flightIcao; }
    public String getAirlineIata() { return airlineIata; }
    public void setAirlineIata(String airlineIata) { this.airlineIata = airlineIata; }
    public String getOriginIata() { return originIata; }
    public void setOriginIata(String originIata) { this.originIata = originIata; }
    public String getDestinationIata() { return destinationIata; }
    public void setDestinationIata(String destinationIata) { this.destinationIata = destinationIata; }
    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }
    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }
    public Double getAltitude() { return altitude; }
    public void setAltitude(Double altitude) { this.altitude = altitude; }
    public Double getSpeed() { return speed; }
    public void setSpeed(Double speed) { this.speed = speed; }
    public Double getDirection() { return direction; }
    public void setDirection(Double direction) { this.direction = direction; }
    public Double getHeading() { return heading; }
    public void setHeading(Double heading) { this.heading = heading; }
    public String getFlightStatus() { return flightStatus; }
    public void setFlightStatus(String flightStatus) { this.flightStatus = flightStatus; }
    public String getRouteInfo() { return routeInfo; }
    public void setRouteInfo(String routeInfo) { this.routeInfo = routeInfo; }
    public String getAircraftRegistration() { return aircraftRegistration; }
    public void setAircraftRegistration(String aircraftRegistration) { this.aircraftRegistration = aircraftRegistration; }
    public Instant getRecordedAt() { return recordedAt; }
    public void setRecordedAt(Instant recordedAt) { this.recordedAt = recordedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
