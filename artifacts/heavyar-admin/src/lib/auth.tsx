import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onIdTokenChanged } from 'firebase/auth';
import { authorizationFingerprint } from './query-policy';
import { accountRefreshKeys, refreshQueries } from './admin-feedback';
import { getFirebaseAuth } from './firebase';
import { useQueryClient } from '@tanstack/react-query';

type AuthContextType = {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshClaims: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
  refreshClaims: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    const auth = getFirebaseAuth();
    let previousUid: string | null | undefined;
    let previousClaims: string | undefined;
    let generation = 0;
    const unsubscribe = onIdTokenChanged(auth, async (u) => {
      const current = ++generation;
      const identityChanged = previousUid !== u?.uid;
      if (identityChanged) {
        queryClient.clear();
        previousClaims = undefined;
      }
      previousUid = u?.uid;
      setUser(u);
      setLoading(false);
      if (!u) return;
      try {
        const token = await u.getIdTokenResult();
        if (current !== generation) return;
        const claims = authorizationFingerprint(token.claims);
        if (previousClaims !== undefined && previousClaims !== claims) {
          await queryClient.invalidateQueries({ queryKey: ['adminSession'] });
        }
        previousClaims = claims;
      } catch {
        // Token refresh failures do not revoke an authenticated session.
      }
    });
    return () => { generation++; unsubscribe(); };
  }, [queryClient]);

  const logout = async () => {
    const auth = getFirebaseAuth();
    await auth.signOut();
    setUser(null);
  };

  const refreshClaims = async () => {
    if (!getFirebaseAuth().currentUser) return;
    await getFirebaseAuth().currentUser!.getIdToken(true);
    await queryClient.invalidateQueries({ queryKey: ['adminSession'] });
    await refreshQueries(queryClient, accountRefreshKeys);
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout, refreshClaims }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
