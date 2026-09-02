package com.flighttracking.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI flightTrackingOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("Flight Tracking API")
                        .description("Flight Tracking backend - Auth, Flights, Airports, Weather, Bookings, ATC telemetry & anomalies. "
                                + "Use Bearer JWT for authenticated endpoints.")
                        .version("5.0.0"))
                .addSecurityItem(new SecurityRequirement().addList("bearerAuth"))
                .components(new Components()
                        .addSecuritySchemes("bearerAuth",
                                new SecurityScheme()
                                        .type(SecurityScheme.Type.HTTP)
                                        .scheme("bearer")
                                        .bearerFormat("JWT")
                                        .description("Provide JWT via Authorization: Bearer <token> header. Obtain via POST /api/auth/login.")));
    }
}
