import { AlertCircle, Download, FileText, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { downloadFile } from '../../api/client';
import type { FileRef } from '../../api/types';
import { formatBytes, formatTime } from '../../lib/format';
import { toast } from '../../lib/toast';
import { useAuth } from '../../store/auth';
import type { UiMessage } from '../../store/chat';
import Avatar from '../Avatar';

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
      <FileMessage file={message.file} own={own} />
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