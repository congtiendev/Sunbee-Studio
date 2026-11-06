import { apiClient } from "@/lib/api-client";
import type { User as ApiUser } from "@shared/types";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type User = ApiUser | null;

interface AuthContextType {
  user: User;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const session = await apiClient.auth.getSession();
    setUser(session);
  };

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, []);

  const signOut = async () => {
    await apiClient.auth.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
