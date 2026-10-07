import { createContext, useContext, useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { Bell, CalendarDays, ChevronDown, LogOut, Menu, Search, Ticket, UserRound, X } from "lucide-react";
import api from "./api";

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loader">Loading your experience...</div>;
  return user ? children : <Navigate to="/login" replace />;
}

function Navbar() {
  const { user, logout, notifications } = useAuth();
  const unreadCount = notifications.filter((item) => !item.is_read).length;
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const navigate = useNavigate();

  const openNotifications = async () => {
    setNotificationsOpen(!notificationsOpen);
    if (!notificationsOpen) await loadNotifications();
  };

  const loadNotifications = async () => {
    try {
      const response = await api.get("/notifications");
      notifications.splice(0, notifications.length, ...response.data);
    } catch {}
  };

  const markRead = async (id) => {
    await api.patch(`/notifications/${id}/read`);
    await loadNotifications();
  };

  return (
    <header className="navbar">
      <div className="nav-inner">
        <NavLink to="/" className="brand"><span className="brand-mark">S</span> SmartEvent</NavLink>
        <nav className={menuOpen ? "nav-links open" : "nav-links"}>
          <NavLink to="/" onClick={() => setMenuOpen(false)}>Discover</NavLink>
          <NavLink to="/bookings" onClick={() => setMenuOpen(false)}>My bookings</NavLink>
          <NavLink to="/tickets" onClick={() => setMenuOpen(false)}>My tickets</NavLink>
          <NavLink to="/notifications" onClick={() => setMenuOpen(false)}>Notifications</NavLink>
        </nav>
        <div className="nav-actions">
          <div className="notification-wrap">
            <button className="icon-button" onClick={openNotifications} aria-label="Notifications"><Bell size={20} />{unreadCount > 0 && <span className="badge">{unreadCount}</span>}</button>
            {notificationsOpen && <div className="notification-dropdown">
              <div className="dropdown-header"><strong>Notifications</strong><span>{unreadCount} unread</span></div>
              <div className="notification-list">{notifications.length ? notifications.slice(0, 5).map((item) => <button key={item.id} className="notification-item" onClick={() => markRead(item.id)}><span className={`notification-dot ${item.is_read ? "read" : ""}`} /><span><strong>{item.title}</strong><small>{item.message}</small></span></button>) : <p className="empty-copy">You are all caught up.</p>}</div>
            </div>}
          </div>
          <div className="profile-menu">
            <button className="profile-button" onClick={() => navigate("/profile")}><UserRound size={18} /> <span>{user?.username}</span><ChevronDown size={15} /></button>
            <div className="profile-dropdown"><button onClick={logout}><LogOut size={16} /> Sign out</button></div>
          </div>
          <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">{menuOpen ? <X /> : <Menu />}</button>
        </div>
      </div>
    </header>
  );
}

function EventCard({ event, onBook }) {
  const date = new Date(event.event_date);
  return <article className="event-card">
    <div className="event-image"><img src={event.banner_image || "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80"} alt={event.title} /><span className="category-pill">{event.category}</span></div>
    <div className="event-body"><div className="event-date"><CalendarDays size={15} /> {date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div><h3>{event.title}</h3><p>{event.description}</p><div className="event-footer"><div><small>From</small><strong>₹{event.ticket_price.toLocaleString("en-IN")}</strong></div><button className="primary-button small" onClick={() => onBook(event)}>Book tickets</button></div></div>
  </article>;
}

function Home() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    api.get("/events", { params: { search, category } })
      .then((res) => active && setEvents(res.data))
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [search, category]);

  const scrollToEvents = () => document.getElementById("events")?.scrollIntoView({ behavior: "smooth" });
  const content = loading ? <div className="page-loader">Finding events...</div> : error ? <div className="error-state">{error}</div> : events.length ? <div className="event-grid">{events.map((event) => <EventCard key={event.id} event={event} onBook={(item) => navigate(`/events/${item.id}/book`, { state: { event: item } })} />)}</div> : <div className="empty-state"><Search size={34} /><h3>No events found</h3><p>Try another search or category.</p></div>;

  return <main>
    <section className="hero">
      <div className="hero-glow" />
      <div className="hero-content"><span className="eyebrow">Your next unforgettable day starts here</span><h1>Discover the moments<br /><em>that move you.</em></h1><p>Explore handpicked events, secure your place in seconds, and carry every ticket in your pocket.</p><div className="hero-search"><Search size={19} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search events, artists or places..." /><button onClick={scrollToEvents}>Search</button></div></div>
      <div className="hero-art"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="hero-ticket"><span>SMARTEVENT</span><strong>LIVE<br />EXPERIENCE</strong><small>Book your moment</small></div></div>
    </section>
    <section className="events-section" id="events"><div className="section-heading"><div><span className="eyebrow">Explore events</span><h2>Find your next favorite</h2></div><div className="filter-row">{["", "Music", "Tech", "Sports", "Business"].map((item) => <button key={item} className={category === item ? "filter active" : "filter"} onClick={() => setCategory(item)}>{item || "All"}</button>)}</div></div>{content}</section>
    {user && <section className="cta-strip"><div><span className="eyebrow">Welcome back</span><h2>Ready for another experience?</h2></div><button className="primary-button" onClick={() => navigate("/bookings")}>View my bookings</button></section>}
  </main>;
}

function BookingPage() {
  const { state } = useLocation();
  const event = state?.event;
  const [quantity, setQuantity] = useState(1);
  const [availability, setAvailability] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(null);
  const navigate = useNavigate();

  useEffect(() => { if (!event) return navigate("/"); api.get(`/events/${event.id}/availability`).then((res) => setAvailability(res.data.available_tickets)).catch((err) => setError(err.message)).finally(() => setLoading(false)); }, [event, navigate]);
  const submit = async () => { setError(""); try { const response = await api.post("/bookings", { event_id: event.id, ticket_quantity: quantity }); setConfirmed(response.data); } catch (err) { setError(err.message); } };
  if (loading) return <div className="page-loader">Checking availability...</div>;
  if (!event) return <Navigate to="/" />;
  return <main className="page-shell"><button className="back-link" onClick={() => navigate("/")}>← Back to events</button><div className="booking-layout"><div className="booking-main"><span className="eyebrow">Secure your spot</span><h1>Book your experience</h1><p>{event.title}</p><div className="booking-card"><label>Number of tickets</label><div className="quantity-control"><button onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button><strong>{quantity}</strong><button onClick={() => setQuantity(Math.min(availability, quantity + 1))}>+</button></div><div className="availability"><span className="status-dot" /> {availability} tickets available</div><div className="price-row"><span>Total</span><strong>₹{(event.ticket_price * quantity).toLocaleString("en-IN")}</strong></div>{error && <div className="error-state">{error}</div>}<button className="primary-button wide" onClick={submit} disabled={!availability}>Confirm booking</button></div></div><div className="booking-image"><img src={event.banner_image} alt={event.title} /><div><span>{event.category}</span><h2>{event.title}</h2><p>{event.location}</p></div></div></div>{confirmed && <div className="modal-backdrop" role="dialog"><div className="success-modal"><div className="success-icon">✓</div><span className="eyebrow">Booking confirmed</span><h2>Your ticket is ready!</h2><p>We have sent the details to your notifications.</p><div className="modal-actions"><button className="secondary-button" onClick={() => navigate("/tickets")}>View ticket</button><button className="primary-button" onClick={() => navigate("/")}>Explore more events</button></div></div></div>}</main>;
}

function Bookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.get("/bookings").then((res) => setBookings(res.data)).finally(() => setLoading(false)); }, []);
  return <main className="page-shell"><div className="page-title"><div><span className="eyebrow">Your experience</span><h1>My bookings</h1></div></div>{loading ? <div className="page-loader">Loading bookings...</div> : bookings.length ? <div className="booking-history">{bookings.map((booking) => <article className="history-card" key={booking.id}><div className="history-image"><img src={booking.event.banner_image} alt={booking.event.title} /></div><div><span className={`status ${booking.booking_status.toLowerCase()}`}>{booking.booking_status}</span><h3>{booking.event.title}</h3><p>{booking.event.location} · {booking.ticket_quantity} ticket(s)</p><strong>₹{booking.total_price.toLocaleString("en-IN")}</strong></div><button className="secondary-button" onClick={() => window.location.assign(`/tickets/${booking.ticket.id}`)}>View ticket</button></article>)}</div> : <div className="empty-state"><Ticket size={34} /><h3>No bookings yet</h3><p>Your confirmed events will appear here.</p></div>}</main>;
}

function Tickets({ selectedId = null }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.get("/tickets").then((res) => setTickets(res.data)).finally(() => setLoading(false)); }, []);
  const download = (ticket) => { const link = document.createElement("a"); link.href = ticket.qr_code_url; link.download = `${ticket.ticket_code}.png`; link.click(); };
  const visibleTickets = selectedId ? tickets.filter((ticket) => String(ticket.id) === String(selectedId)) : tickets;
  return <main className="page-shell"><div className="page-title"><div><span className="eyebrow">Digital access</span><h1>{selectedId ? "Ticket details" : "My tickets"}</h1></div></div>{loading ? <div className="page-loader">Loading tickets...</div> : visibleTickets.length ? <div className="ticket-grid">{visibleTickets.map((ticket) => <article className="ticket-card" key={ticket.id}><div className="ticket-top"><span>SMARTEVENT</span><small>{ticket.ticket_code}</small></div><img src={ticket.qr_code_url} alt={`QR code for ${ticket.ticket_code}`} /><div className="ticket-details"><h3>{ticket.booking.event.title}</h3><p>{ticket.booking.event.location}</p><div><span>Date</span><strong>{new Date(ticket.booking.event.event_date).toLocaleDateString("en-IN")}</strong></div><div><span>Quantity</span><strong>{ticket.booking.ticket_quantity}</strong></div></div><button className="primary-button wide" onClick={() => download(ticket)}>Download ticket</button></article>)}</div> : <div className="empty-state"><Ticket size={34} /><h3>No tickets yet</h3><p>Book an event to generate a digital ticket.</p></div>}</main>;
}

function NotificationsPage() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/notifications").then((res) => setItems(res.data)); }, []);
  const mark = async (id) => { await api.patch(`/notifications/${id}/read`); setItems((list) => list.map((item) => item.id === id ? { ...item, is_read: true } : item)); };
  return <main className="page-shell"><div className="page-title"><div><span className="eyebrow">Stay in the loop</span><h1>Notifications</h1></div></div><div className="notification-page-list">{items.length ? items.map((item) => <article className={`notification-page-item ${item.is_read ? "read" : ""}`} key={item.id}><span className="notification-icon">{item.type === "BOOKING" ? "✓" : "•"}</span><div><div><h3>{item.title}</h3><span>{new Date(item.created_at).toLocaleDateString("en-IN")}</span></div><p>{item.message}</p></div>{!item.is_read && <button className="secondary-button small" onClick={() => mark(item.id)}>Mark read</button>}</article>) : <div className="empty-state"><Bell size={34} /><h3>No notifications</h3><p>Booking confirmations will appear here.</p></div>}</div></main>;
}

function AuthPage({ mode }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const submit = async (event) => { event.preventDefault(); try { if (mode === "login") await login(form.email, form.password); else await register(form.username, form.email, form.password); navigate("/"); } catch (err) { setError(err.message); } };
  return <main className="auth-page"><div className="auth-art"><div className="auth-logo"><span>S</span> SmartEvent</div><div><span className="eyebrow">Made for memorable moments</span><h1>One account.<br />Every experience.</h1><p>Join a community discovering inspiring events and securing your place in seconds.</p></div><div className="auth-quote">“The easiest way to turn plans into memories.”</div></div><section className="auth-form-wrap"><div className="auth-form"><span className="eyebrow">{mode === "login" ? "Welcome back" : "Join SmartEvent"}</span><h2>{mode === "login" ? "Sign in to your account" : "Create your account"}</h2><p>{mode === "login" ? "Continue discovering the events you love." : "Start discovering events and booking your next moment."}</p><form onSubmit={submit}>{mode === "register" && <label>Username<input required minLength="3" maxLength="80" pattern="[A-Za-z0-9_-]+" title="Use 3-80 letters, numbers, underscores, or hyphens." value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="Choose a username" /></label>}<label>Email address<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></label><label>Password<input required minLength="8" maxLength="128" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" /></label>{error && <div className="error-state">{error}</div>}<button className="primary-button wide">{mode === "login" ? "Sign in" : "Create account"}</button></form><p className="auth-switch">{mode === "login" ? "New to SmartEvent?" : "Already have an account?"} <button onClick={() => navigate(mode === "login" ? "/register" : "/login")}>{mode === "login" ? "Create an account" : "Sign in"}</button></p></div></section></main>;
}

function Profile() {
  const { user, logout } = useAuth();
  return <main className="page-shell profile-page"><div className="profile-card"><div className="profile-avatar">{user.username[0].toUpperCase()}</div><h1>{user.username}</h1><p>{user.email}</p><button className="primary-button" onClick={logout}>Sign out</button></div></main>;
}
function TicketDetail() {
  const { id } = useParams();
  return <Tickets selectedId={id} />;
}


export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const location = useLocation();

  useEffect(() => { let active = true; const token = localStorage.getItem("smartevent_token"); if (!token) { setLoading(false); return; } api.get("/auth/me").then((res) => active && setUser(res.data)).catch(() => { localStorage.removeItem("smartevent_token"); active && setUser(null); }).finally(() => active && setLoading(false)); return () => { active = false; }; }, []);
  useEffect(() => { if (!user) return; api.get("/notifications").then((res) => setNotifications(res.data)).catch(() => {}); }, [user]);
  const login = async (email, password) => { const res = await api.post("/auth/login", { email, password }); localStorage.setItem("smartevent_token", res.data.access_token); setUser(res.data.user); };
  const register = async (username, email, password) => { const res = await api.post("/auth/register", { username, email, password }); localStorage.setItem("smartevent_token", res.data.access_token); setUser(res.data.user); };
  const logout = () => { localStorage.removeItem("smartevent_token"); setUser(null); };
  const value = { user, loading, login, register, logout, notifications, setNotifications };

  return <AuthContext.Provider value={value}><div className="app"><Navbar />{location.pathname !== "/login" && location.pathname !== "/register" && <div className="mobile-top" />}<Routes><Route path="/" element={<Home />} /><Route path="/login" element={<AuthPage mode="login" />} /><Route path="/register" element={<AuthPage mode="register" />} /><Route path="/events/:id/book" element={<ProtectedRoute><BookingPage /></ProtectedRoute>} /><Route path="/bookings" element={<ProtectedRoute><Bookings /></ProtectedRoute>} /><Route path="/tickets" element={<ProtectedRoute><Tickets /></ProtectedRoute>} /><Route path="/tickets/:id" element={<ProtectedRoute><TicketDetail /></ProtectedRoute>} /><Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} /><Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} /><Route path="*" element={<Navigate to="/" replace />} /></Routes><footer><span className="brand"><span className="brand-mark">S</span> SmartEvent</span><p>Discover. Book. Experience.</p><small>© 2026 SmartEvent</small></footer></div></AuthContext.Provider>;
}
