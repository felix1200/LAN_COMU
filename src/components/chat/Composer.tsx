import { Loader2, Paperclip, Send } from 'lucide-react';
import {
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { api } from '../../api/client';
import type { FileRef } from '../../api/types';
import { toast } from '../../lib/toast';
import { useChat } from '../../store/chat';

export default function Composer() {
  const { sendMessage, sendTyping } = useChat();
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

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

  const CHUNK_SIZE = 256 * 1024; // 分片 256KB：更小的请求体便于穿过企业防火墙/代理对 POST body 的限制（100MB≈400 片，<后端 512 片上限）
  const MAX_ATTEMPTS = 4;
  const CHUNK_TIMEOUT_MS = 60_000; // 单片最多 60s，超时即重试
  const FINALIZE_TIMEOUT_MS = 60_000;

  function newUploadId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID().replace(/-/g, '').slice(0, 32);
    }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** 带超时的 fetch：超时主动 abort，避免长时间挂起后被浏览器判为模糊网络错误 */
  function withTimeout(ms: number): { signal: AbortSignal; done: () => void } {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), ms);
    return { signal: controller.signal, done: () => window.clearTimeout(timer) };
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
        const t = withTimeout(CHUNK_TIMEOUT_MS);
        try {
          await api('/api/files/upload/chunk', { method: 'POST', formData, signal: t.signal });
          uploaded = true;
        } catch (err) {
          lastErr = err;
          // 4xx（如鉴权失效/超限）重试无意义，立即抛出
          const status = (err as { status?: number })?.status;
          if (typeof status === 'number' && status >= 400 && status < 500 && status !== 429) {
            t.done();
            throw err;
          }
          if (attempt < MAX_ATTEMPTS - 1) {
            await sleep(600 * 2 ** attempt); // 600ms, 1.2s, 2.4s 指数退避
          }
        } finally {
          t.done();
        }
      }
      if (!uploaded) {
        const ctx = lastErr instanceof Error ? `：${lastErr.message}` : '';
        const e = new Error(`第 ${i + 1}/${totalChunks} 片上传失败${ctx}`) as Error & { status?: number };
        e.status = (lastErr as { status?: number })?.status;
        throw e;
      }
      setProgress(Math.round(((i + 1) / totalChunks) * 100));
    }

    // 合并阶段也做有限重试（服务端已做原子落盘，重复 finalize 仅在极端重试时发生）
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const t = withTimeout(FINALIZE_TIMEOUT_MS);
      try {
        const res = await api<{ file: FileRef }>('/api/files/upload/finalize', {
          method: 'POST',
          body: {
            uploadId,
            chunkCount: totalChunks,
            originalName: file.name,
            totalSize: file.size,
            mime,
          },
          signal: t.signal,
        });
        return res.file;
      } catch (err) {
        lastErr = err;
        const status = (err as { status?: number })?.status;
        if (typeof status === 'number' && status >= 400 && status < 500 && status !== 429) {
          throw err;
        }
        if (attempt < 2) {
          await sleep(600 * 2 ** attempt);
        }
      } finally {
        t.done();
      }
    }
    const ctx = lastErr instanceof Error ? `：${lastErr.message}` : '';
    const e = new Error(`文件合并失败${ctx}`) as Error & { status?: number };
    e.status = (lastErr as { status?: number })?.status;
    throw e;
  }

  /** 统一上传入口：文件选择、粘贴、拖拽复用同一套校验与上传逻辑 */
  async function uploadFile(file: File): Promise<void> {
    const maxBytes = 100 * 1024 * 1024; // 与后端 MaxUploadMb 对齐（需求基线：≤100MB）
    if (file.size > maxBytes) {
      toast(`${file.name}：文件超过 100MB 上限，无法发送`, 'error');
      return;
    }
    if (file.size === 0) {
      toast(`${file.name}：不能发送空文件`, 'error');
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const fileRef = await uploadFileChunked(file);
      sendMessage('file', fileRef.name, fileRef);
    } catch (err) {
      console.error(`[upload] ${file.name} 上传失败`, err);
      toast(err instanceof Error ? `${file.name}：${err.message}` : `${file.name}：文件上传失败`, 'error');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  /** 多文件串行上传（避免并发写进度条互相覆盖） */
  async function uploadFiles(files: File[]): Promise<void> {
    for (const file of files) {
      await uploadFile(file);
    }
  }

  function handlePicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) {
      return;
    }
    void uploadFile(file);
  }

  /** 粘贴图片：剪贴板里的 image 文件转为 File 后发送 */
  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) {
      return;
    }
    const files: File[] = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item && item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) {
          files.push(f);
        }
      }
    }
    if (files.length > 0) {
      e.preventDefault(); // 阻止图片以 base64 文本形式落入输入框
      void uploadFiles(files);
    }
  }

  function handleDragEnter(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    dragDepth.current += 1;
    setDragActive(true);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragActive(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) {
      if (files.length > 0) {
        toast('仅支持拖拽图片发送', 'error');
      }
      return;
    }
    void uploadFiles(images);
  }

  return (
    <div
      className={`relative shrink-0 border-t border-line bg-paper px-4 pb-3 pt-2.5 transition-colors duration-100 ${dragActive ? 'ring-2 ring-inset ring-signal/40' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragActive && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-paper/85 backdrop-blur-[1px]">
          <span className="font-mono text-xs tracking-widest text-signal">松开以发送图片</span>
        </div>
      )}

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
          onPaste={handlePaste}
          placeholder="输入消息，Enter 发送，Shift+Enter 换行（≤2000 字）；可粘贴或拖拽图片发送"
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