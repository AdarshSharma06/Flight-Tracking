package com.flighttracking.service;

import com.flighttracking.dto.AuthResponse;
import com.flighttracking.dto.LoginRequest;
import com.flighttracking.dto.RegisterRequest;
import com.flighttracking.dto.RegisterResponse;
import com.flighttracking.entity.Role;
import com.flighttracking.entity.User;
import com.flighttracking.repository.UserRepository;
import com.flighttracking.security.JwtService;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    @Transactional
    public RegisterResponse register(RegisterRequest request) {
        if (userRepository.existsByUsername(request.username())) {
            throw new IllegalArgumentException("Username already exists");
        }

        String hashedPassword = passwordEncoder.encode(request.password());
        User user = new User(request.username(), hashedPassword, Role.USER);
        user = userRepository.save(user);

        return new RegisterResponse(
                user.getId(),
                user.getUsername(),
                user.getRole().name(),
                "User registered successfully"
        );
    }

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByUsername(request.username())
                .orElseThrow(() -> new BadCredentialsException("Invalid username or password"));

        if (!passwordEncoder.matches(request.password(), user.getPassword())) {
            throw new BadCredentialsException("Invalid username or password");
        }

        String token = jwtService.generateToken(user.getUsername(), user.getRole().name());
        return new AuthResponse(token);
    }
}
