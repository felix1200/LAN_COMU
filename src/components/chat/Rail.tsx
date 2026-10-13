import { KeyRound, LogOut, MessageSquare, RadioTower, Search, ShieldCheck, UserCircle, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '../../api/types';
import Avatar from '../Avatar';
import type { WsStatus } from '../../store/chat';

export type RailTab = 'chats' | 'contacts';

interface RailProps {
  tab: RailTab;
  onTabChange: (tab: RailTab) => void;
  unread: number;
  wsStatus: WsStatus;
  user: User;
  onChangePassword: () => void;
  onLogout: () => void;
  onSearch: () => void;
  onProfile: () => void;
}

const STATUS_STYLE: Record<WsStatus, { cls: string; label: string }> = {
  online: { cls: 'bg-online', label: '已连接' },
  connecting: { cls: 'bg-amber', label: '连接中' },
  offline: { cls: 'bg-amber', label: '重连中' },
};

function RailButton({
  active,
  label,
  badge,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  badge?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`relative flex h-10 w-10 items-center justify-center rounded-md transition-colors duration-100 ${
        active ? 'bg-ink-800 text-paper' : 'text-[#8A968F] hover:bg-ink-800 hover:text-paper'
      }`}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-sm bg-amber px-0.5 font-mono text-[10px] font-medium text-ink-900">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

export default function Rail({ tab, onTabChange, unread, wsStatus, user, onChangePassword, onLogout, onSearch, onProfile }: RailProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const status = STATUS_STYLE[wsStatus];

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  return (
    <div className="flex w-14 shrink-0 flex-col items-center bg-ink-900 py-3">
      {/* 品牌 */}
      <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-md bg-signal" title="内信 IntraChat">
        <RadioTower size={17} strokeWidth={1.75} className="text-white" />
      </div>

      <div className="flex flex-col gap-1.5">
        <RailButton active={tab === 'chats'} label="消息" badge={unread} onClick={() => onTabChange('chats')}>
          <MessageSquare size={18} strokeWidth={1.75} />
        </RailButton>
        <RailButton active={tab === 'contacts'} label="通讯录" onClick={() => onTabChange('contacts')}>
          <Users size={18} strokeWidth={1.75} />
        </RailButton>
      </div>

      <div className="flex-1" />

      {/* 历史消息搜索 */}
      <RailButton label="搜索历史消息" onClick={onSearch}>
        <Search size={18} strokeWidth={1.75} />
      </RailButton>

      {/* 管理后台入口 */}
      {user.role === 'admin' && (
        <div className="mb-2">
          <RailButton label="管理后台" onClick={() => navigate('/admin')}>
            <ShieldCheck size={18} strokeWidth={1.75} />
          </RailButton>
        </div>
      )}

      {/* 连接状态 */}
      <div className="mb-3 flex items-center justify-center" title={`实时通道：${status.label}`}>
        <span className={`h-2 w-2 rounded-full ${status.cls}`} />
      </div>

      {/* 用户菜单 */}
      <div className="relative" ref={menuRef}>
        <button type="button" onClick={() => setMenuOpen((v) => !v)} title={user.displayName}>
          <Avatar id={user.id} name={user.displayName} size={34} rounded="sm" avatarId={user.avatarId ?? null} />
        </button>
        {menuOpen && (
          <div className="absolute bottom-0 left-12 z-30 w-44 overflow-hidden rounded-md border border-line bg-paper shadow-lg">
            <div className="border-b border-line px-3.5 py-2.5">
              <div className="truncate text-[13px] font-medium text-main">{user.displayName}</div>
              <div className="truncate font-mono text-[11px] text-sub">@{user.username}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onProfile();
              }}
              className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13px] text-main transition-colors duration-100 hover:bg-paper-deep"
            >
              <UserCircle size={14} strokeWidth={1.75} className="text-sub" />
              我的资料
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onChangePassword();
              }}
              className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13px] text-main transition-colors duration-100 hover:bg-paper-deep"
            >
              <KeyRound size={14} strokeWidth={1.75} className="text-sub" />
              修改密码
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13px] text-danger transition-colors duration-100 hover:bg-danger-soft"
            >
              <LogOut size={14} strokeWidth={1.75} />
              退出登录
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
