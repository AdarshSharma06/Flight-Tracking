package com.flighttracking.repository;

import com.flighttracking.entity.Telemetry;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TelemetryRepository extends JpaRepository<Telemetry, Long> {
    List<Telemetry> findByFlightNumberOrderByRecordedAtDesc(String flightNumber);
    List<Telemetry> findAllByOrderByRecordedAtDesc();
    Page<Telemetry> findByFlightNumber(String flightNumber, Pageable pageable);
    Page<Telemetry> findAll(Pageable pageable);
}
