package com.flighttracking.dto.weather;

public record WeatherDto(
        double latitude,
        double longitude,
        String timezone,
        double temperature,
        Double apparentTemperature,
        Double humidity,
        Double precipitation,
        Double windSpeed,
        Integer weatherCode,
        String weatherCondition,
        String observationTime
) {
}
