import { Bell } from "lucide-react";
import { useState } from "react";
import api from "../api";
import { useAuth } from "../context/AuthContext";

export default function NotificationDropdown() {
  const {
    notifications,
    setNotifications,
    notificationsLoading: loading,
    setNotificationsLoading: setLoading,
    notificationsError: error,
    setNotificationsError: setError,
  } = useAuth();
  const [open, setOpen] = useState(false);
  const unreadCount = notifications.filter((item) => !item.is_read).length;

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/notifications");
      setNotifications(response.data);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  };

  const toggle = async () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) await load();
  };

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
    <div className="notification-wrap">
      <button className="icon-button" onClick={toggle} aria-label="Notifications">
        <Bell size={20} />{unreadCount > 0 && <span className="badge">{unreadCount}</span>}
      </button>
      {open && <div className="notification-dropdown">
        <div className="dropdown-header"><strong>Notifications</strong><span>{unreadCount} unread</span></div>
        {error && <div className="notification-error">{error}<button onClick={load}>Retry</button></div>}
        <div className="notification-list">
          {loading ? <p className="empty-copy">Loading notifications...</p> : notifications.length
            ? notifications.slice(0, 5).map((item) => <button key={item.id} className="notification-item" onClick={() => markRead(item.id)}>
              <span className={`notification-dot ${item.is_read ? "read" : ""}`} />
              <span><strong>{item.title}</strong><small>{item.message}</small></span>
            </button>)
            : !error && <p className="empty-copy">You are all caught up.</p>}
        </div>
      </div>}
    </div>
  );
}
