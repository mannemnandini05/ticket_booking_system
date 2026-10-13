import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function PaymentCheckout() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [couponCode, setCouponCode] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CARD");
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    api.get(`/bookings/${bookingId}`)
      .then((response) => active && setBooking(response.data))
      .catch((reason) => active && setError(reason.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [bookingId]);

  const applyCoupon = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const response = await api.post(`/bookings/${bookingId}/coupon`, { coupon_code: couponCode });
      setBooking(response.data);
      setMessage("Coupon applied successfully.");
    } catch (reason) {
      setError(reason.message);
    }
  };

  const removeCoupon = async () => {
    setError("");
    setMessage("");
    try {
      const response = await api.delete(`/bookings/${bookingId}/coupon`);
      setBooking(response.data);
      setCouponCode("");
    } catch (reason) {
      setError(reason.message);
    }
  };

  const pay = async () => {
    setSubmitting(true);
    setError("");
    try {
      const response = await api.post("/payments", {
        booking_id: booking.id,
        payment_method: paymentMethod,
        simulate_failure: simulateFailure,
      });
      navigate("/payment-confirmation", { state: { payment: response.data, booking } });
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <main className="page-shell"><div className="page-loader">Preparing secure checkout...</div></main>;
  if (!booking) return <main className="page-shell"><div className="error-state">{error || "Booking not found."}</div><button className="secondary-button" onClick={() => navigate("/bookings")}>My bookings</button></main>;

  return (
    <main className="page-shell">
      <div className="page-title"><div><span className="eyebrow">Secure simulated checkout</span><h1>Complete payment</h1></div></div>
      <div className="checkout-layout">
        <section className="checkout-card">
          <span className="eyebrow">Booking #{booking.id}</span>
          <h2>{booking.event.title}</h2>
          <p>{booking.event.location} · {new Date(booking.event.event_date).toLocaleString("en-IN")}</p>
          <div className="checkout-price-row"><span>{booking.ticket_quantity} ticket(s)</span><strong>{money(booking.total_price)}</strong></div>
          {booking.discount_amount > 0 && <div className="checkout-price-row discount"><span>Coupon discount</span><strong>−{money(booking.discount_amount)}</strong></div>}
          <div className="checkout-price-row total"><span>Amount to pay</span><strong>{money(booking.final_amount)}</strong></div>
          <form className="coupon-form" onSubmit={applyCoupon}>
            <label htmlFor="coupon-code">Have a coupon?</label>
            <div><input id="coupon-code" value={couponCode} onChange={(event) => setCouponCode(event.target.value)} placeholder="Enter code" maxLength={40} disabled={booking.booking_status !== "PENDING_PAYMENT"} /><button className="secondary-button" disabled={!couponCode.trim() || submitting || booking.booking_status !== "PENDING_PAYMENT"}>Apply</button></div>
            {booking.coupon_id && booking.booking_status === "PENDING_PAYMENT" && <button type="button" className="coupon-remove" onClick={removeCoupon}>Remove coupon</button>}
          </form>
          {message && <p className="success-message" role="status">{message}</p>}
          {error && <div className="error-state" role="alert">{error}</div>}
        </section>
        <section className="checkout-card payment-card">
          <h2>Payment method</h2>
          <label htmlFor="payment-method">Choose a payment method</label>
          <select id="payment-method" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} disabled={booking.booking_status === "CONFIRMED"}>
            <option value="CARD">Credit or debit card</option>
            <option value="UPI">UPI</option>
            <option value="NET_BANKING">Net banking</option>
          </select>
          <p className="checkout-note">This demo uses a simulated payment processor. No real payment details are collected.</p>
          {import.meta.env.DEV && booking.booking_status !== "CONFIRMED" && <label className="test-failure-toggle"><input type="checkbox" checked={simulateFailure} onChange={(event) => setSimulateFailure(event.target.checked)} /> Simulate a declined payment (testing)</label>}
          {booking.booking_status === "CONFIRMED"
            ? <button className="primary-button wide" onClick={() => navigate("/tickets")}>View my ticket</button>
            : <button className="primary-button wide" onClick={pay} disabled={submitting || booking.booking_status === "EXPIRED"}>{submitting ? "Processing payment..." : `Pay ${money(booking.final_amount)}`}</button>}
          <button className="back-link" onClick={() => navigate("/bookings")}>Return to my bookings</button>
        </section>
      </div>
    </main>
  );
}
