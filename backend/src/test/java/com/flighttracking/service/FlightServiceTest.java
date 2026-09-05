package com.flighttracking.service;

import com.flighttracking.dto.flight.FlightDto;
import com.flighttracking.dto.flight.FlightSearchResponse;
import com.flighttracking.dto.flight.FlightTrackingDto;
import com.flighttracking.exception.ResourceNotFoundException;
import com.flighttracking.provider.FlightProvider;
import com.flighttracking.provider.TrackingProvider;
import com.flighttracking.provider.TrackingProvider.LiveTrackingData;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FlightServiceTest {

    @Mock
    private FlightProvider flightProvider;

    @Mock
    private TrackingProvider trackingProvider;

    @InjectMocks
    private FlightService service;

    private FlightDto sampleDto(String flightIata, String dep, String arr) {
        return new FlightDto(
                flightIata, flightIata, "IGO" + flightIata.substring(2),
                "IndiGo", "6E", "IGO",
                "Delhi Airport", dep, "VIDP", "3", "A",
                "2026-09-01T10:00:00Z", "2026-09-01T10:00:00Z", null, null,
                "JFK Airport", arr, "KJFK", "4", "B",
                "2026-09-01T18:00:00Z", "2026-09-01T18:00:00Z", null, null,
                "scheduled", "VT-ABC", "A320", "abc123"
        );
    }

    private FlightTrackingDto sampleTrackingDto(String flightIata, String icao24, String icaoCallsign) {
        return new FlightTrackingDto(
                flightIata, flightIata, icaoCallsign, "2026-09-01", "active",
                "IndiGo", "6E", "IGO",
                "VT-ABC", "A320", icao24,
                "Delhi Airport", "DEL", "VIDP", "3", "A",
                "2026-09-01T10:00:00Z", "2026-09-01T10:00:00Z", null,
                "JFK Airport", "JFK", "KJFK", "4", "B",
                "2026-09-01T18:00:00Z", "2026-09-01T18:00:00Z", null,
                "DEL -> JFK",
                28.5, 77.0, 10000.0, 450.0, null, 90.0, false,
                "2026-09-01T12:00:00Z", null, null
        );
    }

    private LiveTrackingData liveData(String icao24, String callsign) {
        // LiveTrackingData record order: longitude, latitude (not lat, lon)
        return new LiveTrackingData(
                icao24, callsign, "India",
                77.0, 28.5, 10000.0, 10100.0,
                450.0, 90.0, 0.0,
                "1234", false, System.currentTimeMillis() / 1000
        );
    }

    @Test
    void searchSuccess() {
        FlightSearchResponse mockResp = new FlightSearchResponse(
                List.of(sampleDto("6E123", "DEL", "JFK")), 1);
        when(flightProvider.searchFlights("6E123", "DEL", "JFK", null, null, 10))
                .thenReturn(mockResp);

        FlightSearchResponse res = service.search("6E123", "DEL", "JFK", null, null, 10);
        assertThat(res.flights()).hasSize(1);
        assertThat(res.count()).isEqualTo(1);
        assertThat(res.flights().get(0).flightIata()).isEqualTo("6E123");
        assertThat(res.flights().get(0).departureIata()).isEqualTo("DEL");
    }

    @Test
    void searchInvalidIataThrows() {
        assertThatThrownBy(() -> service.search(null, "INVALID", null, null, null, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void searchExternalFailurePropagates() {
        when(flightProvider.searchFlights(null, null, null, null, null, null))
                .thenThrow(new com.flighttracking.exception.ExternalApiException("provider down", 502));
        assertThatThrownBy(() -> service.search(null, null, null, null, null, null))
                .isInstanceOf(com.flighttracking.exception.ExternalApiException.class);
    }

    @Test
    void getByFlightNumberSuccess() {
        when(flightProvider.getFlightByNumber("6E123"))
                .thenReturn(sampleDto("6E123", "DEL", "JFK"));
        var dto = service.getByFlightNumber("6E123");
        assertThat(dto.flightIata()).isEqualTo("6E123");
        assertThat(dto.status()).isEqualTo("scheduled");
    }

    @Test
    void getByFlightNumberNotFound() {
        when(flightProvider.getFlightByNumber("XX999"))
                .thenThrow(new ResourceNotFoundException("Flight not found: XX999"));
        assertThatThrownBy(() -> service.getByFlightNumber("XX999"))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void getByFlightNumberBlankThrows() {
        assertThatThrownBy(() -> service.getByFlightNumber(" "))
                .isInstanceOf(IllegalArgumentException.class);
    }

    // --- Tracking bridge tests ---

    @Test
    void trackingTriesIcao24First() {
        FlightTrackingDto commercial = sampleTrackingDto("6E123", "A12345", "IGO123");
        when(flightProvider.getFlightTracking("6E123")).thenReturn(commercial);
        when(trackingProvider.getByIcao24("A12345")).thenReturn(Optional.of(liveData("A12345", "IGO123")));

        var result = service.getTracking("6E123");

        verify(trackingProvider).getByIcao24("A12345");
        verify(trackingProvider, never()).getByCallsign(anyString());
        assertThat(result.latitude()).isEqualTo(28.5);
        assertThat(result.longitude()).isEqualTo(77.0);
    }

    @Test
    void trackingFallsBackToIcaoCallsign() {
        FlightTrackingDto commercial = sampleTrackingDto("6E123", null, "IGO123");
        when(flightProvider.getFlightTracking("6E123")).thenReturn(commercial);
        when(trackingProvider.getByCallsign("IGO123")).thenReturn(Optional.of(liveData("A12345", "IGO123")));

        var result = service.getTracking("6E123");

        verify(trackingProvider, never()).getByIcao24(anyString());
        verify(trackingProvider).getByCallsign("IGO123");
        assertThat(result.latitude()).isEqualTo(28.5);
    }

    @Test
    void trackingDoesNotUseIataAsCallsign() {
        FlightTrackingDto commercial = sampleTrackingDto("6E123", null, null);
        when(flightProvider.getFlightTracking("6E123")).thenReturn(commercial);

        var result = service.getTracking("6E123");

        verify(trackingProvider, never()).getByIcao24(anyString());
        verify(trackingProvider, never()).getByCallsign(anyString());
        // Commercial position still present from AeroDataBox
        assertThat(result.latitude()).isEqualTo(28.5);
    }

    @Test
    void trackingReturnsCommercialOnlyWhenNoLiveData() {
        FlightTrackingDto commercial = sampleTrackingDto("6E123", "A12345", "IGO123");
        when(flightProvider.getFlightTracking("6E123")).thenReturn(commercial);
        when(trackingProvider.getByIcao24("A12345")).thenReturn(Optional.empty());
        when(trackingProvider.getByCallsign("IGO123")).thenReturn(Optional.empty());

        var result = service.getTracking("6E123");

        // Commercial position preserved from AeroDataBox
        assertThat(result.latitude()).isEqualTo(28.5);
        assertThat(result.longitude()).isEqualTo(77.0);
        assertThat(result.flightNumber()).isEqualTo("6E123");
        assertThat(result.status()).isEqualTo("active");
    }

    @Test
    void trackingMergeDoesNotOverwriteValidCommercialData() {
        FlightTrackingDto commercial = sampleTrackingDto("6E123", "A12345", "IGO123");
        when(flightProvider.getFlightTracking("6E123")).thenReturn(commercial);

        LiveTrackingData live = new LiveTrackingData(
                "A12345", "IGO123", "India",
                null, null, null, null,
                null, null, null,
                null, null, null
        );
        when(trackingProvider.getByIcao24("A12345")).thenReturn(Optional.of(live));

        var result = service.getTracking("6E123");

        // Commercial position preserved, live telemetry null
        assertThat(result.latitude()).isEqualTo(28.5);
        assertThat(result.longitude()).isEqualTo(77.0);
        assertThat(result.altitude()).isEqualTo(10000.0);
    }
}
