package com.flighttracking.service;

import com.flighttracking.dto.telemetry.TelemetryRequest;
import com.flighttracking.dto.telemetry.TelemetryResponse;
import com.flighttracking.entity.Telemetry;
import com.flighttracking.exception.ResourceNotFoundException;
import com.flighttracking.repository.TelemetryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class TelemetryService {

    private static final Logger log = LoggerFactory.getLogger(TelemetryService.class);
    private static final int MAX_PAGE_SIZE = 50;

    private final TelemetryRepository repository;

    public TelemetryService(TelemetryRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public TelemetryResponse create(TelemetryRequest req) {
        Telemetry t = new Telemetry();
        t.setFlightNumber(req.flightNumber().trim().toUpperCase());
        t.setFlightIata(req.flightIata() != null ? req.flightIata().trim().toUpperCase() : null);
        t.setFlightIcao(req.flightIcao());
        t.setAirlineIata(req.airlineIata());
        t.setOriginIata(req.originIata() != null ? req.originIata().toUpperCase() : null);
        t.setDestinationIata(req.destinationIata() != null ? req.destinationIata().toUpperCase() : null);
        t.setLatitude(req.latitude());
        t.setLongitude(req.longitude());
        t.setAltitude(req.altitude());
        t.setSpeed(req.speed());
        t.setDirection(req.direction());
        t.setHeading(req.heading());
        t.setFlightStatus(req.flightStatus());
        t.setRouteInfo(req.routeInfo());
        t.setAircraftRegistration(req.aircraftRegistration());
        t = repository.save(t);
        log.info("Telemetry created id={} flight={}", t.getId(), t.getFlightNumber());
        return toResponse(t);
    }

    @Transactional(readOnly = true)
    public List<TelemetryResponse> getAll(String flightNumber) {
        List<Telemetry> list;
        if (flightNumber != null && !flightNumber.isBlank()) {
            list = repository.findByFlightNumberOrderByRecordedAtDesc(flightNumber.trim().toUpperCase());
        } else {
            list = repository.findAllByOrderByRecordedAtDesc();
        }
        return list.stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public Page<TelemetryResponse> getAllPaginated(String flightNumber, int page, int size) {
        if (page < 0) throw new IllegalArgumentException("page must be >= 0");
        if (size < 1 || size > MAX_PAGE_SIZE) throw new IllegalArgumentException("size must be between 1 and " + MAX_PAGE_SIZE);
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "recordedAt"));
        Page<Telemetry> result;
        if (flightNumber != null && !flightNumber.isBlank()) {
            result = repository.findByFlightNumber(flightNumber.trim().toUpperCase(), pageable);
        } else {
            result = repository.findAll(pageable);
        }
        return result.map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public TelemetryResponse getById(Long id) {
        Telemetry t = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Telemetry not found: " + id));
        return toResponse(t);
    }

    private TelemetryResponse toResponse(Telemetry t) {
        return new TelemetryResponse(
                t.getId(),
                t.getFlightNumber(),
                t.getFlightIata(),
                t.getFlightIcao(),
                t.getAirlineIata(),
                t.getOriginIata(),
                t.getDestinationIata(),
                t.getLatitude(),
                t.getLongitude(),
                t.getAltitude(),
                t.getSpeed(),
                t.getDirection(),
                t.getHeading(),
                t.getFlightStatus(),
                t.getRouteInfo(),
                t.getAircraftRegistration(),
                t.getRecordedAt(),
                t.getCreatedAt()
        );
    }
}
