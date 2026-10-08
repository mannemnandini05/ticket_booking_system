import { Navigate, useLocation, useNavigate } from "react-router-dom";

export default function BookingConfirmationPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const booking = state?.booking;

  if (!booking) return <Navigate to="/tickets" replace />;

  return (
    <main className="page-shell confirmation-page">
      <section className="success-modal" aria-labelledby="booking-confirmation-title">
        <div className="success-icon">✓</div>
        <span className="eyebrow">Booking confirmed</span>
        <h1 id="booking-confirmation-title">Your ticket is ready!</h1>
        <p>Booking #{booking.id} is confirmed for {booking.event.title}.</p>
        <p>{booking.ticket_quantity} ticket(s) · ₹{Number(booking.total_price).toLocaleString("en-IN")}</p>
        <div className="modal-actions">
          <button className="secondary-button" onClick={() => navigate(booking.ticket ? `/tickets/${booking.ticket.id}` : "/tickets")}>View ticket</button>
          <button className="primary-button" onClick={() => navigate("/")}>Explore more events</button>
        </div>
      </section>
    </main>
  );
}
