import { RadioTower } from 'lucide-react';
import { useState } from 'react';
import ChangePasswordModal from '../components/chat/ChangePasswordModal';
import ChatWindow from '../components/chat/ChatWindow';
import ContactsPanel from '../components/chat/ContactsPanel';
import ConversationList from '../components/chat/ConversationList';
import ProfileModal from '../components/chat/ProfileModal';
import Rail, { type RailTab } from '../components/chat/Rail';
import SearchModal from '../components/chat/SearchModal';
import { useAuth } from '../store/auth';
import { ChatProvider, useChat } from '../store/chat';

function EmptyState() {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 text-sub">
      <div className="flex h-14 w-14 items-center justify-center rounded-md border border-line bg-paper-deep">
        <RadioTower size={24} strokeWidth={1.5} />
      </div>
      <p className="text-[13px]">从左侧选择一个会话，或到通讯录发起聊天</p>
      <p className="font-mono text-[10px] tracking-[0.2em] text-sub/60">INTRANET DISPATCH READY</p>
    </div>
  );
}

function ChatShell({
  onLogout,
  onChangePassword,
  onSearch,
  onProfile,
}: {
  onLogout: () => void;
  onChangePassword: () => void;
  onSearch: () => void;
  onProfile: () => void;
}) {
  const { user } = useAuth();
  const { totalUnread, wsStatus, activeConversation } = useChat();
  const [tab, setTab] = useState<RailTab>('chats');

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-paper font-sans text-main">
      <Rail
        tab={tab}
        onTabChange={setTab}
        unread={totalUnread}
        wsStatus={wsStatus}
        user={user}
        onChangePassword={onChangePassword}
        onLogout={onLogout}
        onSearch={onSearch}
        onProfile={onProfile}
      />
      <div className="w-72 shrink-0 border-r border-line bg-paper">
        {tab === 'chats' ? <ConversationList /> : <ContactsPanel onStarted={() => setTab('chats')} />}
      </div>
      {activeConversation ? <ChatWindow key={activeConversation.id} /> : <EmptyState />}
    </div>
  );
}

export default function ChatPage() {
  const { logout } = useAuth();
  const [pwdOpen, setPwdOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  return (
    <ChatProvider>
      <ChatShell
        onLogout={logout}
        onChangePassword={() => setPwdOpen(true)}
        onSearch={() => setSearchOpen(true)}
        onProfile={() => setProfileOpen(true)}
      />
      {pwdOpen && <ChangePasswordModal onClose={() => setPwdOpen(false)} />}
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
    </ChatProvider>
  );
}
