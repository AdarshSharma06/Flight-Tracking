package com.flighttracking.service;

import com.flighttracking.client.AviationStackClient;
import com.flighttracking.client.AviationStackResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * Regression tests for AI302 departure-delay bug:
 * Provider returns scheduled 02:00, actual 02:45, delay "4" -> should be corrected to "45".
 * Arrival 19:05->19:09 with delay "4" is correct.
 * Terminal/gate passthrough unchanged.
 */
@ExtendWith(MockitoExtension.class)
class FlightServiceDelayTest {

    @Mock
    private AviationStackClient client;

    @InjectMocks
    private FlightService service;

    private AviationStackResponse ai302InconsistentResponse() {
        AviationStackResponse.Departure dep = new AviationStackResponse.Departure(
                "Indira Gandhi International", "Asia/Kolkata", "DEL", "VIDP", "3", "21",
                "4", // provider incorrectly says 4
                "2026-09-01T02:00:00+0000", // scheduled
                "2026-09-01T02:45:00+0000", // estimated (use same as scheduled for test)
                "2026-09-01T02:45:00+0000", // actual 45min later
                null, null);
        AviationStackResponse.Arrival arr = new AviationStackResponse.Arrival(
                "Sydney Airport", "Australia/Sydney", "SYD", "YSSY", "1", "54",
                "4", // correct
                "2026-09-01T19:05:00+0000",
                "2026-09-01T19:09:00+0000",
                "2026-09-01T19:09:00+0000",
                null, null, null);
        AviationStackResponse.FlightData data = new AviationStackResponse.FlightData(
                "2026-09-01", "landed", dep, arr,
                new AviationStackResponse.Airline("Air India", "AI", "AIC"),
                new AviationStackResponse.Flight("302", "AI302", "AIC302", null),
                new AviationStackResponse.Aircraft("VT-ABC", "A320", "A320", "abc123"),
                null);
        return new AviationStackResponse(
                new AviationStackResponse.Pagination(10, 0, 1, 1),
                List.of(data), null);
    }

    @Test
    void departureDelayComputedFromTimestampsNotProvider() {
        when(client.getFlightsByIata("AI302")).thenReturn(ai302InconsistentResponse());
        var dto = service.getByFlightNumber("AI302");
        // Departure 02:00 -> 02:45 = 45 minutes, must NOT be 4
        assertThat(dto.departureDelay()).isEqualTo("45");
        assertThat(dto.departureDelay()).isNotEqualTo("4");
        assertThat(dto.departureScheduled()).contains("02:00");
        assertThat(dto.departureActual()).contains("02:45");
        // Arrival 19:05->19:09 = 4 correct
        assertThat(dto.arrivalDelay()).isEqualTo("4");
        assertThat(dto.arrivalScheduled()).contains("19:05");
        assertThat(dto.arrivalActual()).contains("19:09");
    }

    @Test
    void arrivalDelayCorrectWhenConsistent() {
        when(client.getFlightsByIata("AI302")).thenReturn(ai302InconsistentResponse());
        var dto = service.getByFlightNumber("AI302");
        assertThat(dto.arrivalDelay()).isEqualTo("4");
    }

    @Test
    void departureDelayExplicit45Preserved() {
        AviationStackResponse.Departure dep = new AviationStackResponse.Departure(
                "DEL Airport", "Asia/Kolkata", "DEL", "VIDP", "3", "21",
                "45", "2026-09-01T02:00:00+0000", null, "2026-09-01T02:45:00+0000", null, null);
        AviationStackResponse.Arrival arr = new AviationStackResponse.Arrival(
                "SYD", "Australia/Sydney", "SYD", "YSSY", "1", "54",
                "4", "2026-09-01T19:05:00+0000", null, "2026-09-01T19:09:00+0000", null, null, null);
        AviationStackResponse.FlightData data = new AviationStackResponse.FlightData(
                "2026-09-01", "landed", dep, arr,
                new AviationStackResponse.Airline("Air India", "AI", "AIC"),
                new AviationStackResponse.Flight("302", "AI302", "AIC302", null),
                null, null);
        var resp = new AviationStackResponse(
                new AviationStackResponse.Pagination(10,0,1,1), List.of(data), null);
        when(client.getFlightsByIata("AI302")).thenReturn(resp);
        var dto = service.getByFlightNumber("AI302");
        assertThat(dto.departureDelay()).isEqualTo("45");
        assertThat(dto.arrivalDelay()).isEqualTo("4");
    }

    @Test
    void delayNotReusedAcrossEvents() {
        // Ensure arrival delay 4 does not leak into departure when departure timestamps missing
        AviationStackResponse.Departure dep = new AviationStackResponse.Departure(
                "DEL", "Asia/Kolkata", "DEL", "VIDP", null, null,
                "4", "2026-09-01T02:00:00+0000", null, null, null, null);
        AviationStackResponse.Arrival arr = new AviationStackResponse.Arrival(
                "SYD", "Australia/Sydney", "SYD", "YSSY", null, null,
                "4", "2026-09-01T19:05:00+0000", null, "2026-09-01T19:09:00+0000", null, null, null);
        AviationStackResponse.FlightData data = new AviationStackResponse.FlightData(
                "2026-09-01", "landed", dep, arr,
                new AviationStackResponse.Airline("Air India", "AI", "AIC"),
                new AviationStackResponse.Flight("302", "AI302", "AIC302", null),
                null, null);
        var resp = new AviationStackResponse(new AviationStackResponse.Pagination(10,0,1,1), List.of(data), null);
        when(client.getFlightsByIata("AI303")).thenReturn(resp);
        var dto = service.getByFlightNumber("AI303");
        // Departure actual null -> should keep provider 4 (no timestamp to compute)
        // Arrival actual present -> computed 4 matches provider, keep 4
        // The key is they are independent
        assertThat(dto.departureDelay()).isEqualTo("4");
        assertThat(dto.arrivalDelay()).isEqualTo("4");
        // Now test inconsistent departure: provider 4 vs computed 45 -> must be 45, not 4 from arrival
        when(client.getFlightsByIata("AI302")).thenReturn(ai302InconsistentResponse());
        var dto2 = service.getByFlightNumber("AI302");
        assertThat(dto2.departureDelay()).isEqualTo("45");
    }

    @Test
    void onTimeFlightDelayNullPreserved() {
        AviationStackResponse.Departure dep = new AviationStackResponse.Departure(
                "DEL", "Asia/Kolkata", "DEL", "VIDP", "3", "A", null,
                "2026-09-01T10:00:00+0000", "2026-09-01T10:00:00+0000", null, null, null);
        AviationStackResponse.Arrival arr = new AviationStackResponse.Arrival(
                "JFK", "America/New_York", "JFK", "KJFK", "4", "B", null,
                "2026-09-01T18:00:00+0000", "2026-09-01T18:00:00+0000", null, null, null, null);
        AviationStackResponse.FlightData data = new AviationStackResponse.FlightData(
                "2026-09-01", "scheduled", dep, arr,
                new AviationStackResponse.Airline("IndiGo", "6E", "IGO"),
                new AviationStackResponse.Flight("123", "6E123", "IGO123", null),
                null, null);
        var resp = new AviationStackResponse(new AviationStackResponse.Pagination(10,0,1,1), List.of(data), null);
        when(client.getFlightsByIata("6E123")).thenReturn(resp);
        var dto = service.getByFlightNumber("6E123");
        // scheduled == actual (null actual) -> no actual, keep provider null
        // Original test expects null
        assertThat(dto.departureDelay()).isNull();
        assertThat(dto.arrivalDelay()).isNull();
    }

    @Test
    void terminalGatePassthrough() {
        when(client.getFlightsByIata("AI302")).thenReturn(ai302InconsistentResponse());
        var dto = service.getByFlightNumber("AI302");
        assertThat(dto.departureTerminal()).isEqualTo("3");
        assertThat(dto.departureGate()).isEqualTo("21");
        assertThat(dto.arrivalTerminal()).isEqualTo("1");
        assertThat(dto.arrivalGate()).isEqualTo("54");
    }
}
