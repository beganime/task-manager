import { useEffect, useRef } from "react";

import { api, ApiError, websocketUrl } from "./client";

export interface RealtimeMessage {
  type?: string;
  data?: { title?: string; body?: string; task_id?: number | null };
}

const MAX_DELAY_MS = 30_000;
const UNAUTHORIZED_CLOSE = 4401;

/**
 * Подписка на уведомления в реальном времени.
 * Каждое подключение получает свой короткоживущий билет (POST /auth/ws-ticket):
 * JWT не попадает в URL, а при обрыве связи переподключаемся с экспоненциальной паузой.
 */
export function useRealtime(token: string | null, onMessage: (message: RealtimeMessage) => void): void {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    if (!token) return;
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let stopped = false;

    const schedule = () => {
      if (stopped) return;
      const delay = Math.min(MAX_DELAY_MS, 1000 * 2 ** attempt) + Math.round(Math.random() * 400);
      attempt += 1;
      timer = setTimeout(() => void connect(), delay);
    };

    const connect = async () => {
      if (stopped) return;
      try {
        const { ticket } = await api.wsTicket(token);
        if (stopped) return;
        socket = new WebSocket(websocketUrl(ticket));
        socket.onopen = () => {
          attempt = 0;
        };
        socket.onmessage = (event) => {
          try {
            handlerRef.current(JSON.parse(String(event.data)) as RealtimeMessage);
          } catch {
            handlerRef.current({});
          }
        };
        socket.onclose = (event) => {
          socket = null;
          // 4401 — токен отозван: переподключаться бессмысленно, 401-обработчик разлогинит.
          if (event.code !== UNAUTHORIZED_CLOSE) schedule();
        };
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) return;
        schedule();
      }
    };

    void connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    };
  }, [token]);
}
