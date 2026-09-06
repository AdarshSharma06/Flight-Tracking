package com.flighttracking.client;

import com.flighttracking.config.AerodataboxProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.client.RestClient;

import java.net.URI;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AerodataboxClientTest {

    @Mock
    private AerodataboxProperties properties;

    @Mock
    private RestClient restClient;

    @Mock
    private RestClient.RequestHeadersUriSpec requestHeadersUriSpec;

    @Mock
    private RestClient.RequestHeadersSpec requestHeadersSpec;

    @Mock
    private RestClient.ResponseSpec responseSpec;

    @InjectMocks
    private AerodataboxClient client;

    @Test
    void getFlightByNumberTriesSingleDayFirstForToday() {
        // getFlightByNumber should try single-day endpoint (with withLocation) for today first
        AerodataboxClient spyClient = spy(client);
        LocalDate today = LocalDate.now();
        String todayStr = today.format(DateTimeFormatter.ISO_LOCAL_DATE);

        AerodataboxResponse.FlightContract mockFlight = mock(AerodataboxResponse.FlightContract.class);
        doReturn(List.of(mockFlight))
                .when(spyClient).getFlightByNumberOnDate("6E123", todayStr);

        List<AerodataboxResponse.FlightContract> result = spyClient.getFlightByNumber("6E123");

        // Should call single-day endpoint for today
        verify(spyClient).getFlightByNumberOnDate("6E123", todayStr);
        // Should NOT fall back to date-range since single-day returned results
        verify(spyClient, never()).getFlightsByDateRange(anyString(), anyString(), anyString(), anyString());
        assertThat(result).hasSize(1);
    }

    @Test
    void getFlightByNumberFallsBackToDateTimeRangeWhenSingleDayEmpty() {
        // When single-day endpoint returns empty, fall back to date-range
        AerodataboxClient spyClient = spy(client);
        LocalDate today = LocalDate.now();
        String todayStr = today.format(DateTimeFormatter.ISO_LOCAL_DATE);
        String expectedFrom = today.minusDays(1).format(DateTimeFormatter.ISO_LOCAL_DATE);
        String expectedTo = today.plusDays(3).format(DateTimeFormatter.ISO_LOCAL_DATE);

        AerodataboxResponse.FlightContract mockFlight = mock(AerodataboxResponse.FlightContract.class);
        doReturn(List.<AerodataboxResponse.FlightContract>of())
                .when(spyClient).getFlightByNumberOnDate("6E123", todayStr);
        doReturn(List.of(mockFlight))
                .when(spyClient).getFlightsByDateRange("number", "6E123", expectedFrom, expectedTo);

        List<AerodataboxResponse.FlightContract> result = spyClient.getFlightByNumber("6E123");

        verify(spyClient).getFlightByNumberOnDate("6E123", todayStr);
        verify(spyClient).getFlightsByDateRange("number", "6E123", expectedFrom, expectedTo);
        assertThat(result).hasSize(1);
    }

    @Test
    void getFlightByNumberDateRangeCoversYesterdayToPlus3() {
        AerodataboxClient spyClient = spy(client);
        LocalDate today = LocalDate.now();
        String todayStr = today.format(DateTimeFormatter.ISO_LOCAL_DATE);

        doReturn(List.<AerodataboxResponse.FlightContract>of())
                .when(spyClient).getFlightByNumberOnDate(anyString(), anyString());
        doReturn(List.<AerodataboxResponse.FlightContract>of())
                .when(spyClient).getFlightsByDateRange(anyString(), anyString(), anyString(), anyString());

        spyClient.getFlightByNumber("AA100");

        ArgumentCaptor<String> fromCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> toCaptor = ArgumentCaptor.forClass(String.class);

        verify(spyClient).getFlightsByDateRange(
                eq("number"), eq("AA100"), fromCaptor.capture(), toCaptor.capture());

        LocalDate dateFrom = LocalDate.parse(fromCaptor.getValue());
        LocalDate dateTo = LocalDate.parse(toCaptor.getValue());

        assertThat(dateFrom).isEqualTo(today.minusDays(1));
        assertThat(dateTo).isEqualTo(today.plusDays(3));
        assertThat(dateTo).isAfter(dateFrom);
    }
}
