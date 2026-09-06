package com.flighttracking.provider;

import com.flighttracking.client.AirlabsClient;
import com.flighttracking.client.AirlabsClient.AirlabsFlight;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AirlabsTrackingProviderTest {

    @Mock
    private AirlabsClient client;

    @InjectMocks
    private AirlabsTrackingProvider provider;

    private AirlabsFlight flight(double lat, double lng, double alt, double speed, double vSpeed, double dir, String status, Long updated) {
        return new AirlabsFlight("6E6706", "IGO6706", lat, lng, alt, dir, speed, vSpeed, status, updated, "800123", "VT-ABC", "A20N", "6E", "IGO", "DEL", "VIDP", "BOM", "VABB");
    }

    @Test
    void getByFlightIata_normalizesWhitespace() {
        when(client.getFlightByIata("6E6706")).thenReturn(flight(19.0, 72.0, 35000.0, 450.0, 0.0, 120.0, "en-route", 1700000000L));

        provider.getByFlightIata("6E 6706");
        verify(client).getFlightByIata("6E6706");

        provider.getByFlightIata(" 6e 6706 ");
        verify(client, times(2)).getFlightByIata("6E6706");
    }

    @Test
    void mapsLatLngAltSpeedVSpeedDirUpdated() {
        AirlabsFlight f = flight(19.09, 72.87, 31000.0, 480.0, 1200.0, 95.0, "en-route", 1700000000L);
        when(client.getFlightByIata("6E6706")).thenReturn(f);

        var opt = provider.getByFlightIata("6E6706");
        assertThat(opt).isPresent();
        var data = opt.get();
        assertThat(data.latitude()).isEqualTo(19.09);
        assertThat(data.longitude()).isEqualTo(72.87);
        assertThat(data.baroAltitude()).isEqualTo(31000.0);
        assertThat(data.geoAltitude()).isEqualTo(31000.0);
        assertThat(data.velocity()).isEqualTo(480.0);
        assertThat(data.verticalRate()).isEqualTo(1200.0);
        assertThat(data.trueTrack()).isEqualTo(95.0);
        assertThat(data.lastContact()).isEqualTo(1700000000L);
        assertThat(data.icao24()).isEqualTo("800123");
        assertThat(data.callsign()).isEqualTo("IGO6706");
    }

    @Test
    void statusEnRouteMapsToNotOnGround() {
        when(client.getFlightByIata("6E6706")).thenReturn(flight(19.0, 72.0, 35000.0, 450.0, 0.0, 120.0, "en-route", 1L));
        assertThat(provider.getByFlightIata("6E6706").get().onGround()).isEqualTo(false);

        when(client.getFlightByIata("6E6706")).thenReturn(flight(19.0, 72.0, 35000.0, 450.0, 0.0, 120.0, "en_route", 1L));
        assertThat(provider.getByFlightIata("6E6706").get().onGround()).isEqualTo(false);
    }

    @Test
    void statusLandedMapsToOnGroundTrue() {
        when(client.getFlightByIata("6E6706")).thenReturn(flight(19.0, 72.0, 0.0, 0.0, 0.0, 0.0, "landed", 1L));
        assertThat(provider.getByFlightIata("6E6706").get().onGround()).isEqualTo(true);
    }

    @Test
    void statusScheduledMapsToNullOnGround() {
        when(client.getFlightByIata("6E6706")).thenReturn(flight(19.0, 72.0, 0.0, 0.0, 0.0, 0.0, "scheduled", 1L));
        assertThat(provider.getByFlightIata("6E6706").get().onGround()).isNull();

        when(client.getFlightByIata("6E6706")).thenReturn(flight(19.0, 72.0, 0.0, 0.0, 0.0, 0.0, "cancelled", 1L));
        assertThat(provider.getByFlightIata("6E6706").get().onGround()).isNull();
    }

    @Test
    void missingLatLngResultsInNullPosition() {
        AirlabsFlight f = new AirlabsFlight("6E6706", "IGO6706", null, null, 35000.0, 120.0, 450.0, 0.0, "en-route", 1L, "800123", "VT-ABC", "A20N", "6E", "IGO", "DEL", "VIDP", "BOM", "VABB");
        when(client.getFlightByIata("6E6706")).thenReturn(f);

        var data = provider.getByFlightIata("6E6706").get();
        assertThat(data.latitude()).isNull();
        assertThat(data.longitude()).isNull();
        assertThat(data.baroAltitude()).isEqualTo(35000.0);
    }

    @Test
    void missingOptionalFieldsDoNotCrash() {
        AirlabsFlight f = new AirlabsFlight("6E6706", null, 19.0, 72.0, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
        when(client.getFlightByIata("6E6706")).thenReturn(f);

        var opt = provider.getByFlightIata("6E6706");
        assertThat(opt).isPresent();
        assertThat(opt.get().latitude()).isEqualTo(19.0);
        assertThat(opt.get().velocity()).isNull();
    }

    @Test
    void clientReturnsNullYieldsEmpty() {
        when(client.getFlightByIata("6E6706")).thenReturn(null);
        assertThat(provider.getByFlightIata("6E6706")).isEmpty();
    }

    @Test
    void clientThrowsReturnsEmpty() {
        doThrow(new com.flighttracking.exception.ExternalApiException("429", 429)).when(client).getFlightByIata(anyString());
        assertThat(provider.getByFlightIata("6E6706")).isEmpty();

        doThrow(new com.flighttracking.exception.ExternalApiException("401", 401)).when(client).getFlightByIata(anyString());
        assertThat(provider.getByFlightIata("6E6706")).isEmpty();

        doThrow(new com.flighttracking.exception.ExternalApiException("500", 500)).when(client).getFlightByIata(anyString());
        assertThat(provider.getByFlightIata("6E6706")).isEmpty();

        doThrow(new RuntimeException("timeout")).when(client).getFlightByIata(anyString());
        assertThat(provider.getByFlightIata("6E6706")).isEmpty();
    }

    @Test
    void blankInputReturnsEmptyWithoutCallingClient() {
        assertThat(provider.getByFlightIata(null)).isEmpty();
        assertThat(provider.getByFlightIata(" ")).isEmpty();
        assertThat(provider.getByFlightIata("")).isEmpty();
        verify(client, never()).getFlightByIata(anyString());
    }

    @Test
    void icao24AndCallsignReturnEmpty() {
        assertThat(provider.getByIcao24("abc123")).isEmpty();
        assertThat(provider.getByCallsign("IGO123")).isEmpty();
    }

    @Test
    void invalidCoordinatesResultInNull() {
        when(client.getFlightByIata("6E6706")).thenReturn(flight(100.0, 72.0, 35000.0, 450.0, 0.0, 120.0, "en-route", 1L));
        var d1 = provider.getByFlightIata("6E6706").get();
        assertThat(d1.latitude()).isNull();
        assertThat(d1.longitude()).isNull();

        when(client.getFlightByIata("6E6706")).thenReturn(flight(19.0, 200.0, 35000.0, 450.0, 0.0, 120.0, "en-route", 1L));
        var d2 = provider.getByFlightIata("6E6706").get();
        assertThat(d2.latitude()).isNull();
        assertThat(d2.longitude()).isNull();
    }

    @Test
    void oneRequestRuleSingleCallPerTracking() {
        when(client.getFlightByIata("6E6706")).thenReturn(flight(19.0, 72.0, 35000.0, 450.0, 0.0, 120.0, "en-route", 1L));
        provider.getByFlightIata("6E6706");
        verify(client, times(1)).getFlightByIata("6E6706");
    }
}
