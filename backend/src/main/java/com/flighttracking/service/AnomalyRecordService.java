package com.flighttracking.service;

import com.flighttracking.dto.anomaly.AnomalyRequest;
import com.flighttracking.dto.anomaly.AnomalyResponse;
import com.flighttracking.entity.AnomalyRecord;
import com.flighttracking.entity.AnomalySeverity;
import com.flighttracking.entity.AnomalyStatus;
import com.flighttracking.entity.Telemetry;
import com.flighttracking.exception.ResourceNotFoundException;
import com.flighttracking.repository.AnomalyRecordRepository;
import com.flighttracking.repository.TelemetryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Service
public class AnomalyRecordService {

    private static final Logger log = LoggerFactory.getLogger(AnomalyRecordService.class);
    private static final int MAX_PAGE_SIZE = 50;

    private final AnomalyRecordRepository repository;
    private final TelemetryRepository telemetryRepository;

    public AnomalyRecordService(AnomalyRecordRepository repository, TelemetryRepository telemetryRepository) {
        this.repository = repository;
        this.telemetryRepository = telemetryRepository;
    }

    @Transactional
    public AnomalyResponse create(AnomalyRequest req) {
        AnomalyRecord record = new AnomalyRecord();
        record.setFlightNumber(req.flightNumber().trim().toUpperCase());
        record.setFlightIata(req.flightIata() != null ? req.flightIata().trim().toUpperCase() : null);
        record.setAnomalyType(req.anomalyType());
        try {
            record.setSeverity(AnomalySeverity.valueOf(req.severity().trim().toUpperCase()));
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid severity: " + req.severity() + ". Allowed: LOW, MEDIUM, HIGH, CRITICAL");
        }
        record.setDescription(req.description());
        if (req.status() != null && !req.status().isBlank()) {
            try {
                record.setStatus(AnomalyStatus.valueOf(req.status().trim().toUpperCase()));
            } catch (Exception e) {
                throw new IllegalArgumentException("Invalid status: " + req.status());
            }
        } else {
            record.setStatus(AnomalyStatus.OPEN);
        }
        if (req.telemetryId() != null) {
            Telemetry t = telemetryRepository.findById(req.telemetryId())
                    .orElseThrow(() -> new ResourceNotFoundException("Telemetry not found: " + req.telemetryId()));
            record.setTelemetry(t);
        }
        record = repository.save(record);
        log.info("Anomaly created id={} flight={} type={} severity={}", record.getId(), record.getFlightNumber(), record.getAnomalyType(), record.getSeverity());
        return toResponse(record);
    }

    @Transactional(readOnly = true)
    public List<AnomalyResponse> getAll(String flightNumber) {
        List<AnomalyRecord> list;
        if (flightNumber != null && !flightNumber.isBlank()) {
            list = repository.findByFlightNumberOrderByDetectedAtDesc(flightNumber.trim().toUpperCase());
        } else {
            list = repository.findAllByOrderByDetectedAtDesc();
        }
        return list.stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public Page<AnomalyResponse> getAllPaginated(String flightNumber, int page, int size) {
        if (page < 0) throw new IllegalArgumentException("page must be >= 0");
        if (size < 1 || size > MAX_PAGE_SIZE) throw new IllegalArgumentException("size must be between 1 and " + MAX_PAGE_SIZE);
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "detectedAt"));
        Page<AnomalyRecord> result;
        if (flightNumber != null && !flightNumber.isBlank()) {
            result = repository.findByFlightNumber(flightNumber.trim().toUpperCase(), pageable);
        } else {
            result = repository.findAll(pageable);
        }
        return result.map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public AnomalyResponse getById(Long id) {
        AnomalyRecord r = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Anomaly not found: " + id));
        return toResponse(r);
    }

    @Transactional
    public AnomalyResponse updateStatus(Long id, String status) {
        AnomalyRecord r = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Anomaly not found: " + id));
        try {
            AnomalyStatus newStatus = AnomalyStatus.valueOf(status.trim().toUpperCase());
            r.setStatus(newStatus);
            if (newStatus == AnomalyStatus.RESOLVED) {
                r.setResolvedAt(Instant.now());
            }
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid status: " + status);
        }
        r = repository.save(r);
        return toResponse(r);
    }

    private AnomalyResponse toResponse(AnomalyRecord r) {
        return new AnomalyResponse(
                r.getId(),
                r.getFlightNumber(),
                r.getFlightIata(),
                r.getAnomalyType(),
                r.getSeverity() != null ? r.getSeverity().name() : null,
                r.getDescription(),
                r.getStatus() != null ? r.getStatus().name() : null,
                r.getTelemetry() != null ? r.getTelemetry().getId() : null,
                r.getDetectedAt(),
                r.getResolvedAt(),
                r.getCreatedAt(),
                r.getUpdatedAt()
        );
    }
}
