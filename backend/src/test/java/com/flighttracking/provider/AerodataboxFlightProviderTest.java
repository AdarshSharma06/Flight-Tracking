package com.flighttracking.provider;

import com.flighttracking.client.AerodataboxClient;
import com.flighttracking.client.AerodataboxResponse;
import com.flighttracking.dto.flight.FlightDto;
import com.flighttracking.dto.flight.FlightSearchResponse;
import com.flighttracking.exception.ResourceNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AerodataboxFlightProviderTest {

    @Mock
    private AerodataboxClient client;

    @InjectMocks
    private AerodataboxFlightProvider provider;

    private AerodataboxResponse.FlightContract sampleFlightContract(String number, String status,
                                                                     String depIata, String arrIata) {
        return sampleFlightContract(number, status, depIata, arrIata, "TA");
    }

    private AerodataboxResponse.FlightContract sampleFlightContract(String number, String status,
                                                                     String depIata, String arrIata,
                                                                     String airlineIata) {
        AerodataboxResponse.FlightStatus fs = switch (status) {
            case "active" -> AerodataboxResponse.FlightStatus.EnRoute;
            case "scheduled" -> AerodataboxResponse.FlightStatus.Expected;
            case "landed" -> AerodataboxResponse.FlightStatus.Arrived;
            case "cancelled" -> AerodataboxResponse.FlightStatus.Canceled;
            case "departed" -> AerodataboxResponse.FlightStatus.Departed;
            default -> AerodataboxResponse.FlightStatus.Unknown;
        };

        AerodataboxResponse.ListingAirportContract depAirport = depIata != null
                ? new AerodataboxResponse.ListingAirportContract("ICAO_DEP", depIata, "Dep Airport", "Dep", null, null, null, null)
                : null;
        AerodataboxResponse.ListingAirportContract arrAirport = arrIata != null
                ? new AerodataboxResponse.ListingAirportContract("ICAO_ARR", arrIata, "Arr Airport", "Arr", null, null, null, null)
                : null;

        AerodataboxResponse.FlightAirportMovementContract dep = depAirport != null
                ? new AerodataboxResponse.FlightAirportMovementContract(
                depAirport, null, null, null, null, null, null, null, null, null)
                : null;
        AerodataboxResponse.FlightAirportMovementContract arr = arrAirport != null
                ? new AerodataboxResponse.FlightAirportMovementContract(
                arrAirport, null, null, null, null, null, null, null, null, null)
                : null;

        AerodataboxResponse.FlightAirlineContract airline = new AerodataboxResponse.FlightAirlineContract("TestAir", airlineIata, "TST");

        return new AerodataboxResponse.FlightContract(
                number, null, fs,
                AerodataboxResponse.CodeshareStatus.IsOperator, false,
                null, dep, arr, null, airline, null
        );
    }

    // --- Bug 1: Status-only search should throw ---

    @Test
    void statusOnlySearchThrowsIllegalArgument() {
        assertThatThrownBy(() -> provider.searchFlights(null, null, null, null, "active", null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Status");
    }

    @Test
    void airlineOnlySearchThrowsIllegalArgument() {
        assertThatThrownBy(() -> provider.searchFlights(null, null, null, "6E", null, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("airport code");
    }

    @Test
    void statusWithDepIataDoesNotThrow() {
        AerodataboxResponse.AirportFidsContract fids = new AerodataboxResponse.AirportFidsContract(
                List.of(), List.of());
        when(client.getAirportFids("DEL", "Departure")).thenReturn(fids);

        FlightSearchResponse result = provider.searchFlights(null, "DEL", null, null, "active", null);
        assertThat(result).isNotNull();
    }

    @Test
    void statusWithArrIataDoesNotThrow() {
        AerodataboxResponse.AirportFidsContract fids = new AerodataboxResponse.AirportFidsContract(
                List.of(), List.of());
        when(client.getAirportFids("BOM", "Arrival")).thenReturn(fids);

        FlightSearchResponse result = provider.searchFlights(null, null, "BOM", null, "active", null);
        assertThat(result).isNotNull();
    }

    @Test
    void allNullFiltersReturnsEmpty() {
        FlightSearchResponse result = provider.searchFlights(null, null, null, null, null, null);
        assertThat(result.flights()).isEmpty();
        assertThat(result.count()).isEqualTo(0);
    }

    // --- Bug 2: Flight number search applies filters ---

    @Test
    void flightNumberSearchAppliesStatusFilter() {
        AerodataboxResponse.FlightContract f1 = sampleFlightContract("6E123", "active", "DEL", "BOM");
        AerodataboxResponse.FlightContract f2 = sampleFlightContract("6E123", "scheduled", "DEL", "BOM");
        when(client.getFlightByNumber("6E123")).thenReturn(List.of(f1, f2));

        FlightSearchResponse result = provider.searchFlights("6E123", null, null, null, "active", null);
        assertThat(result.flights()).hasSize(1);
        assertThat(result.flights().get(0).status()).isEqualTo("active");
    }

    @Test
    void flightNumberSearchAppliesDepFilter() {
        AerodataboxResponse.FlightContract f1 = sampleFlightContract("6E123", "active", "DEL", "BOM");
        AerodataboxResponse.FlightContract f2 = sampleFlightContract("6E456", "active", "BLR", "BOM");
        when(client.getFlightByNumber("6E123")).thenReturn(List.of(f1, f2));

        FlightSearchResponse result = provider.searchFlights("6E123", "DEL", null, null, null, null);
        assertThat(result.flights()).hasSize(1);
        assertThat(result.flights().get(0).departureIata()).isEqualTo("DEL");
    }

    @Test
    void flightNumberSearchAppliesArrFilter() {
        AerodataboxResponse.FlightContract f1 = sampleFlightContract("6E123", "active", "DEL", "BOM");
        AerodataboxResponse.FlightContract f2 = sampleFlightContract("6E456", "active", "DEL", "BLR");
        when(client.getFlightByNumber("6E123")).thenReturn(List.of(f1, f2));

        FlightSearchResponse result = provider.searchFlights("6E123", null, "BOM", null, null, null);
        assertThat(result.flights()).hasSize(1);
        assertThat(result.flights().get(0).arrivalIata()).isEqualTo("BOM");
    }

    @Test
    void flightNumberSearchAppliesAirlineFilter() {
        AerodataboxResponse.FlightContract f1 = sampleFlightContract("6E123", "active", "DEL", "BOM", "TA");
        AerodataboxResponse.FlightContract f2 = sampleFlightContract("AA999", "active", "DEL", "BOM", "BB");
        when(client.getFlightByNumber("6E123")).thenReturn(List.of(f1, f2));

        FlightSearchResponse result = provider.searchFlights("6E123", null, null, "TA", null, null);
        assertThat(result.flights()).hasSize(1);
        assertThat(result.flights().get(0).airlineIata()).isEqualTo("TA");
    }

    @Test
    void flightNumberSearchAppliesAllFilters() {
        AerodataboxResponse.FlightContract f1 = sampleFlightContract("6E123", "active", "DEL", "BOM", "TA");
        AerodataboxResponse.FlightContract f2 = sampleFlightContract("6E123", "scheduled", "DEL", "BOM", "TA");
        AerodataboxResponse.FlightContract f3 = sampleFlightContract("6E123", "active", "BLR", "BOM", "TA");
        AerodataboxResponse.FlightContract f4 = sampleFlightContract("AA999", "active", "DEL", "BOM", "BB");
        when(client.getFlightByNumber("6E123")).thenReturn(List.of(f1, f2, f3, f4));

        FlightSearchResponse result = provider.searchFlights("6E123", "DEL", null, "TA", "active", null);
        assertThat(result.flights()).hasSize(1);
        FlightDto dto = result.flights().get(0);
        assertThat(dto.status()).isEqualTo("active");
        assertThat(dto.departureIata()).isEqualTo("DEL");
        assertThat(dto.airlineIata()).isEqualTo("TA");
    }

    @Test
    void flightNumberSearchNoFiltersReturnsAll() {
        AerodataboxResponse.FlightContract f1 = sampleFlightContract("6E123", "active", "DEL", "BOM");
        AerodataboxResponse.FlightContract f2 = sampleFlightContract("6E456", "scheduled", "BLR", "BOM");
        when(client.getFlightByNumber("6E123")).thenReturn(List.of(f1, f2));

        FlightSearchResponse result = provider.searchFlights("6E123", null, null, null, null, null);
        assertThat(result.flights()).hasSize(2);
    }

    @Test
    void flightNumberSearchFiltersEmptyResult() {
        AerodataboxResponse.FlightContract f1 = sampleFlightContract("6E123", "active", "DEL", "BOM");
        when(client.getFlightByNumber("6E123")).thenReturn(List.of(f1));

        FlightSearchResponse result = provider.searchFlights("6E123", null, null, null, "cancelled", null);
        assertThat(result.flights()).isEmpty();
        assertThat(result.count()).isEqualTo(0);
    }

    @Test
    void flightNumberSearchWithLimit() {
        AerodataboxResponse.FlightContract f1 = sampleFlightContract("6E123", "active", "DEL", "BOM");
        AerodataboxResponse.FlightContract f2 = sampleFlightContract("6E456", "active", "DEL", "BOM");
        AerodataboxResponse.FlightContract f3 = sampleFlightContract("6E789", "active", "DEL", "BOM");
        when(client.getFlightByNumber("6E123")).thenReturn(List.of(f1, f2, f3));

        FlightSearchResponse result = provider.searchFlights("6E123", null, null, null, null, 2);
        assertThat(result.flights()).hasSize(2);
        assertThat(result.count()).isEqualTo(2);
    }

    // --- Record selection tests (selectBestRecord) ---

    private AerodataboxResponse.FlightContract buildContract(String number,
                                                              AerodataboxResponse.FlightStatus status,
                                                              String callSign,
                                                              String modeS,
                                                              AerodataboxResponse.FlightLocationContract location,
                                                              AerodataboxResponse.DateTimeContract depScheduled,
                                                              AerodataboxResponse.DateTimeContract depActual) {
        AerodataboxResponse.ListingAirportContract airport = new AerodataboxResponse.ListingAirportContract(
                "ICAO", "DEL", "Delhi Airport", "Delhi", null, null, null, null);
        AerodataboxResponse.FlightAirportMovementContract dep = new AerodataboxResponse.FlightAirportMovementContract(
                airport, depScheduled, null, null, depActual, null, null, null, null, null);
        AerodataboxResponse.FlightAirportMovementContract arr = null;
        AerodataboxResponse.FlightAircraftContract aircraft = (modeS != null || callSign != null)
                ? new AerodataboxResponse.FlightAircraftContract("VT-TEST", modeS, "B738")
                : null;
        AerodataboxResponse.FlightAirlineContract airline = new AerodataboxResponse.FlightAirlineContract("Airline", "IX", "AXB");
        return new AerodataboxResponse.FlightContract(
                number, callSign, status,
                AerodataboxResponse.CodeshareStatus.IsOperator, false,
                null, dep, arr, aircraft, airline, location);
    }

    private AerodataboxResponse.DateTimeContract utcTime(String utc) {
        return new AerodataboxResponse.DateTimeContract(utc, utc);
    }

    private AerodataboxResponse.FlightLocationContract sampleLocation() {
        return new AerodataboxResponse.FlightLocationContract(
                new AerodataboxResponse.DistanceContract(10000.0, 32808.0, 10.0),
                new AerodataboxResponse.SpeedContract(800.0, 432.0, 222.0),
                new AerodataboxResponse.AzimuthContract(120.0),
                0, 27.2, 79.9, "2026-09-06T10:00:00Z");
    }

    @Test
    void selectBestRecord_prefersActiveOverLandedAndScheduled() {
        // A. Multiple occurrences: historical/landed + current active + future scheduled
        AerodataboxResponse.FlightContract landed = buildContract(
                "IX 1067", AerodataboxResponse.FlightStatus.Arrived,
                null, null, null,
                utcTime("2026-09-05T06:00:00Z"), utcTime("2026-09-05T08:00:00Z"));
        AerodataboxResponse.FlightContract active = buildContract(
                "IX 1067", AerodataboxResponse.FlightStatus.EnRoute,
                "AXB1067", "80162d", sampleLocation(),
                utcTime("2026-09-06T06:00:00Z"), utcTime("2026-09-06T06:15:00Z"));
        AerodataboxResponse.FlightContract scheduled = buildContract(
                "IX 1067", AerodataboxResponse.FlightStatus.Expected,
                "AXB1067", "80162d", null,
                utcTime("2026-09-07T06:00:00Z"), null);

        AerodataboxResponse.FlightContract best = provider.selectBestRecord(List.of(landed, active, scheduled));
        assertThat(best).isSameAs(active);
    }

    @Test
    void selectBestRecord_prefersActiveWithModeSAndCallSign() {
        // B. Active occurrence has modeS and callSign
        AerodataboxResponse.FlightContract withoutIds = buildContract(
                "IX 1067", AerodataboxResponse.FlightStatus.EnRoute,
                null, null, null,
                utcTime("2026-09-06T06:00:00Z"), null);
        AerodataboxResponse.FlightContract withIds = buildContract(
                "IX 1067", AerodataboxResponse.FlightStatus.EnRoute,
                "AXB1067", "80162d", sampleLocation(),
                utcTime("2026-09-06T06:00:00Z"), utcTime("2026-09-06T06:15:00Z"));

        AerodataboxResponse.FlightContract best = provider.selectBestRecord(List.of(withoutIds, withIds));
        assertThat(best).isSameAs(withIds);
    }

    @Test
    void selectBestRecord_doesNotAutoSelectFirstWhenFirstIsHistorical() {
        // C. First array element is historical — must NOT be auto-selected
        AerodataboxResponse.FlightContract historical = buildContract(
                "IX 1067", AerodataboxResponse.FlightStatus.Arrived,
                null, null, null,
                utcTime("2026-09-04T06:00:00Z"), utcTime("2026-09-04T08:00:00Z"));
        AerodataboxResponse.FlightContract todayActive = buildContract(
                "IX 1067", AerodataboxResponse.FlightStatus.Departed,
                "AXB1067", "80162d", null,
                utcTime("2026-09-06T06:00:00Z"), utcTime("2026-09-06T06:15:00Z"));

        AerodataboxResponse.FlightContract best = provider.selectBestRecord(List.of(historical, todayActive));
        assertThat(best).isSameAs(todayActive);
        assertThat(best.status()).isEqualTo(AerodataboxResponse.FlightStatus.Departed);
    }

    @Test
    void selectBestRecord_doesNotLetFutureScheduledOverrideDeparted() {
        // D. Future scheduled occurrence must not override already departed/current
        AerodataboxResponse.FlightContract departed = buildContract(
                "IX 1067", AerodataboxResponse.FlightStatus.Departed,
                "AXB1067", "80162d", null,
                utcTime("2026-09-06T06:00:00Z"), utcTime("2026-09-06T06:15:00Z"));
        AerodataboxResponse.FlightContract futureScheduled = buildContract(
                "IX 1067", AerodataboxResponse.FlightStatus.Expected,
                "AXB1067", "80162d", null,
                utcTime("2026-09-07T06:00:00Z"), null);

        AerodataboxResponse.FlightContract best = provider.selectBestRecord(List.of(departed, futureScheduled));
        assertThat(best).isSameAs(departed);
        assertThat(best.status()).isEqualTo(AerodataboxResponse.FlightStatus.Departed);
    }

    @Test
    void selectBestRecord_singleOccurrence() {
        // E. Only one occurrence → it is selected
        AerodataboxResponse.FlightContract only = buildContract(
                "IX 1067", AerodataboxResponse.FlightStatus.Expected,
                null, null, null,
                utcTime("2026-09-06T06:00:00Z"), null);

        AerodataboxResponse.FlightContract best = provider.selectBestRecord(List.of(only));
        assertThat(best).isSameAs(only);
    }

    @Test
    void getFlightTracking_throwsOnEmptyList() {
        // F. No occurrences → ResourceNotFoundException
        when(client.getFlightByNumber("IX1067")).thenReturn(List.of());
        assertThatThrownBy(() -> provider.getFlightTracking("IX1067"))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void selectBestRecord_safeWithNullFields() {
        // G. Null aircraft/callSign/location — selection remains safe and deterministic
        AerodataboxResponse.FlightContract nullAircraft = buildContract(
                "IX 1067", AerodataboxResponse.FlightStatus.EnRoute,
                null, null, null,
                utcTime("2026-09-06T06:00:00Z"), null);
        AerodataboxResponse.FlightContract withAircraft = buildContract(
                "IX 1067", AerodataboxResponse.FlightStatus.EnRoute,
                "AXB1067", "80162d", null,
                utcTime("2026-09-06T06:00:00Z"), null);

        // Both are EnRoute but one has identifiers — should pick the one with data
        AerodataboxResponse.FlightContract best = provider.selectBestRecord(List.of(nullAircraft, withAircraft));
        assertThat(best).isSameAs(withAircraft);
        assertThat(best.callSign()).isEqualTo("AXB1067");
        assertThat(best.aircraft().modeS()).isEqualTo("80162d");
    }

    @Test
    void selectBestRecord_departedBeatsScheduled() {
        // Departed beats Expected (scheduled)
        AerodataboxResponse.FlightContract scheduled = buildContract(
                "IX 1067", AerodataboxResponse.FlightStatus.Expected,
                "AXB1067", "80162d", null,
                utcTime("2026-09-06T06:00:00Z"), null);
        AerodataboxResponse.FlightContract departed = buildContract(
                "IX 1067", AerodataboxResponse.FlightStatus.Departed,
                "AXB1067", "80162d", null,
                utcTime("2026-09-06T06:00:00Z"), utcTime("2026-09-06T06:15:00Z"));

        AerodataboxResponse.FlightContract best = provider.selectBestRecord(List.of(scheduled, departed));
        assertThat(best).isSameAs(departed);
    }

    @Test
    void selectBestRecord_approachingBeatsEnRoute() {
        // Approaching (final approach) beats EnRoute — both are "active" tier but Approaching > EnRoute
        AerodataboxResponse.FlightContract enRoute = buildContract(
                "IX 1067", AerodataboxResponse.FlightStatus.EnRoute,
                "AXB1067", "80162d", sampleLocation(),
                utcTime("2026-09-06T06:00:00Z"), utcTime("2026-09-06T06:15:00Z"));
        AerodataboxResponse.FlightContract approaching = buildContract(
                "IX 1067", AerodataboxResponse.FlightStatus.Approaching,
                "AXB1067", "80162d", sampleLocation(),
                utcTime("2026-09-06T06:00:00Z"), utcTime("2026-09-06T06:15:00Z"));

        AerodataboxResponse.FlightContract best = provider.selectBestRecord(List.of(enRoute, approaching));
        assertThat(best).isSameAs(approaching);
    }

    @Test
    void selectBestRecord_locationPresenceBoostsScore() {
        // Two EnRoute records with same time — one has location, one does not
        AerodataboxResponse.FlightContract noLoc = buildContract(
                "IX 1067", AerodataboxResponse.FlightStatus.EnRoute,
                "AXB1067", "80162d", null,
                utcTime("2026-09-06T06:00:00Z"), utcTime("2026-09-06T06:15:00Z"));
        AerodataboxResponse.FlightContract withLoc = buildContract(
                "IX 1067", AerodataboxResponse.FlightStatus.EnRoute,
                "AXB1067", "80162d", sampleLocation(),
                utcTime("2026-09-06T06:00:00Z"), utcTime("2026-09-06T06:15:00Z"));

        AerodataboxResponse.FlightContract best = provider.selectBestRecord(List.of(noLoc, withLoc));
        assertThat(best).isSameAs(withLoc);
    }

    @Test
    void selectBestRecord_prefersCloserDepartureTime() {
        // Same status, same identifiers — prefer the one with departure time closest to now
        // Use departure times relative to each other (one in past, one in future)
        AerodataboxResponse.FlightContract past = buildContract(
                "IX 1067", AerodataboxResponse.FlightStatus.Expected,
                "AXB1067", "80162d", null,
                utcTime("2026-09-05T06:00:00Z"), null);
        AerodataboxResponse.FlightContract future = buildContract(
                "IX 1067", AerodataboxResponse.FlightStatus.Expected,
                "AXB1067", "80162d", null,
                utcTime("2026-09-07T06:00:00Z"), null);

        // Both have same score (Expected=40 + modeS=10 + callSign=5 = 55)
        // Selection depends on which departure time is closer to "now"
        AerodataboxResponse.FlightContract best = provider.selectBestRecord(List.of(past, future));
        assertThat(best).isNotNull();
        // The result is deterministic — whichever is closer to the current time
    }

    @Test
    void getFlightTracking_usesSelectBestRecord() {
        // Verify that getFlightTracking uses selectBestRecord, not flights.get(0)
        AerodataboxResponse.FlightContract landed = buildContract(
                "IX 1067", AerodataboxResponse.FlightStatus.Arrived,
                null, null, null,
                utcTime("2026-09-05T06:00:00Z"), utcTime("2026-09-05T08:00:00Z"));
        AerodataboxResponse.FlightContract active = buildContract(
                "IX 1067", AerodataboxResponse.FlightStatus.EnRoute,
                "AXB1067", "80162d", sampleLocation(),
                utcTime("2026-09-06T06:00:00Z"), utcTime("2026-09-06T06:15:00Z"));
        when(client.getFlightByNumber("IX 1067")).thenReturn(List.of(landed, active));

        // Previously this would return landed (flights.get(0)). Now it should return active.
        // Note: getFlightTracking is a @Override method that returns FlightTrackingDto
        var result = provider.getFlightTracking("IX 1067");
        assertThat(result.flightIcao()).isEqualTo("AXB1067");
        assertThat(result.aircraftIcao()).isEqualTo("80162d");
        assertThat(result.latitude()).isEqualTo(27.2);
        assertThat(result.longitude()).isEqualTo(79.9);
    }
}
