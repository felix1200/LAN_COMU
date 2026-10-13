import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}

export default function Modal({ title, onClose, children, width = 440 }: ModalProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink-900/45 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="max-h-[85vh] w-full overflow-hidden rounded-md border border-line bg-paper shadow-xl"
        style={{ maxWidth: width }}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 className="text-[15px] font-medium text-main">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 text-sub transition-colors duration-100 hover:bg-paper-deep hover:text-main"
            aria-label="关闭"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        <div className="max-h-[calc(85vh-53px)] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
