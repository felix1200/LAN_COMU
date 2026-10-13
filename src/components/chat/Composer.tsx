import { Loader2, Paperclip, Send } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { api } from '../../api/client';
import type { FileRef } from '../../api/types';
import { toast } from '../../lib/toast';
import { useChat } from '../../store/chat';

export default function Composer() {
  const { sendMessage, sendTyping } = useChat();
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function autoResize() {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
    }
  }

  function handleSend() {
    const value = text.trim();
    if (!value) {
      return;
    }
    sendMessage('text', value);
    setText('');
    requestAnimationFrame(() => {
      autoResize();
      textareaRef.current?.focus();
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // isComposing：中文输入法组词期间不回车发送
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handlePicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) {
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api<{ file: FileRef }>('/api/files/upload', { formData });
      sendMessage('file', res.file.name, res.file);
    } catch (err) {
      toast(err instanceof Error ? err.message : '文件上传失败', 'error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="shrink-0 border-t border-line bg-paper px-4 pb-3 pt-2.5">
      <div className="flex items-end gap-2">
        <div className="flex gap-1 pb-1.5">
          <button
            type="button"
            title="发送文件（≤100MB）"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md p-2 text-sub transition-colors duration-100 hover:bg-paper-deep hover:text-main disabled:opacity-50"
          >
            <Paperclip size={17} strokeWidth={1.75} />
          </button>
        </div>

        <textarea
          ref={textareaRef}
          value={text}
          rows={1}
          maxLength={2000}
          onChange={(e) => {
            setText(e.target.value);
            autoResize();
            sendTyping();
          }}
          onKeyDown={handleKeyDown}
          placeholder="输入消息，Enter 发送，Shift+Enter 换行（≤2000 字）"
          className="max-h-32 flex-1 resize-none rounded-md border border-line bg-white px-3 py-2.5 text-[14px] leading-[1.6] outline-none transition-colors duration-100 focus:border-signal"
        />

        <button
          type="button"
          onClick={handleSend}
          disabled={!text.trim() || uploading}
          title="发送"
          className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-signal text-white transition-colors duration-100 hover:bg-signal-deep disabled:opacity-40"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} strokeWidth={1.75} />}
        </button>
      </div>

      <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => void handlePicked(e)} />
    </div>
  );
}
