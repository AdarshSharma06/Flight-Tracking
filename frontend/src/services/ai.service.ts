import { Api } from "./api";

export interface ChatRequest {
  message: string;
}

export interface ChatResponse {
  answer: string;
  model: string;
  requestId: string;
}

export const aiService = {
  chat: (message: string) =>
    Api.post<ChatResponse>("/api/ai/chat", { message }),
};
