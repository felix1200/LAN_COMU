import { Search, SquarePlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '../../store/auth';
import { useChat } from '../../store/chat';
import Avatar from '../Avatar';
import CreateGroupModal from './CreateGroupModal';

export default function ContactsPanel({ onStarted }: { onStarted: () => void }) {
  const { user } = useAuth();
  const { contacts, onlineIds, startDirect } = useChat();
  const [keyword, setKeyword] = useState('');
  const [starting, setStarting] = useState<number | null>(null);
  const [groupModalOpen, setGroupModalOpen] = useState(false);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) {
      return contacts;
    }
    return contacts.filter(
      (c) => c.displayName.toLowerCase().includes(kw) || c.username.toLowerCase().includes(kw),
    );
  }, [contacts, keyword]);

  async function handleStart(userId: number) {
    setStarting(userId);
    try {
      await startDirect(userId);
      onStarted();
    } finally {
      setStarting(null);
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
            placeholder="搜索同事"
            className="w-full rounded-md border border-line bg-white py-1.5 pl-8 pr-2 text-[13px] outline-none transition-colors duration-100 focus:border-signal"
          />
        </div>
        <button
          type="button"
          title="发起群聊"
          onClick={() => setGroupModalOpen(true)}
          className="flex items-center gap-1 rounded-md bg-signal px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors duration-100 hover:bg-signal-deep"
        >
          <SquarePlus size={14} strokeWidth={1.75} />
          群聊
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-[12px] text-sub">
            {contacts.length === 0 ? '暂无其他同事' : '没有匹配的同事'}
          </div>
        ) : (
          filtered.map((contact) => {
            const isMe = contact.id === user?.id;
            return (
              <button
                key={contact.id}
                type="button"
                disabled={isMe || starting === contact.id}
                onClick={() => void handleStart(contact.id)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors duration-100 hover:bg-paper-deep/60 disabled:cursor-default disabled:opacity-70"
              >
                <Avatar id={contact.id} name={contact.displayName} size={38} online={onlineIds.has(contact.id)} avatarId={contact.avatarId ?? null} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-medium text-main">{contact.displayName}</span>
                    {contact.role === 'admin' && (
                      <span className="rounded-sm border border-amber/40 bg-amber-soft px-1 text-[10px] text-amber">
                        管理员
                      </span>
                    )}
                    {isMe && <span className="text-[11px] text-sub">（我）</span>}
                  </div>
                  <div className="truncate font-mono text-[11px] text-sub">@{contact.username}</div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {groupModalOpen && <CreateGroupModal onClose={() => setGroupModalOpen(false)} onCreated={onStarted} />}
    </div>
  );
}
