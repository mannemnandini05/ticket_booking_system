import React, { useEffect, useState } from "react";
import { Bell, X, Check, AlertCircle, CheckCircle2, Inbox } from "lucide-react";
import "../styles/notifications-enhanced.css";
import api from "../api";
import { useAuth } from "../context/AuthContext";

export default function NotificationsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [notificationStats, setNotificationStats] = useState({ unread_count: 0, total_count: 0 });
  const [filter, setFilter] = useState("all"); // all, unread, event, booking, payment
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState({
    notification_preferences: {
      booking_confirmations: true,
      payment_updates: true,
      event_reminders: true,
      promotional: false,
    },
  });

  useEffect(() => {
    loadNotifications();
    loadPreferences();
    const interval = setInterval(loadNotifications, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const loadNotifications = async () => {
    try {
      const [notifRes, statsRes] = await Promise.all([
        api.get("/api/notifications"),
        api.get("/api/v2/notifications/stats"),
      ]);
      setNotifications(notifRes.data);
      setNotificationStats(statsRes.data);
    } catch (err) {
      console.error("Failed to load notifications:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadPreferences = async () => {
    try {
      const res = await api.get("/api/v2/user/preferences");
      setPreferences(res.data);
    } catch (err) {
      console.error("Failed to load preferences:", err);
    }
  };

  const markAsRead = async (id) => {
    try {
      await api.patch(`/api/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.patch("/api/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  };

  const deleteNotification = async (id) => {
    try {
      await api.delete(`/api/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error("Failed to delete notification:", err);
    }
  };

  const updatePreferences = async (newPrefs) => {
    try {
      await api.put("/api/v2/user/preferences", newPrefs);
      setPreferences(newPrefs);
    } catch (err) {
      console.error("Failed to update preferences:", err);
    }
  };

  const getFilteredNotifications = () => {
    if (filter === "all") return notifications;
    if (filter === "unread") return notifications.filter((n) => !n.is_read);
    return notifications.filter((n) => n.type === filter.toUpperCase());
  };

  const filteredNotifications = getFilteredNotifications();

  const getNotificationIcon = (type) => {
    switch (type) {
      case "BOOKING":
        return <CheckCircle2 size={20} className="icon-booking" />;
      case "PAYMENT":
        return <AlertCircle size={20} className="icon-payment" />;
      case "EVENT":
        return <Bell size={20} className="icon-event" />;
      default:
        return <Inbox size={20} />;
    }
  };

  const getNotificationColor = (type) => {
    switch (type) {
      case "BOOKING":
        return "booking";
      case "PAYMENT":
        return "payment";
      case "EVENT":
        return "event";
      default:
        return "system";
    }
  };

  if (loading) {
    return (
      <main className="notifications-page">
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading notifications...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="notifications-page">
      <div className="page-header">
        <h1>Notifications</h1>
        <div className="header-stats">
          <span className="stat-badge">{notificationStats.unread_count} unread</span>
          <span className="stat-badge secondary">{notificationStats.total_count} total</span>
        </div>
      </div>

      <div className="notifications-container">
        {/* Sidebar */}
        <aside className="notifications-sidebar">
          <div className="sidebar-section">
            <h3>Filters</h3>
            {[
              { id: "all", label: "All", icon: Inbox },
              { id: "unread", label: "Unread", icon: Bell },
              { id: "booking", label: "Bookings", icon: CheckCircle2 },
              { id: "payment", label: "Payments", icon: AlertCircle },
              { id: "event", label: "Events", icon: Bell },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={`filter-button ${filter === id ? "active" : ""}`}
                onClick={() => setFilter(id)}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="sidebar-section">
            <div className="section-header">
              <h3>Preferences</h3>
            </div>
            <div className="preference-item">
              <label>
                <input
                  type="checkbox"
                  checked={preferences.notification_preferences?.booking_confirmations}
                  onChange={(e) =>
                    updatePreferences({
                      ...preferences,
                      notification_preferences: {
                        ...preferences.notification_preferences,
                        booking_confirmations: e.target.checked,
                      },
                    })
                  }
                />
                Booking Confirmations
              </label>
            </div>
            <div className="preference-item">
              <label>
                <input
                  type="checkbox"
                  checked={preferences.notification_preferences?.payment_updates}
                  onChange={(e) =>
                    updatePreferences({
                      ...preferences,
                      notification_preferences: {
                        ...preferences.notification_preferences,
                        payment_updates: e.target.checked,
                      },
                    })
                  }
                />
                Payment Updates
              </label>
            </div>
            <div className="preference-item">
              <label>
                <input
                  type="checkbox"
                  checked={preferences.notification_preferences?.event_reminders}
                  onChange={(e) =>
                    updatePreferences({
                      ...preferences,
                      notification_preferences: {
                        ...preferences.notification_preferences,
                        event_reminders: e.target.checked,
                      },
                    })
                  }
                />
                Event Reminders
              </label>
            </div>
            <div className="preference-item">
              <label>
                <input
                  type="checkbox"
                  checked={preferences.notification_preferences?.promotional}
                  onChange={(e) =>
                    updatePreferences({
                      ...preferences,
                      notification_preferences: {
                        ...preferences.notification_preferences,
                        promotional: e.target.checked,
                      },
                    })
                  }
                />
                Promotional Offers
              </label>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="notifications-content">
          {/* Toolbar */}
          <div className="notifications-toolbar">
            <span className="count-label">
              {filteredNotifications.length} {filter === "unread" ? "unread" : ""} notifications
            </span>
            {filteredNotifications.some((n) => !n.is_read) && (
              <button className="secondary-button" onClick={markAllAsRead}>
                <Check size={16} />
                Mark all as read
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="notifications-list">
            {filteredNotifications.length > 0 ? (
              filteredNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`notification-item ${getNotificationColor(notification.type)} ${
                    !notification.is_read ? "unread" : ""
                  }`}
                  onClick={() => !notification.is_read && markAsRead(notification.id)}
                >
                  <div className="notification-icon">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="notification-content">
                    <h4 className="notification-title">{notification.title}</h4>
                    <p className="notification-message">{notification.message}</p>
                    <span className="notification-time">
                      {new Date(notification.created_at).toLocaleDateString()}{" "}
                      {new Date(notification.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <button
                    className="notification-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNotification(notification.id);
                    }}
                  >
                    <X size={18} />
                  </button>
                  {!notification.is_read && <div className="unread-indicator" />}
                </div>
              ))
            ) : (
              <div className="empty-state">
                <Bell size={48} />
                <h3>No notifications</h3>
                <p>
                  {filter === "unread"
                    ? "You're all caught up! No unread notifications."
                    : "You don't have any notifications yet."}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
