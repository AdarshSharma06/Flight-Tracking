package com.flighttracking.service;

import com.flighttracking.dto.flight.FlightDto;
import com.flighttracking.exception.ResourceNotFoundException;
import com.flighttracking.provider.FlightProvider;
import com.flighttracking.provider.TrackingProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FlightServiceDelayTest {

    @Mock
    private FlightProvider flightProvider;

    @Mock
    private TrackingProvider trackingProvider;

    @InjectMocks
    private FlightService service;

    private FlightDto makeDto(String iata, String depDelay, String arrDelay,
                              String depTerminal, String depGate,
                              String arrTerminal, String arrGate) {
        return new FlightDto(
                iata, iata, "AIC" + iata.substring(2),
                "Air India", "AI", "AIC",
                "Delhi Airport", "DEL", "VIDP", depTerminal, depGate,
                "2026-09-01T02:00:00Z", "2026-09-01T02:00:00Z", "2026-09-01T02:45:00Z", depDelay,
                "Sydney Airport", "SYD", "YSSY", arrTerminal, arrGate,
                "2026-09-01T19:05:00Z", "2026-09-01T19:05:00Z", "2026-09-01T19:09:00Z", arrDelay,
                "landed", "VT-ABC", "A320", "abc123"
        );
    }

    @Test
    void departureDelayComputedByProvider() {
        FlightDto dto = makeDto("AI302", "45", "4", "3", "21", "1", "54");
        when(flightProvider.getFlightByNumber("AI302")).thenReturn(dto);

        var result = service.getByFlightNumber("AI302");
        assertThat(result.departureDelay()).isEqualTo("45");
        assertThat(result.arrivalDelay()).isEqualTo("4");
        assertThat(result.departureTerminal()).isEqualTo("3");
        assertThat(result.departureGate()).isEqualTo("21");
    }

    @Test
    void arrivalDelayCorrectWhenConsistent() {
        FlightDto dto = makeDto("AI302", "45", "4", "3", "21", "1", "54");
        when(flightProvider.getFlightByNumber("AI302")).thenReturn(dto);

        var result = service.getByFlightNumber("AI302");
        assertThat(result.arrivalDelay()).isEqualTo("4");
    }

    @Test
    void onTimeFlightDelayNullPreserved() {
        FlightDto dto = makeDto("6E123", null, null, "3", "A", "4", "B");
        when(flightProvider.getFlightByNumber("6E123")).thenReturn(dto);

        var result = service.getByFlightNumber("6E123");
        assertThat(result.departureDelay()).isNull();
        assertThat(result.arrivalDelay()).isNull();
    }

    @Test
    void terminalGatePassthrough() {
        FlightDto dto = makeDto("AI302", "45", "4", "3", "21", "1", "54");
        when(flightProvider.getFlightByNumber("AI302")).thenReturn(dto);

        var result = service.getByFlightNumber("AI302");
        assertThat(result.departureTerminal()).isEqualTo("3");
        assertThat(result.departureGate()).isEqualTo("21");
        assertThat(result.arrivalTerminal()).isEqualTo("1");
        assertThat(result.arrivalGate()).isEqualTo("54");
    }

    @Test
    void flightNotFoundThrows() {
        when(flightProvider.getFlightByNumber("XX999"))
                .thenThrow(new ResourceNotFoundException("Flight not found: XX999"));
        assertThatThrownBy(() -> service.getByFlightNumber("XX999"))
                .isInstanceOf(ResourceNotFoundException.class);
    }
}
