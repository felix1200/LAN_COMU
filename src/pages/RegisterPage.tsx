import { CheckCircle2, Loader2, RadioTower } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { useAuth } from '../store/auth';

export default function RegisterPage() {
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const message = await register(username.trim(), displayName.trim(), password);
      setDone(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <AuthLayout>
        <div className="rounded-md border border-signal/30 bg-signal-soft px-6 py-8 text-center">
          <CheckCircle2 size={36} strokeWidth={1.5} className="mx-auto text-signal" />
          <h2 className="mt-4 text-[17px] font-medium text-main">注册申请已提交</h2>
          <p className="mt-2 text-[13px] leading-6 text-sub">{done}</p>
          <Link
            to="/login"
            className="mt-6 inline-block rounded-md bg-signal px-6 py-2.5 text-[14px] font-medium text-white transition-colors duration-100 hover:bg-signal-deep"
          >
            返回登录
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="mb-8 flex items-center gap-3 lg:hidden">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-signal">
          <RadioTower size={18} strokeWidth={1.75} className="text-white" />
        </div>
        <div className="text-[15px] font-semibold">内信 IntraChat</div>
      </div>

      <h2 className="text-[20px] font-medium">申请注册</h2>
      <p className="mt-1 text-[13px] text-sub">提交后由管理员审核，审核通过即可登录</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        {error && (
          <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="reg-username" className="mb-1.5 block text-[13px] text-sub">
            用户名
          </label>
          <input
            id="reg-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            className="w-full rounded-md border border-line bg-white px-3 py-2.5 text-[14px] outline-none transition-colors duration-100 focus:border-signal"
          />
          <p className="mt-1 text-[12px] text-sub">3-20 位字母、数字或下划线，用于登录</p>
        </div>

        <div>
          <label htmlFor="reg-display" className="mb-1.5 block text-[13px] text-sub">
            姓名
          </label>
          <input
            id="reg-display"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            className="w-full rounded-md border border-line bg-white px-3 py-2.5 text-[14px] outline-none transition-colors duration-100 focus:border-signal"
          />
          <p className="mt-1 text-[12px] text-sub">真实姓名，将展示给同事</p>
        </div>

        <div>
          <label htmlFor="reg-password" className="mb-1.5 block text-[13px] text-sub">
            密码
          </label>
          <input
            id="reg-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            className="w-full rounded-md border border-line bg-white px-3 py-2.5 text-[14px] outline-none transition-colors duration-100 focus:border-signal"
          />
          <p className="mt-1 text-[12px] text-sub">至少 6 位</p>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-signal px-3 py-2.5 text-[14px] font-medium text-white transition-colors duration-100 hover:bg-signal-deep disabled:opacity-60"
        >
          {submitting && <Loader2 size={15} className="animate-spin" />}
          提交注册申请
        </button>
      </form>

      <div className="mt-6 border-t border-line pt-4 text-[13px] text-sub">
        已有账号？
        <Link to="/login" className="ml-1 text-signal hover:underline">
          直接登录
        </Link>
      </div>
    </AuthLayout>
  );
}
