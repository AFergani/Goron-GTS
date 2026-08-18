/**
 * Hook de pile de toasts (max 4, disparition auto, fermeture au clic).
 * Inspiré du NotificationManager RenExtract.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  TOAST_DURATIONS_MS,
  TOAST_STACK_MAX,
  type NotifyToast,
  type ToastItem,
  type ToastVariant
} from "../model/toast.types";

function createToastId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Gère l'état de la pile de notifications toast.
 *
 * @returns toasts visibles, notify (push), dismiss (retrait manuel)
 */
export function useToastStack(): {
  toasts: ToastItem[];
  notify: NotifyToast;
  dismiss: (id: string) => void;
} {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearTimer = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    },
    [clearTimer]
  );

  const scheduleDismiss = useCallback(
    (id: string, durationMs: number) => {
      clearTimer(id);
      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, durationMs);
      timersRef.current.set(id, timer);
    },
    [clearTimer]
  );

  const notify = useCallback<NotifyToast>(
    (message, variant = "success") => {
      const trimmed = String(message || "").trim();
      if (!trimmed) return;

      const resolvedVariant: ToastVariant =
        variant === "success" || variant === "warning" || variant === "error" ? variant : "success";
      const durationMs = TOAST_DURATIONS_MS[resolvedVariant];
      const item: ToastItem = {
        id: createToastId(),
        message: trimmed,
        variant: resolvedVariant,
        durationMs
      };

      setToasts((prev) => {
        const next = [...prev, item];
        if (next.length <= TOAST_STACK_MAX) return next;
        const evicted = next.slice(0, next.length - TOAST_STACK_MAX);
        for (const old of evicted) clearTimer(old.id);
        return next.slice(-TOAST_STACK_MAX);
      });
      scheduleDismiss(item.id, durationMs);
    },
    [clearTimer, scheduleDismiss]
  );

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
    };
  }, []);

  return { toasts, notify, dismiss };
}
