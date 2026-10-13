import { Loader2, MessageSquare, Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { MessageSearchHit, MessageSearchResult } from '../../api/types';
import { formatTime } from '../../lib/format';
import { toast } from '../../lib/toast';
import { useChat } from '../../store/chat';
import Modal from '../Modal';

export default function SearchModal({ onClose }: { onClose: () => void }) {
  const { openConversation, refreshConversations } = useChat();
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<MessageSearchHit[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const kw = keyword.trim();
    if (!kw) {
      return;
    }
    setLoading(true);
    try {
      const res = await api<MessageSearchResult>(`/api/conversations/search?q=${encodeURIComponent(kw)}&limit=30`);
      setResults(res.results);
      setHasMore(res.hasMore);
      setSearched(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : '搜索失败', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadMore() {
    const kw = keyword.trim();
    if (!kw || results.length === 0) {
      return;
    }
    setLoading(true);
    try {
      const before = results[results.length - 1].message.id;
      const res = await api<MessageSearchResult>(
        `/api/conversations/search?q=${encodeURIComponent(kw)}&limit=30&before=${before}`,
      );
      setResults((prev) => [...prev, ...res.results]);
      setHasMore(res.hasMore);
    } catch (err) {
      toast(err instanceof Error ? err.message : '加载更多失败', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleOpen(hit: MessageSearchHit) {
    await openConversation(hit.conversationId);
    void refreshConversations();
    onClose();
  }

  return (
    <Modal title="搜索历史消息" onClose={onClose}>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        <div className="relative">
          <Search size={14} strokeWidth={1.75} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sub" />
          <input
            autoFocus
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="输入关键词，检索全部会话的文字消息"
            className="w-full rounded-md border border-line bg-white py-2 pl-8 pr-2 text-[13px] outline-none transition-colors duration-100 focus:border-signal"
          />
        </div>
        <button
          type="submit"
          disabled={!keyword.trim() || loading}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-signal px-3 py-2 text-[13px] font-medium text-white transition-colors duration-100 hover:bg-signal-deep disabled:opacity-50"
        >
          {loading && <Loader2 size={14} className="animate-spin" />}
          搜索
        </button>
      </form>

      <div className="mt-4 max-h-80 space-y-1 overflow-y-auto">
        {searched && !loading && results.length === 0 && (
          <div className="py-8 text-center text-[12px] text-sub">未找到匹配的历史消息</div>
        )}
        {results.map((hit) => (
          <button
            key={hit.message.id}
            type="button"
            onClick={() => void handleOpen(hit)}
            className="flex w-full items-start gap-2.5 rounded-md border border-line bg-white px-3 py-2.5 text-left transition-colors duration-100 hover:border-signal/50 hover:bg-paper-deep/50"
          >
            <MessageSquare size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-sub" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[12px] font-medium text-main">{hit.conversationTitle}</span>
                <span className="shrink-0 font-mono text-[10px] text-sub">{formatTime(hit.message.createdAt)}</span>
              </div>
              <div className="mt-0.5 truncate text-[12px] text-sub">{hit.message.content}</div>
            </div>
          </button>
        ))}
        {hasMore && (
          <button
            type="button"
            onClick={() => void handleLoadMore()}
            disabled={loading}
            className="w-full py-2 text-center text-[12px] text-signal hover:underline"
          >
            加载更多
          </button>
        )}
      </div>
    </Modal>
  );
}