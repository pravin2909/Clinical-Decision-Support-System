/**
 * App-wide auth state. Any component can read the current user and call
 * signIn / signUp / signOut via the `useAuth` hook.
 */
import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

import * as auth from "../lib/auth";

interface AuthState {
  user: auth.User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (body: auth.RegisterBody) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>.");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<auth.User | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadUser() {
    if (!auth.isAuthed()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await auth.me());
    } catch {
      auth.clearTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUser();
  }, []);

  const signIn = async (email: string, password: string) => {
    await auth.login(email, password);
    await loadUser();
  };

  const signUp = async (body: auth.RegisterBody) => {
    await auth.register(body);
    await auth.login(body.email, body.password);
    await loadUser();
  };

  const signOut = async () => {
    await auth.logout();
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </Ctx.Provider>
  );
}
