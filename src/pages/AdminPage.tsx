import {
  ArrowLeft,
  BarChart3,
  Check,
  Inbox,
  KeyRound,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { AdminGroup, AdminStats, AdminUser, UserStatus } from '../api/types';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';
import { formatBytes, formatFullTime } from '../lib/format';
import { toast } from '../lib/toast';
import { useAuth } from '../store/auth';

type AdminTab = 'review' | 'users' | 'groups' | 'stats';

const STATUS_META: Record<UserStatus, { label: string; cls: string }> = {
  pending: { label: '待审核', cls: 'border-amber/40 bg-amber-soft text-amber' },
  approved: { label: '正常', cls: 'border-signal/30 bg-signal-soft text-signal' },
  rejected: { label: '已驳回', cls: 'border-danger/30 bg-danger-soft text-danger' },
  disabled: { label: '已禁用', cls: 'border-line bg-paper-deep text-sub' },
};

function StatusBadge({ status }: { status: UserStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-block rounded-sm border px-1.5 py-0.5 text-[11px] ${meta.cls}`}>{meta.label}</span>
  );
}

function ConfirmDialog({
  title,
  description,
  confirmText,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmText: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose} width={400}>
      <p className="text-[13px] leading-6 text-sub">{description}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-line px-3.5 py-2 text-[13px] text-sub transition-colors duration-100 hover:text-main"
        >
          取消
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            onConfirm()
              .then(onClose)
              .catch((err: unknown) => toast(err instanceof Error ? err.message : '操作失败', 'error'))
              .finally(() => setBusy(false));
          }}
          className="flex items-center gap-1.5 rounded-md bg-danger px-3.5 py-2 text-[13px] font-medium text-white transition-colors duration-100 hover:opacity-90 disabled:opacity-60"
        >
          {busy && <Loader2 size={13} className="animate-spin" />}
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}

function ActionButton({
  title,
  onClick,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded-sm p-1.5 transition-colors duration-100 ${
        danger ? 'text-sub hover:bg-danger-soft hover:text-danger' : 'text-sub hover:bg-paper-deep hover:text-main'
      }`}
    >
      {children}
    </button>
  );
}

const TH = 'px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-sub';
const TD = 'px-3 py-2.5 text-[13px] text-main';

/** 审核面板 */
function ReviewPanel({ onChanged }: { onChanged: () => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectTarget, setRejectTarget] = useState<AdminUser | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ users: AdminUser[] }>('/api/admin/users?status=pending');
      setUsers(res.users);
    } catch (err) {
      toast(err instanceof Error ? err.message : '加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(target: AdminUser) {
    setBusyId(target.id);
    try {
      await api(`/api/admin/users/${target.id}/approve`, { method: 'POST' });
      setUsers((prev) => prev.filter((u) => u.id !== target.id));
      toast(`已通过「${target.displayName}」的注册申请`, 'success');
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : '操作失败', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function reject() {
    if (!rejectTarget) {
      return;
    }
    setBusyId(rejectTarget.id);
    try {
      await api(`/api/admin/users/${rejectTarget.id}/reject`, {
        method: 'POST',
        body: { reason: rejectReason.trim() || undefined },
      });
      setUsers((prev) => prev.filter((u) => u.id !== rejectTarget.id));
      setRejectTarget(null);
      setRejectReason('');
      toast('已驳回该注册申请', 'success');
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : '操作失败', 'error');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 size={18} className="animate-spin text-sub" /></div>;
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-sub">
        <Inbox size={22} strokeWidth={1.5} />
        <p className="text-[13px]">没有待审核的注册申请</p>
      </div>
    );
  }

  return (
    <>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-line">
            <th className={TH}>用户</th>
            <th className={TH}>用户名</th>
            <th className={TH}>申请时间</th>
            <th className={`${TH} text-right`}>操作</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-line/60 transition-colors duration-100 hover:bg-paper-deep/40">
              <td className={TD}>
                <div className="flex items-center gap-2.5">
                  <Avatar id={u.id} name={u.displayName} size={28} />
                  <span className="font-medium">{u.displayName}</span>
                </div>
              </td>
              <td className={`${TD} font-mono text-[12px] text-sub`}>@{u.username}</td>
              <td className={`${TD} font-mono text-[12px] text-sub`}>{formatFullTime(u.createdAt)}</td>
              <td className={`${TD} text-right`}>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={busyId === u.id}
                    onClick={() => void approve(u)}
                    className="flex items-center gap-1 rounded-md bg-signal px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors duration-100 hover:bg-signal-deep disabled:opacity-50"
                  >
                    {busyId === u.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    通过
                  </button>
                  <button
                    type="button"
                    disabled={busyId === u.id}
                    onClick={() => setRejectTarget(u)}
                    className="flex items-center gap-1 rounded-md border border-danger/40 px-2.5 py-1.5 text-[12px] text-danger transition-colors duration-100 hover:bg-danger-soft disabled:opacity-50"
                  >
                    <X size={12} />
                    驳回
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rejectTarget && (
        <Modal title={`驳回「${rejectTarget.displayName}」的申请`} onClose={() => setRejectTarget(null)} width={400}>
          <label htmlFor="reject-reason" className="mb-1.5 block text-[13px] text-sub">
            驳回原因（可选，用户登录时可见）
          </label>
          <textarea
            id="reject-reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            maxLength={200}
            placeholder="例如：请使用真实姓名注册"
            className="w-full resize-none rounded-md border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-signal"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRejectTarget(null)}
              className="rounded-md border border-line px-3.5 py-2 text-[13px] text-sub hover:text-main"
            >
              取消
            </button>
            <button
              type="button"
              disabled={busyId === rejectTarget.id}
              onClick={() => void reject()}
              className="flex items-center gap-1.5 rounded-md bg-danger px-3.5 py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {busyId === rejectTarget.id && <Loader2 size={13} className="animate-spin" />}
              确认驳回
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

/** 用户管理面板 */
function UsersPanel({ onChanged }: { onChanged: () => void }) {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [keyword, setKeyword] = useState('');
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (status) {
        params.set('status', status);
      }
      if (keyword.trim()) {
        params.set('keyword', keyword.trim());
      }
      const res = await api<{ users: AdminUser[] }>(`/api/admin/users?${params.toString()}`);
      setUsers(res.users);
    } catch (err) {
      toast(err instanceof Error ? err.message : '加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [status, keyword]);

  useEffect(() => {
    void load();
  }, [load]);

  async function call(action: string, target: AdminUser, successText: string) {
    try {
      await api(`/api/admin/users/${target.id}/${action}`, { method: 'POST' });
      toast(successText, 'success');
      await load();
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : '操作失败', 'error');
    }
  }

  async function resetPassword() {
    if (!resetTarget) {
      return;
    }
    try {
      await api(`/api/admin/users/${resetTarget.id}/reset-password`, {
        method: 'POST',
        body: { password: newPassword },
      });
      toast(`已重置「${resetTarget.displayName}」的密码`, 'success');
      setResetTarget(null);
      setNewPassword('');
    } catch (err) {
      toast(err instanceof Error ? err.message : '重置失败', 'error');
    }
  }

  return (
    <div>
      {/* 筛选栏 */}
      <div className="mb-4 flex items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-line bg-white px-2.5 py-2 text-[13px] outline-none focus:border-signal"
        >
          <option value="">全部状态</option>
          <option value="pending">待审核</option>
          <option value="approved">正常</option>
          <option value="rejected">已驳回</option>
          <option value="disabled">已禁用</option>
        </select>
        <div className="relative flex-1">
          <Search size={14} strokeWidth={1.75} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sub" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索用户名或姓名"
            className="w-full rounded-md border border-line bg-white py-2 pl-8 pr-2 text-[13px] outline-none focus:border-signal"
          />
        </div>
        <button
          type="button"
          title="刷新"
          onClick={() => void load()}
          className="rounded-md border border-line bg-white p-2 text-sub hover:text-main"
        >
          <RefreshCw size={14} strokeWidth={1.75} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={18} className="animate-spin text-sub" /></div>
      ) : users.length === 0 ? (
        <div className="py-16 text-center text-[13px] text-sub">没有匹配的用户</div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line">
              <th className={TH}>用户</th>
              <th className={TH}>角色</th>
              <th className={TH}>状态</th>
              <th className={TH}>注册时间</th>
              <th className={TH}>审核信息</th>
              <th className={`${TH} text-right`}>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line/60 transition-colors duration-100 hover:bg-paper-deep/40">
                <td className={TD}>
                  <div className="flex items-center gap-2.5">
                    <Avatar id={u.id} name={u.displayName} size={28} />
                    <div>
                      <div className="font-medium leading-4">{u.displayName}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-sub">@{u.username}</div>
                    </div>
                  </div>
                </td>
                <td className={TD}>
                  {u.role === 'admin' ? (
                    <span className="rounded-sm border border-amber/40 bg-amber-soft px-1.5 py-0.5 text-[11px] text-amber">管理员</span>
                  ) : (
                    <span className="text-[12px] text-sub">成员</span>
                  )}
                </td>
                <td className={TD}>
                  <StatusBadge status={u.status} />
                  {u.status === 'rejected' && u.rejectReason && (
                    <div className="mt-1 max-w-[180px] truncate text-[11px] text-sub" title={u.rejectReason}>
                      {u.rejectReason}
                    </div>
                  )}
                </td>
                <td className={`${TD} font-mono text-[11px] text-sub`}>{formatFullTime(u.createdAt)}</td>
                <td className={`${TD} text-[11px] text-sub`}>
                  {u.reviewedAt ? (
                    <>
                      <div>{u.reviewerName ?? '-'}</div>
                      <div className="font-mono">{formatFullTime(u.reviewedAt)}</div>
                    </>
                  ) : (
                    '-'
                  )}
                </td>
                <td className={`${TD} text-right`}>
                  <div className="flex justify-end gap-0.5">
                    {u.status === 'pending' && (
                      <ActionButton title="通过申请" onClick={() => void call('approve', u, '已通过申请')}>
                        <Check size={14} />
                      </ActionButton>
                    )}
                    {u.status === 'approved' && u.role !== 'admin' && (
                      <ActionButton title="禁用账号" danger onClick={() => void call('disable', u, '已禁用该账号')}>
                        <X size={14} />
                      </ActionButton>
                    )}
                    {u.status === 'disabled' && (
                      <ActionButton title="恢复账号" onClick={() => void call('enable', u, '已恢复该账号')}>
                        <RefreshCw size={13} />
                      </ActionButton>
                    )}
                    <ActionButton
                      title="重置密码"
                      onClick={() => {
                        setResetTarget(u);
                        setNewPassword('');
                      }}
                    >
                      <KeyRound size={13} />
                    </ActionButton>
                    {(u.status === 'pending' || u.status === 'rejected') && u.id !== me?.id && (
                      <ActionButton title="删除申请记录" danger onClick={() => setDeleteTarget(u)}>
                        <X size={14} />
                      </ActionButton>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {resetTarget && (
        <Modal title={`重置「${resetTarget.displayName}」的密码`} onClose={() => setResetTarget(null)} width={400}>
          <label htmlFor="reset-pwd" className="mb-1.5 block text-[13px] text-sub">
            新密码（至少 8 位）
          </label>
          <input
            id="reset-pwd"
            type="text"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="off"
            className="w-full rounded-md border border-line bg-white px-3 py-2 font-mono text-[13px] outline-none focus:border-signal"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setResetTarget(null)}
              className="rounded-md border border-line px-3.5 py-2 text-[13px] text-sub hover:text-main"
            >
              取消
            </button>
            <button
              type="button"
              disabled={newPassword.length < 8}
              onClick={() => void resetPassword()}
              className="rounded-md bg-signal px-3.5 py-2 text-[13px] font-medium text-white hover:bg-signal-deep disabled:opacity-50"
            >
              确认重置
            </button>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="删除注册记录"
          description={`确定删除「${deleteTarget.displayName}（@${deleteTarget.username}）」的注册记录吗？删除后该用户名可重新注册。`}
          confirmText="确认删除"
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            await api(`/api/admin/users/${deleteTarget.id}`, { method: 'DELETE' });
            toast('已删除', 'success');
            await load();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

/** 群聊管理面板 */
function GroupsPanel() {
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [dissolveTarget, setDissolveTarget] = useState<AdminGroup | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ groups: AdminGroup[] }>('/api/admin/groups');
      setGroups(res.groups);
    } catch (err) {
      toast(err instanceof Error ? err.message : '加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 size={18} className="animate-spin text-sub" /></div>;
  }

  return (
    <>
      {groups.length === 0 ? (
        <div className="py-16 text-center text-[13px] text-sub">还没有群聊</div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line">
              <th className={TH}>群名称</th>
              <th className={TH}>群主</th>
              <th className={TH}>成员数</th>
              <th className={TH}>消息数</th>
              <th className={TH}>创建时间</th>
              <th className={`${TH} text-right`}>操作</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id} className="border-b border-line/60 transition-colors duration-100 hover:bg-paper-deep/40">
                <td className={`${TD} font-medium`}>{g.name}</td>
                <td className={`${TD} text-sub`}>{g.creatorName ?? '-'}</td>
                <td className={`${TD} font-mono text-[12px]`}>{g.memberCount}</td>
                <td className={`${TD} font-mono text-[12px]`}>{g.messageCount}</td>
                <td className={`${TD} font-mono text-[11px] text-sub`}>{formatFullTime(g.createdAt)}</td>
                <td className={`${TD} text-right`}>
                  <button
                    type="button"
                    onClick={() => setDissolveTarget(g)}
                    className="rounded-md border border-danger/40 px-2.5 py-1.5 text-[12px] text-danger transition-colors duration-100 hover:bg-danger-soft"
                  >
                    解散
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {dissolveTarget && (
        <ConfirmDialog
          title="解散群聊"
          description={`确定解散群聊「${dissolveTarget.name}」吗？群内 ${dissolveTarget.messageCount} 条消息将一并删除，该操作不可恢复。`}
          confirmText="确认解散"
          onClose={() => setDissolveTarget(null)}
          onConfirm={async () => {
            await api(`/api/admin/groups/${dissolveTarget.id}`, { method: 'DELETE' });
            toast('群聊已解散', 'success');
            await load();
          }}
        />
      )}
    </>
  );
}

/** 数据概览面板 */
function StatsPanel({ stats, loading }: { stats: AdminStats | null; loading: boolean }) {
  if (loading || !stats) {
    return <div className="flex justify-center py-16"><Loader2 size={18} className="animate-spin text-sub" /></div>;
  }
  const cards: { label: string; value: string; sub?: string }[] = [
    { label: '注册用户', value: String(stats.users.total), sub: `正常 ${stats.users.approved}` },
    { label: '待审核', value: String(stats.users.pending), sub: `已驳回 ${stats.users.rejected} / 已禁用 ${stats.users.disabled}` },
    { label: '当前在线', value: String(stats.online), sub: '实时连接数' },
    { label: '群聊 / 私聊', value: `${stats.conversations.group} / ${stats.conversations.direct}` },
    { label: '消息总数', value: String(stats.messages.total), sub: `今日 ${stats.messages.today}` },
    { label: '文件', value: String(stats.files.count), sub: formatBytes(stats.files.bytes) },
  ];
  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map((card) => (
        <div key={card.label} className="rounded-md border border-line bg-white px-4 py-3.5">
          <div className="text-[11px] uppercase tracking-wider text-sub">{card.label}</div>
          <div className="mt-1.5 font-mono text-[24px] font-medium leading-none text-main">{card.value}</div>
          {card.sub && <div className="mt-1.5 text-[11px] text-sub">{card.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<AdminTab>('review');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const loadStats = useCallback(async () => {
    try {
      const res = await api<{ stats: AdminStats }>('/api/admin/stats');
      setStats(res.stats);
    } catch {
      // 概览失败不阻断其他功能
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  if (!user || user.role !== 'admin') {
    return null;
  }

  const tabs: { key: AdminTab; label: string; icon: ReactNode; badge?: number }[] = [
    { key: 'review', label: '注册审核', icon: <Inbox size={15} strokeWidth={1.75} />, badge: stats?.users.pending },
    { key: 'users', label: '用户管理', icon: <Users size={15} strokeWidth={1.75} /> },
    { key: 'groups', label: '群聊管理', icon: <ShieldCheck size={15} strokeWidth={1.75} /> },
    { key: 'stats', label: '数据概览', icon: <BarChart3 size={15} strokeWidth={1.75} /> },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-paper font-sans text-main">
      {/* 顶栏 */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5">
        <div className="flex items-center gap-3">
          <Link
            to="/chat"
            title="返回聊天"
            className="rounded-md p-2 text-sub transition-colors duration-100 hover:bg-paper-deep hover:text-main"
          >
            <ArrowLeft size={17} strokeWidth={1.75} />
          </Link>
          <div>
            <div className="text-[15px] font-medium">管理后台</div>
            <div className="font-mono text-[10px] tracking-[0.18em] text-sub">INTRACHAT ADMIN</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[13px] text-sub">
          <Avatar id={user.id} name={user.displayName} size={26} />
          {user.displayName}
        </div>
      </header>

      {/* 页签 */}
      <div className="border-b border-line px-5">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`relative flex items-center gap-1.5 px-3.5 py-3 text-[13px] transition-colors duration-100 ${
                tab === t.key ? 'font-medium text-main' : 'text-sub hover:text-main'
              }`}
            >
              {t.icon}
              {t.label}
              {t.badge !== undefined && t.badge > 0 && (
                <span className="flex h-[17px] min-w-[17px] items-center justify-center rounded-sm bg-amber px-1 font-mono text-[10px] font-medium text-ink-900">
                  {t.badge}
                </span>
              )}
              {tab === t.key && <span className="absolute bottom-0 left-0 h-[2px] w-full bg-signal" />}
            </button>
          ))}
        </div>
      </div>

      {/* 内容 */}
      <main className="flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-5xl rounded-md border border-line bg-white p-5">
          {tab === 'review' && <ReviewPanel onChanged={() => void loadStats()} />}
          {tab === 'users' && <UsersPanel onChanged={() => void loadStats()} />}
          {tab === 'groups' && <GroupsPanel />}
          {tab === 'stats' && <StatsPanel stats={stats} loading={statsLoading} />}
        </div>
      </main>
    </div>
  );
}
