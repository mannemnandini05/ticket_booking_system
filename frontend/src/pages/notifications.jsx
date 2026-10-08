import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import api from "../api";
import { useAuth } from "../context/AuthContext";

export default function Notifications() {
  const { notifications, setNotifications } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/notifications")
      .then((response) => setNotifications(response.data))
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [setNotifications]);

  const markRead = async (id) => {
    setError("");
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((items) => items.map((item) => item.id === id ? { ...item, is_read: true } : item));
    } catch (reason) {
      setError(reason.message);
    }
  };

  return (
    <main className="page-shell">
      <div className="page-title"><div><span className="eyebrow">Stay in the loop</span><h1>Notifications</h1></div></div>
      {error && <div className="error-state">{error}</div>}
      {loading ? <div className="page-loader">Loading notifications...</div>
        : notifications.length ? <div className="notification-page-list">{notifications.map((item) => <article className={`notification-page-item ${item.is_read ? "read" : ""}`} key={item.id}>
          <span className="notification-icon">{item.type === "BOOKING" ? "✓" : "•"}</span>
          <div><div><h3>{item.title}</h3><span>{new Date(item.created_at).toLocaleDateString("en-IN")}</span></div><p>{item.message}</p></div>
          {!item.is_read && <button className="secondary-button small" onClick={() => markRead(item.id)}>Mark read</button>}
        </article>)}</div>
          : !error && <div className="empty-state"><Bell size={34} /><h3>No notifications</h3><p>Booking confirmations will appear here.</p></div>}
    </main>
  );
}
