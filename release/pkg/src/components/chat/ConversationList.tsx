import { EyeOff, RefreshCw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Conversation } from '../../api/types';
import { formatListTime } from '../../lib/format';
import { useAuth } from '../../store/auth';
import { useChat } from '../../store/chat';
import Avatar from '../Avatar';

const HIDDEN_KEY = 'intranet-im.hidden';

function loadHidden(): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.map(Number).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
}

function previewText(conv: Conversation, myId: number): string {
  const m = conv.lastMessage;
  if (!m) {
    return conv.type === 'group' ? '群聊已创建' : '暂无消息';
  }
  const who = conv.type === 'group' && m.senderId !== myId ? `${m.senderName}: ` : '';
  if (m.type === 'file') {
    return `${who}[文件] ${m.file?.name ?? ''}`;
  }
  return `${who}${m.content}`;
}

function ConversationItem({
  conv,
  myId,
  active,
  online,
  hidden,
  onHide,
  onRestore,
}: {
  conv: Conversation;
  myId: number;
  active: boolean;
  online: boolean;
  hidden: boolean;
  onHide: (id: number) => void;
  onRestore: (id: number) => void;
}) {
  const { openConversation } = useChat();
  const time = formatListTime(conv.lastMessage?.createdAt ?? conv.createdAt);
  return (
    <div className={`group relative flex w-full items-center gap-2.5 px-3 py-2.5 transition-colors duration-100 ${active ? 'bg-paper-deep' : 'hover:bg-paper-deep/60'}`}>
      {active && <span className="absolute left-0 top-0 h-full w-[2px] bg-signal" />}
      <button type="button" onClick={() => void openConversation(conv.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <Avatar
          id={conv.type === 'direct' ? conv.otherUser?.id ?? conv.id : conv.id}
          name={conv.title}
          size={38}
          online={conv.type === 'direct' ? online : null}
          avatarId={conv.type === 'direct' ? conv.otherUser?.avatarId ?? null : null}
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
      {hidden ? (
        <button
          type="button"
          title="取消隐藏"
          onClick={() => onRestore(conv.id)}
          className="shrink-0 rounded-md p-1 text-sub transition-colors duration-100 hover:bg-paper-deep hover:text-main"
        >
          <EyeOff size={15} strokeWidth={1.75} />
        </button>
      ) : (
        <button
          type="button"
          title="隐藏会话（仅本端不显示）"
          onClick={() => onHide(conv.id)}
          className="shrink-0 rounded-md p-1 text-sub opacity-0 transition-opacity duration-100 hover:bg-paper-deep hover:text-main group-hover:opacity-100"
        >
          <EyeOff size={15} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

export default function ConversationList() {
  const { user } = useAuth();
  const { conversations, activeId, onlineIds, refreshConversations } = useChat();
  const [keyword, setKeyword] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [hidden, setHidden] = useState<number[]>(() => loadHidden());

  const persist = (ids: number[]) => {
    setHidden(ids);
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids));
  };

  const handleHide = (id: number) => {
    if (!hidden.includes(id)) {
      persist([...hidden, id]);
    }
  };

  const handleRestore = (id: number) => persist(hidden.filter((x) => x !== id));

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    let list = conversations;
    if (!showHidden) {
      list = list.filter((c) => !hidden.includes(c.id));
    }
    if (kw) {
      list = list.filter((c) => c.title.toLowerCase().includes(kw));
    }
    return list;
  }, [conversations, keyword, hidden, showHidden]);

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
            placeholder="搜索会话 / 历史消息"
            className="w-full rounded-md border border-line bg-white py-1.5 pl-8 pr-2 text-[13px] outline-none transition-colors duration-100 focus:border-signal"
          />
        </div>
        <button
          type="button"
          title={showHidden ? '显示已隐藏' : '显示已隐藏会话'}
          onClick={() => setShowHidden((v) => !v)}
          className={`rounded-md border border-line bg-white p-2 text-sub transition-colors duration-100 hover:text-main ${showHidden ? 'text-signal' : ''}`}
        >
          <EyeOff size={13} strokeWidth={1.75} />
        </button>
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
        {showHidden && <div className="px-3 py-1.5 text-[11px] text-sub">已隐藏会话（仅在你的本机隐藏）</div>}
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
              hidden={showHidden}
              onHide={handleHide}
              onRestore={handleRestore}
            />
          ))
        )}
      </div>
    </div>
  );
}