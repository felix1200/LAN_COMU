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
  const [progress, setProgress] = useState(0);
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

  const CHUNK_SIZE = 4 * 1024 * 1024; // 分片 4MB，逐片直传，规避代理对单请求大小的限制/超时
  const MAX_ATTEMPTS = 3;

  function newUploadId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID().replace(/-/g, '').slice(0, 32);
    }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function uploadFileChunked(file: File): Promise<FileRef> {
    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
    const uploadId = newUploadId();
    const mime = file.type || 'application/octet-stream';

    for (let i = 0; i < totalChunks; i += 1) {
      const blob = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const formData = new FormData();
      formData.append('file', blob, file.name);
      formData.append('uploadId', uploadId);
      formData.append('chunkIndex', String(i));
      formData.append('totalChunks', String(totalChunks));
      formData.append('totalSize', String(file.size));
      formData.append('originalName', file.name);
      formData.append('mime', mime);

      let lastErr: unknown = null;
      let uploaded = false;
      for (let attempt = 0; attempt < MAX_ATTEMPTS && !uploaded; attempt += 1) {
        try {
          await api('/api/files/upload/chunk', { formData });
          uploaded = true;
        } catch (err) {
          lastErr = err;
          if (attempt < MAX_ATTEMPTS - 1) {
            await sleep(500 * (attempt + 1));
          }
        }
      }
      if (!uploaded) {
        throw lastErr instanceof Error ? lastErr : new Error('分片上传失败');
      }
      setProgress(Math.round(((i + 1) / totalChunks) * 100));
    }

    const res = await api<{ file: FileRef }>('/api/files/upload/finalize', {
      body: {
        uploadId,
        chunkCount: totalChunks,
        originalName: file.name,
        totalSize: file.size,
        mime,
      },
    });
    return res.file;
  }

  async function handlePicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) {
      return;
    }
    const maxBytes = 100 * 1024 * 1024; // 与后端 MaxUploadMb 对齐（需求基线：≤100MB）
    if (file.size > maxBytes) {
      toast(`文件超过 100MB 上限，无法发送`, 'error');
      return;
    }
    if (file.size === 0) {
      toast('不能发送空文件', 'error');
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const fileRef = await uploadFileChunked(file);
      sendMessage('file', fileRef.name, fileRef);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '文件上传失败';
      const isNetwork = err instanceof Error && 'status' in err && (err as { status?: number }).status === 0;
      toast(isNetwork ? `上传中断：${file.name} 未能传输完成，请检查网络后重试` : msg, 'error');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  return (
    <div className="shrink-0 border-t border-line bg-paper px-4 pb-3 pt-2.5">
      <div className="flex items-end gap-2">
        <div className="flex items-center gap-1 pb-1.5">
          <button
            type="button"
            title="发送文件（≤100MB，自动分片直传）"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="relative rounded-md p-2 text-sub transition-colors duration-100 hover:bg-paper-deep hover:text-main disabled:opacity-50"
          >
            <Paperclip size={17} strokeWidth={1.75} />
          </button>
          {uploading && (
            <span className="font-mono text-[11px] tabular-nums text-signal">{progress}%</span>
          )}
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
