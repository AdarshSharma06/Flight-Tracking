package com.flighttracking.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
@EnableConfigurationProperties({AviationStackProperties.class, OpenMeteoProperties.class})
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
    public RestClient openMeteoRestClient(RestClient.Builder builder, OpenMeteoProperties props) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(props.timeoutMs());
        factory.setReadTimeout(props.timeoutMs());
        return builder
                .baseUrl(props.baseUrl())
                .requestFactory(factory)
                .build();
    }
}
