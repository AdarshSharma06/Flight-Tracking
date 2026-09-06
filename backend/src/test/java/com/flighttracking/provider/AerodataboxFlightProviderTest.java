package com.flighttracking.provider;

import com.flighttracking.client.AerodataboxClient;
import com.flighttracking.client.AerodataboxResponse;
import com.flighttracking.dto.flight.FlightDto;
import com.flighttracking.dto.flight.FlightSearchResponse;
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
}
