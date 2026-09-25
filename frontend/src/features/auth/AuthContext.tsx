import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '../../types';
import { authService } from '../../services/authService';

/**
 * Auth context — global authentication state.
 *
 * Why Context over prop drilling?
 * Auth state (who is logged in) is needed across many unrelated components:
 * the navbar, protected routes, the dashboard, the IDE header.
 * Context provides it without threading props through every layer.
 *
 * Why not Redux/Zustand at this stage?
 * Context is sufficient for auth state which changes rarely.
 * State management libraries add value when state is complex and
 * changes frequently — that's Phase 6+ territory.
 *
 * Flow on app load:
 * 1. App renders with user = null, loading = true
 * 2. useEffect fires, calls GET /api/auth/me
 * 3. If the cookie is valid → user is set
 * 4. If no cookie / expired → user stays null
 * 5. Loading becomes false
 * 6. AuthGuard can now make the correct routing decision
 */

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, check if there's an existing session
  useEffect(() => {
    authService
      .getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const user = await authService.login({ email, password });
    setUser(user);
  }

  async function register(name: string, email: string, password: string) {
    const user = await authService.register({ name, email, password });
    setUser(user);
  }

  async function logout() {
    await authService.logout();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
