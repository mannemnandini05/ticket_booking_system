import { Ticket } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";

export default function BookingHistory() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/bookings")
      .then((response) => setBookings(response.data))
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="page-shell">
      <div className="page-title"><div><span className="eyebrow">Your experience</span><h1>My bookings</h1></div></div>
      {loading ? <div className="page-loader">Loading bookings...</div>
        : error ? <div className="error-state">{error}</div>
          : bookings.length ? <div className="booking-history">{bookings.map((booking) => <article className="history-card" key={booking.id}>
            <div className="history-image"><img src={booking.event.banner_image} alt={booking.event.title} /></div>
            <div><span className={`status ${booking.booking_status.toLowerCase()}`}>{booking.booking_status}</span><h3>{booking.event.title}</h3><p>{booking.event.location} · {booking.ticket_quantity} ticket(s)</p><strong>₹{booking.total_price.toLocaleString("en-IN")}</strong></div>
            {booking.ticket && <button className="secondary-button" onClick={() => navigate(`/tickets/${booking.ticket.id}`)}>View ticket</button>}
          </article>)}</div>
            : <div className="empty-state"><Ticket size={34} /><h3>No bookings yet</h3><p>Your confirmed events will appear here.</p></div>}
    </main>
  );
}
