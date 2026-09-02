package com.flighttracking.service;

import com.flighttracking.dto.booking.BookingRequest;
import com.flighttracking.dto.booking.BookingResponse;
import com.flighttracking.entity.Booking;
import com.flighttracking.entity.BookingStatus;
import com.flighttracking.entity.User;
import com.flighttracking.exception.ResourceNotFoundException;
import com.flighttracking.repository.BookingRepository;
import com.flighttracking.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class BookingService {

    private static final Logger log = LoggerFactory.getLogger(BookingService.class);
    private static final int MAX_PAGE_SIZE = 50;

    private final BookingRepository bookingRepository;
    private final UserRepository userRepository;

    public BookingService(BookingRepository bookingRepository, UserRepository userRepository) {
        this.bookingRepository = bookingRepository;
        this.userRepository = userRepository;
    }

    @Transactional
    public BookingResponse createBooking(BookingRequest request) {
        String username = currentUsername();
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + username));

        Booking booking = new Booking(
                user,
                request.flightNumber().trim().toUpperCase(),
                request.origin().trim().toUpperCase(),
                request.destination().trim().toUpperCase(),
                request.departureScheduled(),
                request.arrivalScheduled(),
                request.airlineName(),
                request.aircraftRegistration(),
                BookingStatus.CONFIRMED
        );
        booking = bookingRepository.save(booking);
        log.info("Booking created id={} for user={} flight={}", booking.getId(), username, booking.getFlightNumber());
        return toResponse(booking);
    }

    @Transactional(readOnly = true)
    public List<BookingResponse> getMyBookings() {
        String username = currentUsername();
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + username));
        List<Booking> bookings = bookingRepository.findByUserIdOrderByCreatedAtDesc(user.getId());
        return bookings.stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public Page<BookingResponse> getMyBookingsPaginated(int page, int size) {
        if (page < 0) throw new IllegalArgumentException("page must be >= 0");
        if (size < 1 || size > MAX_PAGE_SIZE) throw new IllegalArgumentException("size must be between 1 and " + MAX_PAGE_SIZE);
        String username = currentUsername();
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + username));
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<Booking> bookings = bookingRepository.findByUserId(user.getId(), pageable);
        return bookings.map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public BookingResponse getById(Long id) {
        String username = currentUsername();
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + username));
        Booking booking = bookingRepository.findByIdAndUserId(id, user.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Booking not found: " + id));
        return toResponse(booking);
    }

    private BookingResponse toResponse(Booking b) {
        return new BookingResponse(
                b.getId(),
                b.getUser().getId(),
                b.getUser().getUsername(),
                b.getFlightNumber(),
                b.getOrigin(),
                b.getDestination(),
                b.getDepartureScheduled(),
                b.getArrivalScheduled(),
                b.getAirlineName(),
                b.getAircraftRegistration(),
                b.getStatus().name(),
                b.getCreatedAt()
        );
    }

    private String currentUsername() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }
}
