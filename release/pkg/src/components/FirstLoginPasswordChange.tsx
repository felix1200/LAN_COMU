// ABOUTME: 预置管理员首次登录强制改密页：未完成改密前不允许进入业务/管理界面
import { KeyRound, Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { toast } from '../lib/toast';
import { useAuth } from '../store/auth';

const inputCls =
  'w-full rounded-md border border-line bg-white px-3 py-2 text-[14px] outline-none transition-colors duration-100 focus:border-signal';

export default function FirstLoginPasswordChange() {
  const { user, refresh } = useAuth();
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
      toast('密码已更新，首次登录待办完成', 'success');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改失败');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-900 px-4">
      <div className="w-full max-w-[400px] rounded-md border border-ink-line bg-paper p-6 shadow-[0_2px_8px_rgba(22,27,25,.2)]">
        <div className="mb-1 flex items-center gap-2 text-ink-900">
          <KeyRound size={16} className="text-signal" strokeWidth={1.75} />
          <h1 className="text-[15px] font-semibold">首次登录需修改密码</h1>
        </div>
        <p className="mb-5 text-[12px] leading-relaxed text-sub">
          当前账号「{user?.displayName ?? ''}」为系统预置账号，出于安全考虑请在首次登录时设置新密码，完成后即可正常使用。
        </p>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3.5">
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="first-old" className="mb-1.5 block text-[13px] text-sub">
              当前密码
            </label>
            <input
              id="first-old"
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              autoComplete="current-password"
              required
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="first-new" className="mb-1.5 block text-[13px] text-sub">
              新密码
            </label>
            <input
              id="first-new"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
              className={inputCls}
            />
            <p className="mt-1 text-[12px] text-sub">至少 6 位，不强制复杂度</p>
          </div>
          <div>
            <label htmlFor="first-confirm" className="mb-1.5 block text-[13px] text-sub">
              确认新密码
            </label>
            <input
              id="first-confirm"
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
            确认修改并进入系统
          </button>
        </form>
      </div>
    </div>
  );
}