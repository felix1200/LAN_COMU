import { AlertCircle, Download, FileText, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { downloadFile, fetchFileBlob } from '../../api/client';
import type { FileRef } from '../../api/types';
import { formatBytes, formatTime } from '../../lib/format';
import { toast } from '../../lib/toast';
import { useAuth } from '../../store/auth';
import type { UiMessage } from '../../store/chat';
import Avatar from '../Avatar';

/** 依据 MIME 或扩展名判定是否为可预览的图片 */
function isImageFile(file: FileRef): boolean {
  if (file.mime && file.mime.startsWith('image/')) {
    return true;
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'].includes(ext);
}

/** 大图预览浮层：支持点击遮罩 / Esc 关闭，可下载原图 */
function ImagePreview({ url, name, fileId, onClose }: { url: string; name: string; fileId: number; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="relative flex max-h-full max-w-full flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <img src={url} alt={name} className="max-h-[82vh] max-w-[92vw] rounded-md object-contain" />
        <div className="flex items-center gap-2 font-mono text-[12px] text-white/80">
          <span className="max-w-[60vw] truncate">{name}</span>
          <button
            type="button"
            onClick={() => void downloadFile(fileId, name)}
            className="flex items-center gap-1 rounded-sm bg-white/10 px-2.5 py-1.5 transition-colors duration-100 hover:bg-white/20"
          >
            <Download size={14} strokeWidth={1.75} />
            下载
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 rounded-sm bg-white/10 px-2.5 py-1.5 transition-colors duration-100 hover:bg-white/20"
          >
            <X size={14} strokeWidth={1.75} />
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

/** 图片消息：拉取鉴权图片流生成缩略图，点击放大预览 */
function ImageMessage({ file, own }: { file: FileRef; own: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setFailed(false);
    setUrl(null);
    fetchFileBlob(file.id, true)
      .then((blob) => {
        if (cancelled) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [file.id]);

  // 拉取失败或渲染失败时，回退为普通文件卡片（可下载）
  if (failed) {
    return <FileMessage file={file} own={own} />;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="查看图片"
        className={`block overflow-hidden rounded-md border ${own ? 'border-white/20' : 'border-line'}`}
      >
        {loading ? (
          <div className={`flex h-40 w-56 items-center justify-center ${own ? 'bg-signal text-white/60' : 'bg-paper-deep text-sub'}`}>
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : (
          <img
            src={url ?? ''}
            alt={file.name}
            className="h-auto max-h-56 w-auto max-w-[260px] object-contain"
            onError={() => setFailed(true)}
          />
        )}
        <div
          className={`flex items-center justify-between gap-2 px-2 py-1 font-mono text-[10px] ${
            own ? 'bg-signal text-white/70' : 'bg-paper text-sub'
          }`}
        >
          <span className="min-w-0 truncate">{file.name}</span>
          <span className="shrink-0">{formatBytes(file.size)}</span>
        </div>
      </button>
      {open && url && <ImagePreview url={url} name={file.name} fileId={file.id} onClose={() => setOpen(false)} />}
    </>
  );
}

function FileMessage({ file, own }: { file: FileRef; own: boolean }) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadFile(file.id, file.name);
    } catch {
      toast('文件下载失败', 'error');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      className={`flex w-[240px] items-center gap-3 rounded-md border px-3 py-2.5 ${
        own ? 'border-white/20 bg-signal text-white' : 'border-line bg-white text-main'
      }`}
    >
      <FileText size={26} strokeWidth={1.5} className={own ? 'shrink-0 text-white/85' : 'shrink-0 text-signal'} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium" title={file.name}>
          {file.name}
        </div>
        <div className={`font-mono text-[10px] ${own ? 'text-white/70' : 'text-sub'}`}>{formatBytes(file.size)}</div>
      </div>
      <button
        type="button"
        onClick={() => void handleDownload()}
        disabled={downloading}
        title="下载文件"
        className={`shrink-0 rounded-sm p-1 transition-colors duration-100 ${
          own ? 'hover:bg-white/15' : 'hover:bg-paper-deep'
        }`}
      >
        {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} strokeWidth={1.75} />}
      </button>
    </div>
  );
}

interface MessageItemProps {
  message: UiMessage;
  showSender: boolean;
  isDirect: boolean;
  /** 私聊：对方已读时间 */
  peerReadAt: string | null;
  /** 群聊：除自己外已读人数 / 总人数（不展示名单） */
  groupRead: { readCount: number; readTotal: number } | null;
}

export default function MessageItem({ message, showSender, isDirect, peerReadAt, groupRead }: MessageItemProps) {
  const { user } = useAuth();
  const own = message.senderId === user?.id;
  const directRead = own && isDirect && peerReadAt !== null && Date.parse(message.createdAt) <= Date.parse(peerReadAt);
  const groupReadText = own && groupRead && groupRead.readTotal > 0
    ? `${groupRead.readCount}/${groupRead.readTotal} 已读`
    : null;

  const meta = (
    <div className={`mt-1 flex items-center gap-1.5 font-mono text-[10px] text-sub ${own ? 'justify-end' : ''}`}>
      {showSender && !own && <span className="font-sans text-[11px] text-sub">{message.senderName}</span>}
      <span>{formatTime(message.createdAt)}</span>
      {message.pending && <span className="text-sub/70">发送中</span>}
      {message.failed && (
        <span className="flex items-center gap-0.5 text-danger">
          <AlertCircle size={10} />
          发送失败
        </span>
      )}
      {directRead && <span className="text-signal">已读</span>}
      {groupReadText && <span className="text-signal/85">{groupReadText}</span>}
    </div>
  );

  const body =
    message.type === 'file' && message.file ? (
      isImageFile(message.file) ? (
        <ImageMessage file={message.file} own={own} />
      ) : (
        <FileMessage file={message.file} own={own} />
      )
    ) : (
      <div
        className={`whitespace-pre-wrap break-words rounded-md px-3 py-2 text-[14px] leading-[1.65] ${
          own ? 'bg-signal text-white' : 'border border-line bg-white text-main'
        } ${message.failed ? 'opacity-60' : ''}`}
      >
        {message.content}
      </div>
    );

  return (
    <div className={`message-in flex gap-2.5 ${own ? 'flex-row-reverse' : ''}`}>
      <Avatar id={message.senderId} name={message.senderName} size={32} />
      <div className={`max-w-[62%] ${own ? 'flex flex-col items-end' : ''}`}>{body}{meta}</div>
    </div>
  );
}