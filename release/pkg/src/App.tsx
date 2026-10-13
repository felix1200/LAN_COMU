import type { ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import FirstLoginPasswordChange from './components/FirstLoginPasswordChange';
import Toaster from './components/Toaster';
import AdminPage from './pages/AdminPage';
import ChatPage from './pages/ChatPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import { useAuth } from './store/auth';

function FullScreenHint({ text }: { text: string }) {
  return (
    <div className="flex h-screen items-center justify-center bg-paper text-sub">
      <span className="font-mono text-xs tracking-widest">{text}</span>
    </div>
  );
}

function RequireAuth({ children, admin }: { children: ReactElement; admin?: boolean }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return <FullScreenHint text="LOADING…" />;
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  // 预置管理员首次登录强制改密：尚未完成改密前，无论访问哪个页面都先引导改密
  if (user.mustChangePassword) {
    return <FirstLoginPasswordChange />;
  }
  if (admin && user.role !== 'admin') {
    return <Navigate to="/chat" replace />;
  }
  return children;
}

function GuestOnly({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <FullScreenHint text="LOADING…" />;
  }
  if (user) {
    return <Navigate to="/chat" replace />;
  }
  return children;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
        <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
        <Route path="/chat" element={<RequireAuth><ChatPage /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth admin><AdminPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
