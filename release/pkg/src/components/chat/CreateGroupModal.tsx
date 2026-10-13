import { Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from '../../lib/toast';
import { useAuth } from '../../store/auth';
import { useChat } from '../../store/chat';
import Avatar from '../Avatar';
import Modal from '../Modal';

interface CreateGroupModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateGroupModal({ onClose, onCreated }: CreateGroupModalProps) {
  const { user } = useAuth();
  const { contacts, createGroup } = useChat();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const candidates = useMemo(() => contacts.filter((c) => c.id !== user?.id), [contacts, user]);

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

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast('请填写群名称', 'error');
      return;
    }
    if (selected.size === 0) {
      toast('请至少选择一位成员', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await createGroup(trimmed, [...selected]);
      onCreated();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : '创建群聊失败', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="发起群聊" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label htmlFor="group-name" className="mb-1.5 block text-[13px] text-sub">
            群名称
          </label>
          <input
            id="group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
            placeholder="例如：项目一组"
            className="w-full rounded-md border border-line bg-white px-3 py-2 text-[14px] outline-none transition-colors duration-100 focus:border-signal"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[13px] text-sub">选择成员</span>
            <span className="font-mono text-[11px] text-sub">已选 {selected.size} 人</span>
          </div>
          <div className="max-h-64 overflow-y-auto rounded-md border border-line bg-white">
            {candidates.length === 0 ? (
              <div className="px-3 py-6 text-center text-[12px] text-sub">暂无其他同事可选</div>
            ) : (
              candidates.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-2.5 border-b border-line/60 px-3 py-2 last:border-b-0 hover:bg-paper-deep/50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="h-3.5 w-3.5 accent-[#256B57]"
                  />
                  <Avatar id={c.id} name={c.displayName} size={28} />
                  <span className="truncate text-[13px] text-main">{c.displayName}</span>
                  <span className="ml-auto truncate font-mono text-[11px] text-sub">@{c.username}</span>
                </label>
              ))
            )}
          </div>
        </div>

        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleCreate()}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-signal px-3 py-2.5 text-[14px] font-medium text-white transition-colors duration-100 hover:bg-signal-deep disabled:opacity-60"
        >
          {submitting && <Loader2 size={15} className="animate-spin" />}
          创建群聊
        </button>
      </div>
    </Modal>
  );
}
