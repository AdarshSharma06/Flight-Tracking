package com.flighttracking;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.flighttracking.client.AviationStackClient;
import com.flighttracking.client.AviationStackResponse;
import com.flighttracking.dto.booking.BookingRequest;
import com.flighttracking.dto.telemetry.TelemetryRequest;
import com.flighttracking.dto.anomaly.AnomalyRequest;
import com.flighttracking.entity.Role;
import com.flighttracking.entity.User;
import com.flighttracking.repository.BookingRepository;
import com.flighttracking.repository.TelemetryRepository;
import com.flighttracking.repository.AnomalyRecordRepository;
import com.flighttracking.repository.UserRepository;
import com.flighttracking.security.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class Part4IntegrationTest {

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired UserRepository userRepository;
    @Autowired BookingRepository bookingRepository;
    @Autowired TelemetryRepository telemetryRepository;
    @Autowired AnomalyRecordRepository anomalyRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired JwtService jwtService;

    @MockitoBean
    AviationStackClient aviationStackClient;

    @BeforeEach
    void clean() {
        anomalyRepository.deleteAll();
        telemetryRepository.deleteAll();
        bookingRepository.deleteAll();
        userRepository.deleteAll();
    }

    private String registerAndLogin(String username) throws Exception {
        // register via API to ensure same flow
        String reg = objectMapper.writeValueAsString(new com.flighttracking.dto.RegisterRequest(username, "password123"));
        mockMvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(reg))
                .andExpect(status().isCreated());
        String login = objectMapper.writeValueAsString(new com.flighttracking.dto.LoginRequest(username, "password123"));
        MvcResult result = mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(login))
                .andExpect(status().isOk()).andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
    }

    private String atcToken() {
        User atc = new User("atcPart4", passwordEncoder.encode("password123"), Role.ATC_EMPLOYEE);
        userRepository.save(atc);
        return jwtService.generateToken("atcPart4", Role.ATC_EMPLOYEE.name());
    }

    private AviationStackResponse sampleResponseWithLive() {
        AviationStackResponse.Live live = new AviationStackResponse.Live(
                "2026-09-02T10:00:00+0000", 28.5, 77.0, 10000.0, 90.0, 450.0, 5.0, false
        );
        AviationStackResponse.FlightData data = new AviationStackResponse.FlightData(
                "2026-09-01", "active",
                new AviationStackResponse.Departure("Delhi Airport", "Asia/Kolkata", "DEL", "VIDP", "3", "A", null, "2026-09-01T10:00:00+0000", "2026-09-01T10:00:00+0000", null, null, null),
                new AviationStackResponse.Arrival("JFK Airport", "America/New_York", "JFK", "KJFK", "4", "B", null, "2026-09-01T18:00:00+0000", "2026-09-01T18:00:00+0000", null, null, null, null),
                new AviationStackResponse.Airline("IndiGo", "6E", "IGO"),
                new AviationStackResponse.Flight("123", "6E123", "IGO123", null),
                new AviationStackResponse.Aircraft("VT-ABC", "A320", "A320", "abc123"),
                live
        );
        return new AviationStackResponse(new AviationStackResponse.Pagination(10,0,1,1), List.of(data), null);
    }

    // ---- Booking ----

    @Test
    void authenticatedUserCanCreateAndRetrieveBooking() throws Exception {
        String token = registerAndLogin("bookuser1");
        BookingRequest req = new BookingRequest("6E123", "DEL", "JFK", "2026-09-01T10:00:00+0000", "2026-09-01T18:00:00+0000", "IndiGo", "VT-ABC");
        MvcResult res = mockMvc.perform(post("/api/bookings").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.flightNumber").value("6E123"))
                .andExpect(jsonPath("$.origin").value("DEL"))
                .andExpect(jsonPath("$.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.username").value("bookuser1"))
                .andReturn();
        Long id = objectMapper.readTree(res.getResponse().getContentAsString()).get("id").asLong();

        // history
        mockMvc.perform(get("/api/bookings").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(id));

        // get by id
        mockMvc.perform(get("/api/bookings/" + id).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id));
        assertThat(bookingRepository.count()).isEqualTo(1);
    }

    @Test
    void unauthenticatedCannotCreateBooking() throws Exception {
        BookingRequest req = new BookingRequest("6E123", "DEL", "JFK", null, null, null, null);
        mockMvc.perform(post("/api/bookings").contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void unauthenticatedCannotRetrieveBookings() throws Exception {
        mockMvc.perform(get("/api/bookings"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void userCannotRetrieveAnotherUsersBooking() throws Exception {
        String tokenA = registerAndLogin("userA");
        String tokenB = registerAndLogin("userB");
        BookingRequest req = new BookingRequest("6E123", "DEL", "JFK", null, null, null, null);
        MvcResult res = mockMvc.perform(post("/api/bookings").header("Authorization", "Bearer " + tokenA)
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated()).andReturn();
        Long id = objectMapper.readTree(res.getResponse().getContentAsString()).get("id").asLong();

        // userB tries to get userA's booking -> 404 (not found for this user)
        mockMvc.perform(get("/api/bookings/" + id).header("Authorization", "Bearer " + tokenB))
                .andExpect(status().isNotFound());

        // userB history should be empty
        mockMvc.perform(get("/api/bookings").header("Authorization", "Bearer " + tokenB))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void invalidBookingDataRejected() throws Exception {
        String token = registerAndLogin("invalidBook");
        // blank flightNumber
        BookingRequest bad = new BookingRequest("", "DEL", "JFK", null, null, null, null);
        mockMvc.perform(post("/api/bookings").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(bad)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void bookingDoesNotExposePassword() throws Exception {
        String token = registerAndLogin("nopassBook");
        BookingRequest req = new BookingRequest("6E123", "DEL", "JFK", null, null, null, null);
        MvcResult res = mockMvc.perform(post("/api/bookings").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated()).andReturn();
        String body = res.getResponse().getContentAsString();
        assertThat(body).doesNotContain("password");
    }

    // ---- Flight tracking ----

    @Test
    void flightTrackingEndpointWorks() throws Exception {
        String token = registerAndLogin("trackUser");
        when(aviationStackClient.getFlightsByIata("6E123")).thenReturn(sampleResponseWithLive());

        mockMvc.perform(get("/api/flights/6E123/tracking").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.flightIata").value("6E123"))
                .andExpect(jsonPath("$.route").value("DEL -> JFK"))
                .andExpect(jsonPath("$.latitude").value(28.5))
                .andExpect(jsonPath("$.longitude").value(77.0))
                .andExpect(jsonPath("$.altitude").value(10000.0))
                .andExpect(jsonPath("$.speed").value(450.0))
                .andExpect(jsonPath("$.direction").value(90.0));
    }

    @Test
    void trackingUnavailableFieldsHandledAsNull() throws Exception {
        String token = registerAndLogin("trackNull");
        AviationStackResponse noLive = new AviationStackResponse(
                new AviationStackResponse.Pagination(10,0,1,1),
                List.of(new AviationStackResponse.FlightData(
                        "2026-09-01", "scheduled",
                        new AviationStackResponse.Departure("Delhi Airport", "Asia/Kolkata", "DEL", "VIDP", "3", "A", null, "2026-09-01T10:00:00+0000", "2026-09-01T10:00:00+0000", null, null, null),
                        new AviationStackResponse.Arrival("JFK Airport", "America/New_York", "JFK", "KJFK", "4", "B", null, "2026-09-01T18:00:00+0000", "2026-09-01T18:00:00+0000", null, null, null, null),
                        new AviationStackResponse.Airline("IndiGo", "6E", "IGO"),
                        new AviationStackResponse.Flight("123", "6E999", "IGO999", null),
                        new AviationStackResponse.Aircraft("VT-ABC", "A320", "A320", "abc123"),
                        null
                )), null);
        when(aviationStackClient.getFlightsByIata("6E999")).thenReturn(noLive);
        mockMvc.perform(get("/api/flights/6E999/tracking").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.flightIata").value("6E999"))
                .andExpect(jsonPath("$.latitude").doesNotExist());
    }

    @Test
    void flightSearchSorting() throws Exception {
        String token = registerAndLogin("sortUser");
        AviationStackResponse.FlightData d1 = new AviationStackResponse.FlightData(
                "2026-09-01", "scheduled",
                new AviationStackResponse.Departure("Delhi Airport", "Asia/Kolkata", "DEL", "VIDP", "3", "A", null, "2026-09-01T12:00:00+0000", null, null, null, null),
                new AviationStackResponse.Arrival("JFK", "America/New_York", "JFK", "KJFK", "4", "B", null, "2026-09-01T18:00:00+0000", null, null, null, null, null),
                new AviationStackResponse.Airline("A1", "AA", "AAL"), new AviationStackResponse.Flight("1","AA100","AAL100",null),
                new AviationStackResponse.Aircraft("N1","A320","A320","irc"), null);
        AviationStackResponse.FlightData d2 = new AviationStackResponse.FlightData(
                "2026-09-01", "scheduled",
                new AviationStackResponse.Departure("Delhi Airport", "Asia/Kolkata", "DEL", "VIDP", "3", "A", null, "2026-09-01T10:00:00+0000", null, null, null, null),
                new AviationStackResponse.Arrival("JFK", "America/New_York", "JFK", "KJFK", "4", "B", null, "2026-09-01T18:00:00+0000", null, null, null, null, null),
                new AviationStackResponse.Airline("A2", "BB", "BBA"), new AviationStackResponse.Flight("2","BB200","BBA200",null),
                new AviationStackResponse.Aircraft("N2","A320","A320","irc2"), null);
        AviationStackResponse resp = new AviationStackResponse(new AviationStackResponse.Pagination(10,0,2,2), List.of(d1,d2), null);
        when(aviationStackClient.searchFlights(any(), any(), any(), any(), any(), any())).thenReturn(resp);

        // sort by flight_number asc: AA100 should be first
        mockMvc.perform(get("/api/flights/search").param("sortBy","flight_number").param("order","asc").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.flights[0].flightIata").value("AA100"))
                .andExpect(jsonPath("$.flights[1].flightIata").value("BB200"));
    }

    // ---- ATC telemetry & anomaly ----

    @Test
    void atcEndpointsRequireAtcRole() throws Exception {
        // unauthenticated -> 401
        mockMvc.perform(get("/api/atc/telemetry"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/atc/anomalies"))
                .andExpect(status().isUnauthorized());

        String userToken = registerAndLogin("normalAtcTest");
        // USER -> 403
        mockMvc.perform(get("/api/atc/telemetry").header("Authorization", "Bearer " + userToken))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/atc/telemetry").header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/atc/anomalies").header("Authorization", "Bearer " + userToken))
                .andExpect(status().isForbidden());

        // ATC_EMPLOYEE -> 200
        String atc = atcToken();
        mockMvc.perform(get("/api/atc/telemetry").header("Authorization", "Bearer " + atc))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/atc/anomalies").header("Authorization", "Bearer " + atc))
                .andExpect(status().isOk());
    }

    @Test
    void telemetryPersistenceAndRetrieval() throws Exception {
        String atc = atcToken();
        TelemetryRequest req = new TelemetryRequest("6E123", "6E123", "IGO123", "6E", "DEL", "JFK", 28.5, 77.0, 10000.0, 450.0, 90.0, 90.0, "active", "DEL -> JFK", "VT-ABC");
        MvcResult res = mockMvc.perform(post("/api/atc/telemetry").header("Authorization", "Bearer " + atc)
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.flightNumber").value("6E123"))
                .andExpect(jsonPath("$.latitude").value(28.5))
                .andExpect(jsonPath("$.altitude").value(10000.0))
                .andReturn();
        Long id = objectMapper.readTree(res.getResponse().getContentAsString()).get("id").asLong();

        mockMvc.perform(get("/api/atc/telemetry").header("Authorization", "Bearer " + atc))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(id));

        mockMvc.perform(get("/api/atc/telemetry/" + id).header("Authorization", "Bearer " + atc))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.routeInfo").value("DEL -> JFK"));
    }

    @Test
    void anomalyRecordPersistenceAndRetrieval() throws Exception {
        String atc = atcToken();
        // create telemetry first
        TelemetryRequest treq = new TelemetryRequest("6E123", "6E123", null, null, "DEL", "JFK", 28.5, 77.0, 5000.0, 300.0, 45.0, null, "active", null, null);
        MvcResult tres = mockMvc.perform(post("/api/atc/telemetry").header("Authorization", "Bearer " + atc)
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(treq)))
                .andExpect(status().isCreated()).andReturn();
        Long telId = objectMapper.readTree(tres.getResponse().getContentAsString()).get("id").asLong();

        AnomalyRequest areq = new AnomalyRequest("6E123", "6E123", "ALTITUDE_DEVIATION", "HIGH", "Altitude dropped unexpectedly", "OPEN", telId);
        MvcResult ares = mockMvc.perform(post("/api/atc/anomalies").header("Authorization", "Bearer " + atc)
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(areq)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.anomalyType").value("ALTITUDE_DEVIATION"))
                .andExpect(jsonPath("$.severity").value("HIGH"))
                .andExpect(jsonPath("$.telemetryId").value(telId))
                .andReturn();
        Long aid = objectMapper.readTree(ares.getResponse().getContentAsString()).get("id").asLong();

        mockMvc.perform(get("/api/atc/anomalies").header("Authorization", "Bearer " + atc))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(aid));

        mockMvc.perform(get("/api/atc/anomalies/" + aid).header("Authorization", "Bearer " + atc))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.flightNumber").value("6E123"));
    }

    @Test
    void anomalyInvalidSeverityRejected() throws Exception {
        String atc = atcToken();
        AnomalyRequest bad = new AnomalyRequest("6E123", null, "TEST", "INVALID_SEV", "desc", null, null);
        mockMvc.perform(post("/api/atc/anomalies").header("Authorization", "Bearer " + atc)
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(bad)))
                .andExpect(status().isBadRequest());
    }
}
