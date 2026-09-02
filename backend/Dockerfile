# Multi-stage build for smaller, secure runtime image
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
COPY .mvn .mvn
COPY mvnw mvnw.cmd ./
RUN mvn dependency:go-offline -B
COPY src src
RUN ./mvnw clean package -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
# Create non-root user for security
RUN useradd -m appuser
COPY --from=build /app/target/flight-tracking-backend-0.0.1-SNAPSHOT.jar app.jar
RUN chown appuser:appuser app.jar
USER appuser
EXPOSE 8080
# Render injects PORT; Spring Boot reads ${PORT:8080} from application.yml
ENTRYPOINT ["java", "-jar", "app.jar"]