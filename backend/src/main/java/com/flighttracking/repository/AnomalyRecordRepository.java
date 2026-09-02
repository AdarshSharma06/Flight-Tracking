package com.flighttracking.repository;

import com.flighttracking.entity.AnomalyRecord;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AnomalyRecordRepository extends JpaRepository<AnomalyRecord, Long> {
    List<AnomalyRecord> findByFlightNumberOrderByDetectedAtDesc(String flightNumber);
    List<AnomalyRecord> findAllByOrderByDetectedAtDesc();
    Page<AnomalyRecord> findByFlightNumber(String flightNumber, Pageable pageable);
    Page<AnomalyRecord> findAll(Pageable pageable);
}
