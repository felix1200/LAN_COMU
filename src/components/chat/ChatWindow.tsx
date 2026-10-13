import { Loader2, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatDay, isSameDay } from '../../lib/format';
import { useAuth } from '../../store/auth';
import { useChat } from '../../store/chat';
import Composer from './Composer';
import GroupInfoPanel from './GroupInfoPanel';
import MessageItem from './MessageItem';

export default function ChatWindow() {
  const { user } = useAuth();
  const {
    activeConversation: conv,
    messages,
    hasMore,
    loadingMessages,
    loadMore,
    typingEntries,
    onlineIds,
    peerReadAt,
    activeMembers,
  } = useChat();
  const [panelOpen, setPanelOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const prevCountRef = useRef(0);

  // 滚动策略：贴底时新消息自动跟进；自己发的消息强制跟进
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const last = messages[messages.length - 1];
    const ownNew = last !== undefined && last.senderId === user?.id && messages.length !== prevCountRef.current;
    if (stickRef.current || ownNew) {
      el.scrollTop = el.scrollHeight;
    }
    prevCountRef.current = messages.length;
  }, [messages, user]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  if (!conv) {
    return null;
  }

  const subtitle =
    conv.type === 'group'
      ? `${conv.memberCount} 名成员`
      : conv.otherUser && onlineIds.has(conv.otherUser.id)
        ? '在线'
        : '离线';

  return (
    <>
      <div className="flex h-full min-w-0 flex-1 flex-col">
        {/* 头部 */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-medium text-main">{conv.title}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-sub">
              {conv.type === 'direct' && (
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    conv.otherUser && onlineIds.has(conv.otherUser.id) ? 'bg-online' : 'bg-[#9AA39D]'
                  }`}
                />
              )}
              {subtitle}
            </div>
          </div>
          {conv.type === 'group' && (
            <button
              type="button"
              title="群聊信息"
              onClick={() => setPanelOpen((v) => !v)}
              className={`rounded-md p-2 transition-colors duration-100 ${
                panelOpen ? 'bg-paper-deep text-main' : 'text-sub hover:bg-paper-deep hover:text-main'
              }`}
            >
              <Users size={17} strokeWidth={1.75} />
            </button>
          )}
        </header>

        {/* 消息区 */}
        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-6 py-4">
          {hasMore && (
            <div className="mb-3 text-center">
              <button
                type="button"
                onClick={() => void loadMore()}
                className="rounded-md border border-line bg-white px-3 py-1.5 text-[12px] text-sub transition-colors duration-100 hover:text-main"
              >
                加载更早的消息
              </button>
            </div>
          )}

          {loadingMessages && messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 size={18} className="animate-spin text-sub" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[12px] text-sub">
              暂无消息，来发第一条吧
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message, index) => {
                const prev = messages[index - 1];
                const showDivider =
                  index === 0 || !isSameDay(new Date(prev.createdAt), new Date(message.createdAt));
                // 群聊 X/Y 已读：统计除自己外已读该消息的其他成员
                let groupRead: { readCount: number; readTotal: number } | null = null;
                if (conv.type === 'group' && activeMembers.length > 0) {
                  const others = activeMembers.filter((m) => m.id !== user?.id);
                  const t = Date.parse(message.createdAt);
                  groupRead = {
                    readCount: others.filter((m) => m.lastReadAt && Date.parse(m.lastReadAt) >= t).length,
                    readTotal: others.length,
                  };
                }
                return (
                  <div key={message.clientId ?? message.id}>
                    {showDivider && (
                      <div className="mb-4 flex items-center gap-3">
                        <span className="h-px flex-1 bg-line" />
                        <span className="font-mono text-[11px] text-sub">{formatDay(message.createdAt)}</span>
                        <span className="h-px flex-1 bg-line" />
                      </div>
                    )}
                    <MessageItem
                      message={message}
                      showSender={conv.type === 'group'}
                      isDirect={conv.type === 'direct'}
                      peerReadAt={peerReadAt}
                      groupRead={groupRead}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* 正在输入 */}
          {typingEntries.length > 0 && (
            <div className="mt-3 flex items-center gap-1.5 text-[12px] text-sub">
              <span>{typingEntries.map((e) => e.displayName).join('、')} 正在输入</span>
              <span className="flex gap-0.5">
                <span className="typing-dot h-1 w-1 rounded-full bg-sub" />
                <span className="typing-dot h-1 w-1 rounded-full bg-sub" />
                <span className="typing-dot h-1 w-1 rounded-full bg-sub" />
              </span>
            </div>
          )}
        </div>

        <Composer />
      </div>

      {panelOpen && conv.type === 'group' && <GroupInfoPanel conversation={conv} onClose={() => setPanelOpen(false)} />}
    </>
  );
}
