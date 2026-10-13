import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthContext } from './authContext';
import {
  getMeRequest,
  loginRequest,
  registerRequest,
  verifyRequest,
} from '../services/auth.service';
import { clearToken, getToken, setToken } from '../services/tokenStorage';

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(getToken()));

  // On first load: if a wristband is saved, ask the server who it belongs to.
  useEffect(() => {
    if (!getToken()) return;

    let cancelled = false;

    getMeRequest()
      .then(({ user }) => {
        if (!cancelled) setUser(user);
      })
      .catch(() => clearToken())
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // The API helper announces this when the server says "your wristband is no good".
  useEffect(() => {
    const handleLogout = () => setUser(null);
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  // credentials: { identifier (an email or a phone number), password }.
  // If the account was never confirmed, the server answers 403 and the login page sends the person to the code screen.
  const login = useCallback(async (credentials) => {
    const { user, token } = await loginRequest(credentials);
    setToken(token);
    setUser(user);
  }, []);

  // A new account is NOT logged in yet: this only starts the sign-up and returns where the code was sent.
  const register = useCallback((details) => registerRequest(details), []);

  // Confirms the code, and logs the person in.
  const verify = useCallback(async ({ identifier, code }) => {
    const { user, token } = await verifyRequest({ identifier, code });
    setToken(token);
    setUser(user);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  // After the person edits their profile, keep the new details everywhere.
  const updateUser = useCallback((nextUser) => {
    setUser(nextUser);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, verify, logout, updateUser }),
    [user, loading, login, register, verify, logout, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
