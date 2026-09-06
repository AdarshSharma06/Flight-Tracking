package com.flighttracking.util;

/**
 * Canonical flight-number normalization for commercial flight identifiers.
 * Ensures whitespace/display formatting does not leak into provider paths.
 */
public final class FlightNumberUtils {

    private FlightNumberUtils() {}

    /**
     * Normalize a commercial flight number.
     * <ul>
     *   <li>null → null</li>
     *   <li>trim leading/trailing whitespace</li>
     *   <li>upper-case</li>
     *   <li>remove all internal whitespace (spaces, tabs, etc.)</li>
     * </ul>
     * Examples: "6E 589" → "6E589", " 6e 589 " → "6E589", "6E589" → "6E589"
     */
    public static String normalize(String flightNumber) {
        if (flightNumber == null) return null;
        String trimmed = flightNumber.trim();
        if (trimmed.isEmpty()) return trimmed;
        return trimmed.toUpperCase().replaceAll("\\s+", "");
    }
}
