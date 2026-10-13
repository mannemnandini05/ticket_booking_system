import { Navigate, useLocation, useNavigate } from "react-router-dom";

export default function PaymentConfirmation() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const payment = state?.payment;
  const booking = state?.booking;

  if (!payment || !booking) return <Navigate to="/bookings" replace />;

  const succeeded = payment.payment_status === "SUCCESS";
  return (
    <main className="page-shell confirmation-page">
      <section className={`success-modal payment-result ${succeeded ? "" : "payment-failed"}`}>
        <div className="success-icon">{succeeded ? "✓" : "!"}</div>
        <span className="eyebrow">{succeeded ? "Payment successful" : "Payment unsuccessful"}</span>
        <h1>{succeeded ? "You're all set." : "Your payment didn't go through."}</h1>
        <p>{succeeded ? `Your booking for ${booking.event.title} is confirmed.` : `Booking #${booking.id} has not been confirmed. You can retry the payment.`}</p>
        <p>{booking.ticket_quantity} ticket(s) · ₹{Number(payment.amount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p>
        {payment.transaction_id && <small>Transaction reference: {payment.transaction_id}</small>}
        <div className="modal-actions">
          {succeeded
            ? <button className="secondary-button" onClick={() => navigate("/tickets")}>View my tickets</button>
            : <button className="secondary-button" onClick={() => navigate(`/payment/${booking.id}`)}>Retry payment</button>}
          <button className="primary-button" onClick={() => navigate("/")}>Explore events</button>
        </div>
      </section>
    </main>
  );
}
