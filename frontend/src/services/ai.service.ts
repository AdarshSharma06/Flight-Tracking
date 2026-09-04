import { Api } from "./api";

export interface ChatRequest {
  message: string;
  conversationId?: string;
}

export interface ChatResponse {
  answer: string;
  model: string;
  requestId: string;
  conversationId?: string;
}

export const aiService = {
  chat: (message: string, conversationId?: string) =>
    Api.post<ChatResponse>("/api/ai/chat", {
      message,
      ...(conversationId ? { conversationId } : {}),
    }),
};
