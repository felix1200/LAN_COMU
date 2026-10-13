import { Check, Pencil, UserPlus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import type { Conversation, Member } from '../../api/types';
import { toast } from '../../lib/toast';
import { useAuth } from '../../store/auth';
import { useChat } from '../../store/chat';
import Avatar from '../Avatar';

interface GroupInfoPanelProps {
  conversation: Conversation;
  onClose: () => void;
}

export default function GroupInfoPanel({ conversation, onClose }: GroupInfoPanelProps) {
  const { user } = useAuth();
  const { contacts, onlineIds } = useChat();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(conversation.name ?? '');
  const [busy, setBusy] = useState(false);

  const isCreator = conversation.creatorId === user?.id;
  const canManage = isCreator || user?.role === 'admin';

  const load = useCallback(async () => {
    try {
      const res = await api<{ members: Member[] }>(`/api/conversations/${conversation.id}`);
      setMembers(res.members);
    } catch (err) {
      toast(err instanceof Error ? err.message : '群信息加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [conversation.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const candidates = useMemo(() => {
    const memberIds = new Set(members.map((m) => m.id));
    return contacts.filter((c) => !memberIds.has(c.id));
  }, [contacts, members]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleAddMembers() {
    if (selected.size === 0) {
      return;
    }
    setBusy(true);
    try {
      await api(`/api/conversations/${conversation.id}/members`, {
        method: 'POST',
        body: { userIds: [...selected] },
      });
      setSelected(new Set());
      setAdding(false);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : '添加成员失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(memberId: number) {
    setBusy(true);
    try {
      await api(`/api/conversations/${conversation.id}/members/${memberId}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : '移除成员失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleRename() {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === conversation.name) {
      setRenaming(false);
      return;
    }
    setBusy(true);
    try {
      await api(`/api/conversations/${conversation.id}/name`, { method: 'PUT', body: { name: trimmed } });
      setRenaming(false);
      toast('群名称已更新', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : '重命名失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave() {
    if (!user) {
      return;
    }
    setBusy(true);
    try {
      await api(`/api/conversations/${conversation.id}/members/${user.id}`, { method: 'DELETE' });
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : '退出群聊失败', 'error');
      setBusy(false);
    }
  }

  return (
    <div className="flex w-72 shrink-0 flex-col border-l border-line bg-paper">
      <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
        <span className="text-[14px] font-medium text-main">群聊信息</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm p-1 text-sub transition-colors duration-100 hover:bg-paper-deep hover:text-main"
          aria-label="关闭"
        >
          <X size={15} strokeWidth={1.75} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 群名称 */}
        <div className="border-b border-line px-4 py-3.5">
          <div className="mb-1 text-[11px] text-sub">群名称</div>
          {renaming ? (
            <div className="flex items-center gap-1.5">
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={64}
                className="w-full rounded-md border border-line bg-white px-2 py-1.5 text-[13px] outline-none focus:border-signal"
              />
              <button
                type="button"
                onClick={() => void handleRename()}
                disabled={busy}
                className="rounded-sm bg-signal p-1.5 text-white hover:bg-signal-deep"
                aria-label="确认"
              >
                <Check size={13} />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[14px] text-main">{conversation.name}</span>
              {canManage && (
                <button
                  type="button"
                  onClick={() => {
                    setNameDraft(conversation.name ?? '');
                    setRenaming(true);
                  }}
                  className="rounded-sm p-1 text-sub transition-colors duration-100 hover:bg-paper-deep hover:text-main"
                  aria-label="重命名"
                >
                  <Pencil size={13} strokeWidth={1.75} />
                </button>
              )}
            </div>
          )}
          <div className="mt-1 font-mono text-[11px] text-sub">{members.length} 名成员</div>
        </div>

        {/* 成员列表 */}
        <div className="px-2 py-2">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-[11px] text-sub">成员</span>
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              className="flex items-center gap-1 rounded-sm px-1.5 py-1 text-[11px] text-signal transition-colors duration-100 hover:bg-signal-soft"
            >
              <UserPlus size={12} strokeWidth={1.75} />
              邀请
            </button>
          </div>

          {adding && (
            <div className="mx-2 mb-2 rounded-md border border-line bg-white p-2">
              <div className="max-h-40 overflow-y-auto">
                {candidates.length === 0 ? (
                  <div className="px-2 py-3 text-center text-[11px] text-sub">通讯录成员均已在群内</div>
                ) : (
                  candidates.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-paper-deep/60">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggle(c.id)}
                        className="h-3 w-3 accent-[#256B57]"
                      />
                      <span className="truncate text-[12px] text-main">{c.displayName}</span>
                    </label>
                  ))
                )}
              </div>
              <button
                type="button"
                disabled={selected.size === 0 || busy}
                onClick={() => void handleAddMembers()}
                className="mt-2 w-full rounded-md bg-signal py-1.5 text-[12px] font-medium text-white transition-colors duration-100 hover:bg-signal-deep disabled:opacity-50"
              >
                添加（{selected.size}）
              </button>
            </div>
          )}

          {loading ? (
            <div className="px-2 py-6 text-center text-[12px] text-sub">加载中…</div>
          ) : (
            members.map((m) => (
              <div key={m.id} className="group flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-paper-deep/60">
                <Avatar id={m.id} name={m.displayName} size={30} online={onlineIds.has(m.id)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] text-main">{m.displayName}</span>
                    {m.isCreator && (
                      <span className="rounded-sm border border-amber/40 bg-amber-soft px-1 text-[10px] text-amber">群主</span>
                    )}
                  </div>
                  <div className="truncate font-mono text-[10px] text-sub">@{m.username}</div>
                </div>
                {canManage && !m.isCreator && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleRemove(m.id)}
                    title="移出群聊"
                    className="hidden rounded-sm p-1 text-sub transition-colors duration-100 hover:bg-danger-soft hover:text-danger group-hover:block"
                  >
                    <X size={13} strokeWidth={1.75} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {!isCreator && (
        <div className="border-t border-line p-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleLeave()}
            className="w-full rounded-md border border-danger/40 py-2 text-[13px] text-danger transition-colors duration-100 hover:bg-danger-soft disabled:opacity-50"
          >
            退出群聊
          </button>
        </div>
      )}
    </div>
  );
}
