import { useEffect, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import api from "../api";
import "./management.css";

function PageError({ message }) {
  return message ? <div className="error-state">{message}</div> : null;
}

function MetricCards({ items }) {
  return <div className="metric-grid">{items.map(([label, value]) => <article className="metric-card" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>;
}

function BarList({ title, rows, valueKey, labelKey }) {
  const maximum = Math.max(...rows.map((row) => Number(row[valueKey]) || 0), 1);
  return <section className="management-card"><h2>{title}</h2>{rows.length ? <div className="bar-list">{rows.map((row) => <div className="bar-row" key={`${row[labelKey]}`}><span title={row[labelKey]}>{row[labelKey]}</span><div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(3, (Number(row[valueKey]) / maximum) * 100)}%` }} /></div><strong>{Number(row[valueKey]).toLocaleString("en-IN")}</strong></div>)}</div> : <p className="empty-copy">No data for this period yet.</p>}</section>;
}

export function AdminDashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api.get("/admin/analytics", { params: { date_from: from || undefined, date_to: to || undefined } })
      .then((response) => active && setAnalytics(response.data))
      .catch((reason) => active && setError(reason.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [from, to]);

  return <main className="page-shell management-page"><div className="page-title"><div><span className="eyebrow">Platform overview</span><h1>Admin dashboard</h1></div><div className="date-filter"><label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></div></div>
    <ManagementNav role="admin" />
    <PageError message={error} />
    {loading ? <div className="page-loader">Loading platform analytics...</div> : analytics && <>
      <MetricCards items={[
        ["Registered users", analytics.total_users],
        ["Events created", analytics.total_events],
        ["Tickets sold", analytics.total_tickets_sold],
        ["Bookings", analytics.total_bookings],
        ["Platform revenue", `₹${Number(analytics.total_revenue).toLocaleString("en-IN")}`],
      ]} />
      <div className="management-columns">
        <BarList title="Daily ticket sales" rows={analytics.daily_ticket_sales} valueKey="tickets_sold" labelKey="date" />
        <BarList title="Monthly booking trends" rows={analytics.monthly_booking_trends} valueKey="bookings" labelKey="month" />
        <BarList title="Most popular events" rows={analytics.popular_events} valueKey="tickets_sold" labelKey="title" />
        <BarList title="Top revenue events (₹)" rows={analytics.top_revenue_events} valueKey="revenue" labelKey="title" />
      </div>
    </>}
  </main>;
}

function ManagementNav({ role }) {
  const links = role === "admin"
    ? [["/admin", "Analytics"], ["/admin/users", "Users"], ["/admin/events", "Events"], ["/admin/bookings", "Bookings"]]
    : [["/organizer", "Overview"], ["/organizer/events", "Manage events"], ["/organizer/events/new", "Create event"]];
  return <nav className="management-nav">{links.map(([to, label]) => <NavLink key={to} end={to === "/admin" || to === "/organizer"} to={to}>{label}</NavLink>)}</nav>;
}

export function AdminUsers({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = () => api.get("/admin/users").then((response) => setUsers(response.data)).catch((reason) => setError(reason.message)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);
  const changeRole = async (target, role) => {
    setError("");
    setNotice("");
    try {
      const response = await api.patch(`/admin/users/${target.id}/role`, { role });
      setUsers((current) => current.map((item) => item.id === target.id ? response.data : item));
      setNotice(`${target.username}'s role was updated. They must sign in again for the new permissions to take effect.`);
    } catch (reason) {
      setError(reason.message);
    }
  };

  return <main className="page-shell management-page"><div className="page-title"><div><span className="eyebrow">Access control</span><h1>Users overview</h1></div></div><ManagementNav role="admin" /><PageError message={error} />{notice && <p className="success-notice">{notice}</p>}
    {loading ? <div className="page-loader">Loading users...</div> : <div className="management-card table-wrap"><table><thead><tr><th>User</th><th>Email</th><th>Joined</th><th>Role</th></tr></thead><tbody>{users.map((item) => <tr key={item.id}><td>{item.username}</td><td>{item.email}</td><td>{new Date(item.created_at).toLocaleDateString("en-IN")}</td><td><select aria-label={`Role for ${item.username}`} value={item.role} disabled={item.id === currentUser?.id} onChange={(event) => changeRole(item, event.target.value)}><option>USER</option><option>ORGANIZER</option><option>ADMIN</option></select></td></tr>)}</tbody></table>{!users.length && <p className="empty-copy">No users found.</p>}</div>}
  </main>;
}

export function AdminEvents() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { api.get("/admin/events").then((response) => setEvents(response.data)).catch((reason) => setError(reason.message)).finally(() => setLoading(false)); }, []);
  return <main className="page-shell management-page"><div className="page-title"><div><span className="eyebrow">Platform inventory</span><h1>Events overview</h1></div></div><ManagementNav role="admin" /><PageError message={error} />{loading ? <div className="page-loader">Loading events...</div> : <div className="management-card table-wrap"><table><thead><tr><th>Event</th><th>Organizer ID</th><th>Date</th><th>Status</th><th>Capacity</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{event.title}</td><td>{event.organizer_id ?? "System"}</td><td>{new Date(event.event_date).toLocaleString("en-IN")}</td><td>{event.lifecycle_status}</td><td>{event.ticket_capacity}</td></tr>)}</tbody></table>{!events.length && <p className="empty-copy">No events found.</p>}</div>}</main>;
}

export function AdminBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { api.get("/admin/bookings").then((response) => setBookings(response.data)).catch((reason) => setError(reason.message)).finally(() => setLoading(false)); }, []);
  return <main className="page-shell management-page"><div className="page-title"><div><span className="eyebrow">Platform activity</span><h1>Booking overview</h1></div></div><ManagementNav role="admin" /><PageError message={error} />{loading ? <div className="page-loader">Loading bookings...</div> : <div className="management-card table-wrap"><table><thead><tr><th>Event</th><th>Attendee</th><th>Tickets</th><th>Total</th><th>Status</th><th>Booked</th></tr></thead><tbody>{bookings.map((booking) => <tr key={booking.id}><td>{booking.event.title}</td><td>{booking.user.username} · {booking.user.email}</td><td>{booking.ticket_quantity}</td><td>₹{Number(booking.total_price).toLocaleString("en-IN")}</td><td>{booking.booking_status}</td><td>{new Date(booking.created_at).toLocaleDateString("en-IN")}</td></tr>)}</tbody></table>{!bookings.length && <p className="empty-copy">No bookings found.</p>}</div>}</main>;
}

export function OrganizerDashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { api.get("/organizer/analytics").then((response) => setAnalytics(response.data)).catch((reason) => setError(reason.message)).finally(() => setLoading(false)); }, []);
  return <main className="page-shell management-page"><div className="page-title"><div><span className="eyebrow">Organizer overview</span><h1>Event performance</h1></div></div><ManagementNav role="organizer" /><PageError message={error} />
    {loading ? <div className="page-loader">Loading event performance...</div> : analytics && <>
      <MetricCards items={[
        ["Your events", analytics.total_events],
        ["Tickets sold", analytics.total_tickets_sold],
        ["Tickets remaining", analytics.total_tickets_remaining],
        ["Bookings", analytics.total_bookings],
        ["Revenue", `₹${Number(analytics.total_revenue).toLocaleString("en-IN")}`],
      ]} />
      <BarList title="Tickets sold by event" rows={analytics.events} valueKey="tickets_sold" labelKey="title" />
      <div className="management-card table-wrap"><h2>Event performance</h2><table><thead><tr><th>Event</th><th>Status</th><th>Tickets sold</th><th>Remaining</th><th>Bookings</th><th>Revenue</th></tr></thead><tbody>{analytics.events.map((event) => <tr key={event.event_id}><td>{event.title}</td><td>{event.lifecycle_status}</td><td>{event.tickets_sold}</td><td>{event.tickets_remaining}</td><td>{event.booking_count}</td><td>₹{Number(event.revenue).toLocaleString("en-IN")}</td></tr>)}</tbody></table></div>
    </>}
  </main>;
}

export function OrganizerEvents() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const load = () => api.get("/organizer/events").then((response) => setEvents(response.data)).catch((reason) => setError(reason.message)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);
  const cancel = async (event) => {
    setError("");
    if (!window.confirm(`Cancel "${event.title}"? Attendees will be notified.`)) return;
    try {
      const response = await api.patch(`/events/${event.id}/cancel`);
      setEvents((current) => current.map((item) => item.id === event.id ? response.data : item));
    } catch (reason) {
      setError(reason.message);
    }
  };

  return <main className="page-shell management-page"><div className="page-title"><div><span className="eyebrow">Your events</span><h1>Manage events</h1></div><button className="primary-button" onClick={() => navigate("/organizer/events/new")}>Create event</button></div><ManagementNav role="organizer" /><PageError message={error} />
    {loading ? <div className="page-loader">Loading your events...</div> : <div className="management-card table-wrap"><table><thead><tr><th>Event</th><th>Date</th><th>Status</th><th>Capacity</th><th>Actions</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{event.title}</td><td>{new Date(event.event_date).toLocaleString("en-IN")}</td><td>{event.lifecycle_status}</td><td>{event.ticket_capacity}</td><td className="table-actions"><button className="secondary-button small" onClick={() => navigate(`/organizer/events/${event.id}/edit`)}>Edit</button><button className="secondary-button small" onClick={() => navigate(`/organizer/events/${event.id}/bookings`)}>Bookings</button>{event.event_status === "ACTIVE" && <button className="danger-button" onClick={() => cancel(event)}>Cancel</button>}</td></tr>)}</tbody></table>{!events.length && !error && <p className="empty-copy">You have not created any events yet.</p>}</div>}
  </main>;
}

const emptyEvent = {
  title: "",
  description: "",
  category: "Music",
  location: "",
  event_date: "",
  ticket_price: "",
  ticket_capacity: "100",
  banner_image: "",
};

export function OrganizerEventForm() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyEvent);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(eventId));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    api.get(`/events/${eventId}`)
      .then((response) => setForm({
        ...response.data,
        event_date: new Date(response.data.event_date).toISOString().slice(0, 16),
        ticket_price: String(response.data.ticket_price),
        ticket_capacity: String(response.data.ticket_capacity),
        banner_image: response.data.banner_image || "",
      }))
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [eventId]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const payload = {
      ...form,
      event_date: new Date(form.event_date).toISOString(),
      ticket_price: Number(form.ticket_price),
      ticket_capacity: Number(form.ticket_capacity),
      banner_image: form.banner_image || null,
    };
    try {
      if (eventId) await api.patch(`/events/${eventId}`, payload);
      else await api.post("/events", payload);
      navigate("/organizer/events");
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="page-loader">Loading event...</div>;
  return <main className="page-shell management-page"><div className="page-title"><div><span className="eyebrow">Organizer workspace</span><h1>{eventId ? "Edit event" : "Create event"}</h1></div></div><ManagementNav role="organizer" /><PageError message={error} />
    <form className="management-card event-form" onSubmit={submit}>
      <label>Event title<input required minLength="2" maxLength="160" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
      <label>Description<textarea required minLength="10" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
      <div className="form-columns"><label>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option>Music</option><option>Tech</option><option>Sports</option><option>Business</option></select></label><label>Location<input required minLength="2" maxLength="160" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></label></div>
      <div className="form-columns"><label>Date and time<input required type="datetime-local" value={form.event_date} onChange={(event) => setForm({ ...form, event_date: event.target.value })} /></label><label>Ticket price (₹)<input required type="number" min="0" step="0.01" value={form.ticket_price} onChange={(event) => setForm({ ...form, ticket_price: event.target.value })} /></label></div>
      <div className="form-columns"><label>Ticket capacity<input required type="number" min="1" step="1" value={form.ticket_capacity} onChange={(event) => setForm({ ...form, ticket_capacity: event.target.value })} /></label><label>Banner image URL<input type="url" value={form.banner_image} onChange={(event) => setForm({ ...form, banner_image: event.target.value })} /></label></div>
      <button className="primary-button" disabled={submitting}>{submitting ? "Saving..." : eventId ? "Save changes" : "Publish event"}</button>
    </form>
  </main>;
}

export function OrganizerBookings() {
  const { eventId } = useParams();
  const [bookings, setBookings] = useState([]);
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api.get(`/organizer/events/${eventId}/bookings`), api.get(`/events/${eventId}`)])
      .then(([bookingResponse, eventResponse]) => {
        setBookings(bookingResponse.data);
        setEvent(eventResponse.data);
      })
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [eventId]);
  return <main className="page-shell management-page"><div className="page-title"><div><span className="eyebrow">Sales activity</span><h1>{event ? `${event.title} bookings` : "Event bookings"}</h1></div></div><ManagementNav role="organizer" /><PageError message={error} />
    {loading ? <div className="page-loader">Loading event bookings...</div> : <div className="management-card table-wrap"><table><thead><tr><th>Booking</th><th>Tickets</th><th>Total</th><th>Status</th><th>Booked</th></tr></thead><tbody>{bookings.map((booking) => <tr key={booking.id}><td>#{booking.id}</td><td>{booking.ticket_quantity}</td><td>₹{Number(booking.total_price).toLocaleString("en-IN")}</td><td>{booking.booking_status}</td><td>{new Date(booking.created_at).toLocaleString("en-IN")}</td></tr>)}</tbody></table>{!bookings.length && !error && <p className="empty-copy">No bookings for this event yet.</p>}</div>}
  </main>;
}
