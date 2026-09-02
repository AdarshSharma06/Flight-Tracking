package com.flighttracking.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "anomaly_records")
public class AnomalyRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "flight_number", nullable = false, length = 20)
    private String flightNumber;

    @Column(name = "flight_iata", length = 20)
    private String flightIata;

    @Column(name = "anomaly_type", nullable = false, length = 50)
    private String anomalyType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AnomalySeverity severity;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private AnomalyStatus status;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "telemetry_id")
    private Telemetry telemetry;

    @Column(name = "detected_at", nullable = false)
    private Instant detectedAt;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public AnomalyRecord() {}

    @PrePersist
    void prePersist() {
        Instant now = Instant.now();
        if (detectedAt == null) detectedAt = now;
        if (createdAt == null) createdAt = now;
        updatedAt = now;
        if (status == null) status = AnomalyStatus.OPEN;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getFlightNumber() { return flightNumber; }
    public void setFlightNumber(String flightNumber) { this.flightNumber = flightNumber; }
    public String getFlightIata() { return flightIata; }
    public void setFlightIata(String flightIata) { this.flightIata = flightIata; }
    public String getAnomalyType() { return anomalyType; }
    public void setAnomalyType(String anomalyType) { this.anomalyType = anomalyType; }
    public AnomalySeverity getSeverity() { return severity; }
    public void setSeverity(AnomalySeverity severity) { this.severity = severity; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public AnomalyStatus getStatus() { return status; }
    public void setStatus(AnomalyStatus status) { this.status = status; }
    public Telemetry getTelemetry() { return telemetry; }
    public void setTelemetry(Telemetry telemetry) { this.telemetry = telemetry; }
    public Instant getDetectedAt() { return detectedAt; }
    public void setDetectedAt(Instant detectedAt) { this.detectedAt = detectedAt; }
    public Instant getResolvedAt() { return resolvedAt; }
    public void setResolvedAt(Instant resolvedAt) { this.resolvedAt = resolvedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
