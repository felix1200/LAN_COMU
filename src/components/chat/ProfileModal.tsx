import { Loader2, Trash2 } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { api } from '../../api/client';
import { toast } from '../../lib/toast';
import { useAuth } from '../../store/auth';
import Avatar from '../Avatar';
import Modal from '../Modal';

const AVATAR_MAX = 2 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

export default function ProfileModal({ onClose }: { onClose: () => void }) {
  const { user, refresh } = useAuth();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!user) {
    return null;
  }

  async function handlePick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) {
      return;
    }
    if (!ALLOWED.includes(file.type)) {
      toast('仅支持 jpg / png / webp 格式', 'error');
      return;
    }
    if (file.size > AVATAR_MAX) {
      toast('头像文件需 ≤ 2MB', 'error');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api<{ avatarId: number }>('/api/users/me/avatar', { method: 'POST', formData });
      await refresh();
      toast('头像已更新', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : '头像上传失败', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setUploading(true);
    try {
      await api('/api/users/me/avatar', { method: 'DELETE' });
      await refresh();
      toast('头像已移除', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : '移除失败', 'error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal title="我的资料" onClose={onClose}>
      <div className="flex items-center gap-4">
        <Avatar id={user.id} name={user.displayName} size={64} avatarId={user.avatarId ?? null} />
        <div className="min-w-0">
          <div className="text-[15px] font-medium text-main">{user.displayName}</div>
          <div className="mt-0.5 font-mono text-[12px] text-sub">@{user.username}</div>
          <div className="mt-1 text-[12px] text-sub">{user.role === 'admin' ? '管理员' : '普通成员'}</div>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <div>
          <div className="mb-1.5 text-[13px] text-sub">电脑头像</div>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => void handlePick(e)}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-md bg-signal px-3 py-2 text-[13px] font-medium text-white transition-colors duration-100 hover:bg-signal-deep disabled:opacity-50"
            >
              {uploading && <Loader2 size={14} className="animate-spin" />}
              上传头像
            </button>
            {user.avatarId != null && (
              <button
                type="button"
                disabled={uploading}
                onClick={() => void handleRemove()}
                className="flex items-center gap-1.5 rounded-md border border-line bg-white px-3 py-2 text-[13px] text-sub transition-colors duration-100 hover:text-danger disabled:opacity-50"
              >
                <Trash2 size={14} strokeWidth={1.75} />
                移除
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-sub">支持 jpg / png / webp，≤ 2MB，用于电脑端展示</p>
        </div>
      </div>
    </Modal>
  );
}