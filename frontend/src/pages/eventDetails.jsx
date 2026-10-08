import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api";

export default function EventDetails() {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [availability, setAvailability] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api.get(`/events/${id}`)
      .then(async (eventResponse) => {
        if (!active) return;
        setEvent(eventResponse.data);
        if (eventResponse.data.event_status !== "ACTIVE" || eventResponse.data.lifecycle_status !== "UPCOMING") {
          setAvailability(0);
          return;
        }
        const availabilityResponse = await api.get(`/events/${id}/availability`);
        if (active) setAvailability(availabilityResponse.data.available_tickets);
      })
      .catch((reason) => active && setError(reason.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const response = await api.post("/bookings", { event_id: event.id, ticket_quantity: quantity });
      navigate("/booking-confirmation", { state: { booking: response.data } });
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="page-loader">Checking availability...</div>;
  if (!event) return <main className="page-shell"><div className="error-state">{error || "Event not found."}</div><button className="secondary-button" onClick={() => navigate("/")}>Back to events</button></main>;

  return (
    <main className="page-shell">
      <button className="back-link" onClick={() => navigate("/")}>← Back to events</button>
      <div className="booking-layout">
        <div className="booking-main">
          <span className="eyebrow">{event.lifecycle_status}</span>
          <h1>Book your experience</h1>
          <p>{event.title}</p>
          {(event.event_status !== "ACTIVE" || event.lifecycle_status !== "UPCOMING") && <div className="error-state">This event is {event.lifecycle_status.toLowerCase()} and is not accepting bookings.</div>}
          <div className="booking-card">
            <label>Number of tickets</label>
            <div className="quantity-control">
              <button aria-label="Remove one ticket" disabled={quantity <= 1 || submitting} onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button>
              <strong>{quantity}</strong>
              <button aria-label="Add one ticket" disabled={quantity >= availability || submitting} onClick={() => setQuantity((value) => Math.min(availability, value + 1))}>+</button>
            </div>
            <div className="availability"><span className="status-dot" /> {availability} tickets available</div>
            <div className="price-row"><span>Total</span><strong>₹{(event.ticket_price * quantity).toLocaleString("en-IN")}</strong></div>
            {error && <div className="error-state">{error}</div>}
            <button className="primary-button wide" onClick={submit} disabled={!availability || event.event_status !== "ACTIVE" || event.lifecycle_status !== "UPCOMING" || submitting}>{submitting ? "Confirming booking..." : "Confirm booking"}</button>
          </div>
        </div>
        <div className="booking-image"><img src={event.banner_image} alt={event.title} /><div><span>{event.category}</span><h2>{event.title}</h2><p>{event.location}</p></div></div>
      </div>
    </main>
  );
}
