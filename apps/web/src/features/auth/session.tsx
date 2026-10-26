"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { schemas, type MeResponse, type PrivateUser } from "@stargaze/shared";
import { request, RequestError } from "@/lib/api/client";

type Session = {
  user: PrivateUser | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};
const Context = createContext<Session | null>(null);
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PrivateUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const loggingOut = useRef(false);
  const refresh = useCallback(async () => {
    if (loggingOut.current) return;
    const n = ++generation.current;
    try {
      const result = await request<MeResponse>("/me", schemas.MeResponse);
      if (n === generation.current) {
        setUser(result.user);
        setError("");
      }
    } catch (e) {
      if (n === generation.current) {
        setUser(null);
        setError(
          e instanceof RequestError && e.status === 401
            ? ""
            : "Account service unavailable.",
        );
      }
    } finally {
      if (n === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener("focus", visible);
    return () => window.removeEventListener("focus", visible);
  }, [refresh]);
  const logout = useCallback(async () => {
    if (loggingOut.current) return;
    loggingOut.current = true;
    ++generation.current;
    setLoading(true);
    setError("");
    try {
      await request<void>("/auth/logout", undefined, { method: "POST" });
      setUser(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      loggingOut.current = false;
      setLoading(false);
    }
  }, []);
  return (
    <Context.Provider value={{ user, loading, error, refresh, logout }}>
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error("SessionProvider missing");
  return value;
}
