import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import { toast } from '../../lib/toast';
import Modal from '../Modal';

export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError('两次输入的新密码不一致');
      return;
    }
    setSubmitting(true);
    try {
      await api('/api/auth/password', { method: 'PUT', body: { oldPassword, newPassword } });
      toast('密码已更新', 'success');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改失败');
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    'w-full rounded-md border border-line bg-white px-3 py-2 text-[14px] outline-none transition-colors duration-100 focus:border-signal';

  return (
    <Modal title="修改密码" onClose={onClose} width={380}>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3.5">
        {error && (
          <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</div>
        )}
        <div>
          <label htmlFor="old-pwd" className="mb-1.5 block text-[13px] text-sub">
            原密码
          </label>
          <input
            id="old-pwd"
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            autoComplete="current-password"
            required
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="new-pwd" className="mb-1.5 block text-[13px] text-sub">
            新密码
          </label>
          <input
            id="new-pwd"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            required
            className={inputCls}
          />
          <p className="mt-1 text-[12px] text-sub">至少 6 位</p>
        </div>
        <div>
          <label htmlFor="confirm-pwd" className="mb-1.5 block text-[13px] text-sub">
            确认新密码
          </label>
          <input
            id="confirm-pwd"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            className={inputCls}
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-signal px-3 py-2.5 text-[14px] font-medium text-white transition-colors duration-100 hover:bg-signal-deep disabled:opacity-60"
        >
          {submitting && <Loader2 size={15} className="animate-spin" />}
          确认修改
        </button>
      </form>
    </Modal>
  );
}
