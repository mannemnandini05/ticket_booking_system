import { createContext, useContext, useEffect, useState } from "react";
import api from "../api";

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let active = true;
    const onUnauthorized = () => {
      localStorage.removeItem("smartevent_token");
      setUser(null);
      setNotifications([]);
    };
    window.addEventListener("smartevent:unauthorized", onUnauthorized);
    const token = localStorage.getItem("smartevent_token");
    if (!token) {
      setLoading(false);
      return () => window.removeEventListener("smartevent:unauthorized", onUnauthorized);
    }
    api.get("/auth/me")
      .then((response) => {
        if (!active) return;
        setAuthError("");
        setUser(response.data);
      })
      .catch((error) => {
        if (!active) return;
        if (error.response?.status === 401) {
          localStorage.removeItem("smartevent_token");
          setUser(null);
        } else {
          setAuthError(error.message);
        }
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
      window.removeEventListener("smartevent:unauthorized", onUnauthorized);
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!user) {
      setNotifications([]);
      setNotificationsError("");
      return () => { active = false; };
    }
    setNotificationsLoading(true);
    setNotificationsError("");
    api.get("/notifications")
      .then((response) => active && setNotifications(response.data))
      .catch((error) => active && setNotificationsError(error.message))
      .finally(() => active && setNotificationsLoading(false));
    return () => { active = false; };
  }, [user]);

  const login = async (email, password) => {
    const response = await api.post("/auth/login", { email, password });
    localStorage.setItem("smartevent_token", response.data.access_token);
    setAuthError("");
    setUser(response.data.user);
  };

  const register = async (username, email, password) => {
    const response = await api.post("/auth/register", { username, email, password });
    localStorage.setItem("smartevent_token", response.data.access_token);
    setAuthError("");
    setUser(response.data.user);
  };

  const logout = () => {
    localStorage.removeItem("smartevent_token");
    setUser(null);
    setNotifications([]);
    setAuthError("");
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, notifications, setNotifications, notificationsLoading, setNotificationsLoading, notificationsError, setNotificationsError, authError }}>
      {children}
    </AuthContext.Provider>
  );
}
