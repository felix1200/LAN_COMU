// ABOUTME: 轻量全局提示：通过 window 事件分发，由 Toaster 组件渲染

export type ToastKind = 'info' | 'success' | 'error';

export function toast(message: string, kind: ToastKind = 'info'): void {
  window.dispatchEvent(new CustomEvent('app:toast', { detail: { message, kind } }));
}
