import { Api } from "@/services/api";
import type {
  IgnavSearchRequest,
  IgnavSearchResponse,
  IgnavBookingLinksRequest,
  IgnavBookingLinksResponse,
} from "@/types/api";

export const ignavService = {
  search(params: IgnavSearchRequest): Promise<IgnavSearchResponse> {
    return Api.post<IgnavSearchResponse>("/api/ignav/search", params);
  },

  bookingLinks(params: IgnavBookingLinksRequest): Promise<IgnavBookingLinksResponse> {
    return Api.post<IgnavBookingLinksResponse>("/api/ignav/booking-links", params);
  },
};
