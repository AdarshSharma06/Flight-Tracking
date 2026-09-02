package com.flighttracking.repository;

import com.flighttracking.entity.Booking;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BookingRepository extends JpaRepository<Booking, Long> {
    List<Booking> findByUserIdOrderByCreatedAtDesc(Long userId);
    Page<Booking> findByUserId(Long userId, Pageable pageable);
    Optional<Booking> findByIdAndUserId(Long id, Long userId);
}
