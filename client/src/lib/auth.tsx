import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { apiRequest } from "./queryClient";

interface AuthCtx {
  authenticated: boolean;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthCtx>({
  authenticated: false,
  login: async () => false,
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);

  const login = useCallback(async (password: string) => {
    try {
      const res = await apiRequest("POST", "/api/auth/login", { password });
      if (res.ok) {
        setAuthenticated(true);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(() => setAuthenticated(false), []);

  return (
    <AuthContext.Provider value={{ authenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
