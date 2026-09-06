package com.flighttracking.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class FlightNumberUtilsTest {

    @Test
    void normalize_removesInternalSpace() {
        assertThat(FlightNumberUtils.normalize("6E 589")).isEqualTo("6E589");
    }

    @Test
    void normalize_trimsAndUppercases() {
        assertThat(FlightNumberUtils.normalize("6e589")).isEqualTo("6E589");
        assertThat(FlightNumberUtils.normalize(" 6E589 ")).isEqualTo("6E589");
        assertThat(FlightNumberUtils.normalize(" 6E 589 ")).isEqualTo("6E589");
        assertThat(FlightNumberUtils.normalize("6e 589")).isEqualTo("6E589");
    }

    @Test
    void normalize_allWhitespaceVariantsProduceSameKey() {
        String expected = "6E589";
        assertThat(FlightNumberUtils.normalize("6E589")).isEqualTo(expected);
        assertThat(FlightNumberUtils.normalize("6E 589")).isEqualTo(expected);
        assertThat(FlightNumberUtils.normalize(" 6E 589 ")).isEqualTo(expected);
        assertThat(FlightNumberUtils.normalize("6e 589")).isEqualTo(expected);
        assertThat(FlightNumberUtils.normalize(" 6e 589 ")).isEqualTo(expected);
    }

    @Test
    void normalize_nullAndBlank() {
        assertThat(FlightNumberUtils.normalize(null)).isNull();
        assertThat(FlightNumberUtils.normalize("")).isEqualTo("");
        assertThat(FlightNumberUtils.normalize("   ")).isEqualTo("");
    }

    @Test
    void normalize_preservesNormalFlightNumbers() {
        assertThat(FlightNumberUtils.normalize("AI1745")).isEqualTo("AI1745");
        assertThat(FlightNumberUtils.normalize("6E6218")).isEqualTo("6E6218");
        assertThat(FlightNumberUtils.normalize("QP1119")).isEqualTo("QP1119");
        assertThat(FlightNumberUtils.normalize("IX1067")).isEqualTo("IX1067");
    }

    @Test
    void normalize_removesMultipleSpacesAndTabs() {
        assertThat(FlightNumberUtils.normalize("6E  589")).isEqualTo("6E589");
        assertThat(FlightNumberUtils.normalize("6E\t589")).isEqualTo("6E589");
    }
}
