package com.flighttracking.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "bookings")
public class Booking {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "flight_number", nullable = false, length = 20)
    private String flightNumber;

    @Column(nullable = false, length = 10)
    private String origin;

    @Column(nullable = false, length = 10)
    private String destination;

    @Column(name = "departure_scheduled", length = 50)
    private String departureScheduled;

    @Column(name = "arrival_scheduled", length = 50)
    private String arrivalScheduled;

    @Column(name = "airline_name", length = 100)
    private String airlineName;

    @Column(name = "aircraft_registration", length = 50)
    private String aircraftRegistration;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private BookingStatus status;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Booking() {}

    public Booking(User user, String flightNumber, String origin, String destination,
                   String departureScheduled, String arrivalScheduled,
                   String airlineName, String aircraftRegistration, BookingStatus status) {
        this.user = user;
        this.flightNumber = flightNumber;
        this.origin = origin;
        this.destination = destination;
        this.departureScheduled = departureScheduled;
        this.arrivalScheduled = arrivalScheduled;
        this.airlineName = airlineName;
        this.aircraftRegistration = aircraftRegistration;
        this.status = status;
    }

    @PrePersist
    void prePersist() {
        Instant now = Instant.now();
        if (createdAt == null) createdAt = now;
        updatedAt = now;
        if (status == null) status = BookingStatus.CONFIRMED;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public String getFlightNumber() { return flightNumber; }
    public void setFlightNumber(String flightNumber) { this.flightNumber = flightNumber; }
    public String getOrigin() { return origin; }
    public void setOrigin(String origin) { this.origin = origin; }
    public String getDestination() { return destination; }
    public void setDestination(String destination) { this.destination = destination; }
    public String getDepartureScheduled() { return departureScheduled; }
    public void setDepartureScheduled(String departureScheduled) { this.departureScheduled = departureScheduled; }
    public String getArrivalScheduled() { return arrivalScheduled; }
    public void setArrivalScheduled(String arrivalScheduled) { this.arrivalScheduled = arrivalScheduled; }
    public String getAirlineName() { return airlineName; }
    public void setAirlineName(String airlineName) { this.airlineName = airlineName; }
    public String getAircraftRegistration() { return aircraftRegistration; }
    public void setAircraftRegistration(String aircraftRegistration) { this.aircraftRegistration = aircraftRegistration; }
    public BookingStatus getStatus() { return status; }
    public void setStatus(BookingStatus status) { this.status = status; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
