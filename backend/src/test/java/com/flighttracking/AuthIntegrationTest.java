package com.flighttracking;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.flighttracking.dto.LoginRequest;
import com.flighttracking.dto.RegisterRequest;
import com.flighttracking.entity.Role;
import com.flighttracking.entity.User;
import com.flighttracking.repository.UserRepository;
import com.flighttracking.security.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class AuthIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtService jwtService;

    @BeforeEach
    void clean() {
        userRepository.deleteAll();
    }

    @Test
    void registerCreatesUserWithHashedPasswordAndUserRole() throws Exception {
        RegisterRequest req = new RegisterRequest("testuser", "password123");
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.username").value("testuser"))
                .andExpect(jsonPath("$.role").value("USER"))
                .andExpect(jsonPath("$.message").exists());

        User saved = userRepository.findByUsername("testuser").orElseThrow();
        assertThat(saved.getRole()).isEqualTo(Role.USER);
        assertThat(saved.getPassword()).isNotEqualTo("password123");
        assertThat(passwordEncoder.matches("password123", saved.getPassword())).isTrue();
        // Verify password starts with BCrypt prefix
        assertThat(saved.getPassword()).startsWith("$2a$");
    }

    @Test
    void duplicateUsernameIsRejected() throws Exception {
        RegisterRequest req = new RegisterRequest("dupuser", "password123");
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void registerCannotAssignAdminRole() throws Exception {
        // Attempt to inject role via extra JSON field - should be ignored, still USER
        String payload = """
                {"username":"hacker","password":"password123","role":"ADMIN"}
                """;
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.role").value("USER"));

        User saved = userRepository.findByUsername("hacker").orElseThrow();
        assertThat(saved.getRole()).isEqualTo(Role.USER);
    }

    @Test
    void registerValidationFailsForBlankFields() throws Exception {
        RegisterRequest req = new RegisterRequest("", "");
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void passwordNeverReturnedInResponse() throws Exception {
        RegisterRequest req = new RegisterRequest("nopass", "password123");
        MvcResult result = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andReturn();
        String body = result.getResponse().getContentAsString();
        assertThat(body).doesNotContain("password");
        assertThat(body).doesNotContain("password123");
    }

    @Test
    void loginReturnsJwtAndRejectsInvalidCredentials() throws Exception {
        RegisterRequest reg = new RegisterRequest("loginuser", "password123");
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(reg)))
                .andExpect(status().isCreated());

        LoginRequest login = new LoginRequest("loginuser", "password123");
        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(login)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").exists())
                .andReturn();

        String token = objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
        assertThat(token).isNotBlank();
        // Verify JWT contains username and role
        assertThat(jwtService.extractUsername(token)).isEqualTo("loginuser");
        assertThat(jwtService.extractRole(token)).isEqualTo("USER");

        // Wrong password -> 401
        LoginRequest bad = new LoginRequest("loginuser", "wrongpass");
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(bad)))
                .andExpect(status().isUnauthorized());

        // Non-existent user -> 401
        LoginRequest noUser = new LoginRequest("nouser", "password123");
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(noUser)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void testUserEndpointRequiresAuthentication() throws Exception {
        // Without JWT -> 401
        mockMvc.perform(get("/api/test/user"))
                .andExpect(status().isUnauthorized());

        // Register and login to get token
        RegisterRequest reg = new RegisterRequest("authuser", "password123");
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(reg)))
                .andExpect(status().isCreated());

        LoginRequest login = new LoginRequest("authuser", "password123");
        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(login)))
                .andExpect(status().isOk())
                .andReturn();
        String token = objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();

        // With valid JWT -> 200
        mockMvc.perform(get("/api/test/user")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Authenticated user access successful"));

        // With invalid token -> 401
        mockMvc.perform(get("/api/test/user")
                        .header("Authorization", "Bearer invalidtoken"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void atcEndpointAuthorization() throws Exception {
        // Without JWT -> 401
        mockMvc.perform(get("/api/atc/test"))
                .andExpect(status().isUnauthorized());

        // Register normal USER
        RegisterRequest reg = new RegisterRequest("normaluser", "password123");
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(reg)))
                .andExpect(status().isCreated());

        LoginRequest login = new LoginRequest("normaluser", "password123");
        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(login)))
                .andExpect(status().isOk())
                .andReturn();
        String userToken = objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();

        // USER token -> 403 on ATC endpoint
        mockMvc.perform(get("/api/atc/test")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isForbidden());

        // Create ATC_EMPLOYEE directly in DB (simulating SQL update for testing)
        User atcUser = new User("atcuser", passwordEncoder.encode("password123"), Role.ATC_EMPLOYEE);
        userRepository.save(atcUser);
        String atcToken = jwtService.generateToken("atcuser", Role.ATC_EMPLOYEE.name());

        // ATC_EMPLOYEE token -> 200
        mockMvc.perform(get("/api/atc/test")
                        .header("Authorization", "Bearer " + atcToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("ATC employee access successful"));

        // ADMIN token -> should be 403 in current design (only ATC_EMPLOYEE allowed)
        User admin = new User("adminuser", passwordEncoder.encode("password123"), Role.ADMIN);
        userRepository.save(admin);
        String adminToken = jwtService.generateToken("adminuser", Role.ADMIN.name());
        mockMvc.perform(get("/api/atc/test")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isForbidden());
    }

    @Test
    void statelessJwtAuthentication() throws Exception {
        // Ensure no session is created; two requests with same token both succeed independently
        RegisterRequest reg = new RegisterRequest("stateless", "password123");
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(reg)))
                .andExpect(status().isCreated());

        LoginRequest login = new LoginRequest("stateless", "password123");
        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(login)))
                .andReturn();
        String token = objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();

        for (int i = 0; i < 2; i++) {
            mockMvc.perform(get("/api/test/user")
                            .header("Authorization", "Bearer " + token))
                    .andExpect(status().isOk());
        }
    }
}
