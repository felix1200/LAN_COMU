import { RefreshCw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Conversation } from '../../api/types';
import { formatListTime } from '../../lib/format';
import { useAuth } from '../../store/auth';
import { useChat } from '../../store/chat';
import Avatar from '../Avatar';

function previewText(conv: Conversation, myId: number): string {
  const m = conv.lastMessage;
  if (!m) {
    return conv.type === 'group' ? '群聊已创建' : '暂无消息';
  }
  const who = conv.type === 'group' && m.senderId !== myId ? `${m.senderName}: ` : '';
  if (m.type === 'image') {
    return `${who}[图片]`;
  }
  if (m.type === 'file') {
    return `${who}[文件] ${m.file?.name ?? ''}`;
  }
  return `${who}${m.content}`;
}

function ConversationItem({ conv, myId, active, online }: { conv: Conversation; myId: number; active: boolean; online: boolean }) {
  const { openConversation } = useChat();
  const time = formatListTime(conv.lastMessage?.createdAt ?? conv.createdAt);
  return (
    <button
      type="button"
      onClick={() => void openConversation(conv.id)}
      className={`relative flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors duration-100 ${
        active ? 'bg-paper-deep' : 'hover:bg-paper-deep/60'
      }`}
    >
      {active && <span className="absolute left-0 top-0 h-full w-[2px] bg-signal" />}
      <Avatar
        id={conv.type === 'direct' ? conv.otherUser?.id ?? conv.id : conv.id}
        name={conv.title}
        size={38}
        online={conv.type === 'direct' ? online : null}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[14px] font-medium text-main">{conv.title}</span>
          <span className="shrink-0 font-mono text-[10px] text-sub">{time}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="truncate text-[12px] text-sub">
            {conv.type === 'group' && <span className="mr-1 text-[11px] text-sub/70">[{conv.memberCount}人]</span>}
            {previewText(conv, myId)}
          </span>
          {conv.unreadCount > 0 && (
            <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-sm bg-amber px-1 font-mono text-[10px] font-medium text-ink-900">
              {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export default function ConversationList() {
  const { user } = useAuth();
  const { conversations, activeId, onlineIds, refreshConversations } = useChat();
  const [keyword, setKeyword] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) {
      return conversations;
    }
    return conversations.filter((c) => c.title.toLowerCase().includes(kw));
  }, [conversations, keyword]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refreshConversations();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-3">
        <div className="relative flex-1">
          <Search size={14} strokeWidth={1.75} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sub" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索会话"
            className="w-full rounded-md border border-line bg-white py-1.5 pl-8 pr-2 text-[13px] outline-none transition-colors duration-100 focus:border-signal"
          />
        </div>
        <button
          type="button"
          title="刷新会话列表"
          onClick={() => void handleRefresh()}
          className="rounded-md border border-line bg-white p-2 text-sub transition-colors duration-100 hover:text-main"
        >
          <RefreshCw size={13} strokeWidth={1.75} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-[12px] leading-6 text-sub">
            {conversations.length === 0 ? (
              <>
                还没有会话
                <br />
                去通讯录找同事聊聊吧
              </>
            ) : (
              '没有匹配的会话'
            )}
          </div>
        ) : (
          filtered.map((conv) => (
            <ConversationItem
              key={conv.id}
              conv={conv}
              myId={user?.id ?? 0}
              active={conv.id === activeId}
              online={conv.otherUser ? onlineIds.has(conv.otherUser.id) : false}
            />
          ))
        )}
      </div>
    </div>
  );
}
