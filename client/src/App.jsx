import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import GuestRoute from './components/GuestRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import VerifyPage from './pages/VerifyPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ChatPage from './pages/ChatPage';

// Profiles and single posts download only when someone opens them.
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const PostPage = lazy(() => import('./pages/PostPage'));

export default function App() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center bg-slate-900 text-sm text-slate-400">
          Loading...
        </div>
      }
    >
      <Routes>
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/forgot" element={<ForgotPasswordPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          {/* The chat list stays on screen in both, so messages keep arriving while you browse the feed. */}
          <Route path="/" element={<ChatPage />} />
          <Route path="/feed" element={<ChatPage />} />

          {/* Someone's profile (or mine), and a single post. */}
          <Route path="/u/:userId" element={<ProfilePage />} />
          <Route path="/p/:postId" element={<PostPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
