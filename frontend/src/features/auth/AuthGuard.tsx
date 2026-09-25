import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

/**
 * AuthGuard — wraps protected routes.
 *
 * While auth is loading (checking the session cookie), renders nothing
 * to avoid a flash of the login page before redirecting.
 * Once resolved, redirects unauthenticated users to /login.
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
