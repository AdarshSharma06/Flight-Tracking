package com.flighttracking.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
@EnableConfigurationProperties({AviationStackProperties.class, AerodataboxProperties.class, OpenSkyProperties.class, OpenMeteoProperties.class, AirlabsProperties.class, IgnavProperties.class, GoogleWeatherProperties.class, OverpassProperties.class})
public class RestClientConfig {

    @Bean
    public RestClient.Builder restClientBuilder() {
        return RestClient.builder();
    }

    @Bean
    public RestClient aviationStackRestClient(RestClient.Builder builder, AviationStackProperties props) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(props.timeoutMs());
        factory.setReadTimeout(props.timeoutMs());
        return builder
                .baseUrl(props.baseUrl())
                .requestFactory(factory)
                .build();
    }

    @Bean
    public RestClient aerodataboxRestClient(RestClient.Builder builder, AerodataboxProperties props) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(props.timeoutMs());
        factory.setReadTimeout(props.timeoutMs());
        return builder
                .clone()
                .baseUrl(props.baseUrl())
                .requestFactory(factory)
                .build();
    }

    @Bean
    public RestClient openSkyRestClient(RestClient.Builder builder, OpenSkyProperties props) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(props.timeoutMs());
        factory.setReadTimeout(props.timeoutMs());
        return builder
                .clone()
                .baseUrl(props.baseUrl())
                .requestFactory(factory)
                .build();
    }

    @Bean
    public RestClient openMeteoRestClient(RestClient.Builder builder, OpenMeteoProperties props) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(props.timeoutMs());
        factory.setReadTimeout(props.timeoutMs());
        return builder
                .baseUrl(props.baseUrl())
                .requestFactory(factory)
                .build();
    }

    @Bean
    public RestClient airlabsRestClient(RestClient.Builder builder, AirlabsProperties props) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(props.timeoutMs());
        factory.setReadTimeout(props.timeoutMs());
        return builder
                .clone()
                .baseUrl(props.baseUrl())
                .requestFactory(factory)
                .build();
    }

    @Bean
    public RestClient ignavRestClient(RestClient.Builder builder, IgnavProperties props) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(props.timeoutMs());
        factory.setReadTimeout(props.timeoutMs());
        String base = props.baseUrl() != null && !props.baseUrl().isBlank() ? props.baseUrl() : "https://api.ignav.com";
        return builder
                .clone()
                .baseUrl(base)
                .requestFactory(factory)
                .build();
    }

    @Bean
    public RestClient googleWeatherRestClient(RestClient.Builder builder, GoogleWeatherProperties props) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(props.timeoutMs());
        factory.setReadTimeout(props.timeoutMs());
        String base = props.baseUrl() != null && !props.baseUrl().isBlank() ? props.baseUrl() : "https://weather.googleapis.com";
        return builder
                .clone()
                .baseUrl(base)
                .requestFactory(factory)
                .build();
    }

    @Bean
    public RestClient overpassRestClient(RestClient.Builder builder, OverpassProperties props) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(props.timeoutMs());
        factory.setReadTimeout(props.timeoutMs());
        String base = props.baseUrl() != null && !props.baseUrl().isBlank() ? props.baseUrl() : "https://overpass.private.coffee";
        return builder
                .clone()
                .baseUrl(base)
                .defaultHeader("User-Agent", "FlightTracking-AirportExplorer/1.0")
                .requestFactory(factory)
                .build();
    }

    @Bean
    public RestClient overpassSecondaryRestClient(RestClient.Builder builder, OverpassProperties props) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(props.timeoutMs());
        factory.setReadTimeout(props.timeoutMs());
        String base = props.fallbackUrl() != null && !props.fallbackUrl().isBlank() ? props.fallbackUrl() : "https://maps.mail.ru/osm/tools/overpass";
        return builder
                .clone()
                .baseUrl(base)
                .defaultHeader("User-Agent", "FlightTracking-AirportExplorer/1.0")
                .requestFactory(factory)
                .build();
    }

    @Bean
    public RestClient overpassFallbackRestClient(RestClient.Builder builder, OverpassProperties props) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(props.timeoutMs());
        factory.setReadTimeout(props.timeoutMs());
        String base = props.fallbackUrl2() != null && !props.fallbackUrl2().isBlank() ? props.fallbackUrl2() : "https://overpass-api.de";
        return builder
                .clone()
                .baseUrl(base)
                .defaultHeader("User-Agent", "FlightTracking-AirportExplorer/1.0")
                .requestFactory(factory)
                .build();
    }
}
