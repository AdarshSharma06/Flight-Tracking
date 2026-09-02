import { Api } from "@/services/api";
import type { BookingRequest, BookingResponse, PageResponse } from "@/types/api";

export const bookingService = {
  create(payload: BookingRequest) {
    return Api.post<BookingResponse>("/api/bookings", payload);
  },
  listMyBookings(): Promise<BookingResponse[]> {
    return Api.get<BookingResponse[]>("/api/bookings");
  },
  listMyBookingsPaginated(page: number, size: number) {
    return Api.get<PageResponse<BookingResponse>>(`/api/bookings?page=${page}&size=${size}`);
  },
  getById(id: number) {
    return Api.get<BookingResponse>(`/api/bookings/${id}`);
  },
};
