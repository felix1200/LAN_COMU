import { useEffect, useState } from 'react';
import type { ToastKind } from '../lib/toast';

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

const KIND_STYLES: Record<ToastKind, string> = {
  info: 'border-ink-line bg-ink-900 text-paper',
  success: 'border-signal bg-signal text-white',
  error: 'border-danger bg-danger text-white',
};

export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string; kind: ToastKind }>).detail;
      const id = Date.now() + Math.random();
      setItems((prev) => [...prev.slice(-3), { id, message: detail.message, kind: detail.kind }]);
      setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }, 3200);
    };
    window.addEventListener('app:toast', handler);
    return () => window.removeEventListener('app:toast', handler);
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={`toast-in rounded-md border px-4 py-2 text-[13px] shadow-md ${KIND_STYLES[item.kind]}`}
        >
          {item.message}
        </div>
      ))}
    </div>
  );
}
