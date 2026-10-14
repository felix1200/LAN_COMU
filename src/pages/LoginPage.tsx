import { Loader2, RadioTower } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { useAuth } from '../store/auth';
import { APP_VERSION } from '../version';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/chat';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      {/* 移动端品牌 */}
      <div className="mb-8 flex items-center gap-3 lg:hidden">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-signal">
          <RadioTower size={18} strokeWidth={1.75} className="text-white" />
        </div>
        <div className="text-[15px] font-semibold">内信 IntraChat</div>
      </div>

      <h2 className="text-[20px] font-medium">登录</h2>
      <p className="mt-1 text-[13px] text-sub">使用企业账号登录内网通讯系统</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        {error && (
          <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="username" className="mb-1.5 block text-[13px] text-sub">
            用户名
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            className="w-full rounded-md border border-line bg-white px-3 py-2.5 text-[14px] outline-none transition-colors duration-100 focus:border-signal"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-[13px] text-sub">
            密码
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="w-full rounded-md border border-line bg-white px-3 py-2.5 text-[14px] outline-none transition-colors duration-100 focus:border-signal"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-signal px-3 py-2.5 text-[14px] font-medium text-white transition-colors duration-100 hover:bg-signal-deep disabled:opacity-60"
        >
          {submitting && <Loader2 size={15} className="animate-spin" />}
          登 录
        </button>
      </form>

      <div className="mt-6 border-t border-line pt-4 text-[13px] text-sub">
        还没有账号？
        <Link to="/register" className="ml-1 text-signal hover:underline">
          申请注册
        </Link>
      </div>
      <p className="mt-2 text-[12px] leading-5 text-sub">新账号需经管理员审核通过后方可登录。</p>
      <p className="mt-6 text-right font-mono text-[11px] tabular-nums text-sub/70">{APP_VERSION}</p>
    </AuthLayout>
  );
}
