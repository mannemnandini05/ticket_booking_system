import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api";
import { useAuth } from "../context/AuthContext";

export default function EventDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const [event, setEvent] = useState(null);
  const [reviews, setReviews] = useState({ reviews: [], average_rating: null, review_count: 0 });
  const [hasAttended, setHasAttended] = useState(false);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [availability, setAvailability] = useState(0);
  const [availabilityError, setAvailabilityError] = useState("");
  const [updates, setUpdates] = useState([]);
  const [updateDraft, setUpdateDraft] = useState("");
  const [importantDraft, setImportantDraft] = useState(false);
  const [updateError, setUpdateError] = useState("");
  const [postingUpdate, setPostingUpdate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const navigate = useNavigate();
  const ownReview = reviews.reviews.find((review) => review.user_id === user?.id);
  const canReview = hasAttended && event && new Date(event.event_date).getTime() <= Date.now();

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
        } else {
          const availabilityResponse = await api.get(`/events/${id}/availability`);
          if (active) setAvailability(availabilityResponse.data.available_tickets);
        }
      })
      .catch((reason) => active && setError(reason.message))
      .finally(() => active && setLoading(false));
    api.get(`/events/${id}/reviews`)
      .then((response) => active && setReviews(response.data))
      .catch((reason) => active && setReviewError(reason.message));
    api.get(`/v2/events/${id}/updates`)
      .then((response) => active && setUpdates(response.data))
      .catch((reason) => active && setUpdateError(reason.message));
    if (user) {
      api.post(`/v2/events/${id}/views`).catch((reason) => active && setError(reason.message));
      api.get("/bookings")
        .then((response) => active && setHasAttended(response.data.some((booking) => booking.event_id === Number(id) && booking.booking_status === "CONFIRMED")))
        .catch((reason) => active && setReviewError(reason.message));
    }
    return () => { active = false; };
  }, [id, user]);

  useEffect(() => {
    let active = true;
    const refreshUpdates = () => {
      api.get(`/v2/events/${id}/updates`)
        .then((response) => {
          if (!active) return;
          setUpdates(response.data);
          setUpdateError("");
        })
        .catch((reason) => active && setUpdateError(reason.message));
    };
    const intervalId = window.setInterval(refreshUpdates, 10000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [id]);

  useEffect(() => {
    if (!event || event.event_status !== "ACTIVE" || event.lifecycle_status !== "UPCOMING") {
      setAvailability(0);
      return undefined;
    }
    let active = true;
    const refreshAvailability = () => {
      api.get(`/events/${id}/availability`)
        .then((response) => {
          if (!active) return;
          setAvailabilityError("");
          setAvailability(response.data.available_tickets);
        })
        .catch((reason) => {
          if (!active) return;
          setAvailability(0);
          setAvailabilityError(reason.message);
        });
    };
    refreshAvailability();
    const intervalId = window.setInterval(refreshAvailability, 5000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [id, event?.event_status, event?.lifecycle_status]);

  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const response = await api.post("/bookings", { event_id: event.id, ticket_quantity: quantity });
      navigate(`/payment/${response.data.id}`, { state: { booking: response.data } });
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSubmitting(false);
    }
  };

  const submitReview = async (submitEvent) => {
    submitEvent.preventDefault();
    setReviewError("");
    setReviewMessage("");
    try {
      if (ownReview) {
        await api.put(`/reviews/${ownReview.id}`, { rating, review_text: reviewText });
      } else {
        await api.post(`/events/${id}/reviews`, { rating, review_text: reviewText });
      }
      const response = await api.get(`/events/${id}/reviews`);
      setReviews(response.data);
      setReviewMessage("Your review has been saved.");
    } catch (reason) {
      setReviewError(reason.message);
    }
  };

  const deleteReview = async () => {
    setReviewError("");
    try {
      await api.delete(`/reviews/${ownReview.id}`);
      setReviews((current) => ({ ...current, reviews: current.reviews.filter((review) => review.id !== ownReview.id), review_count: Math.max(0, current.review_count - 1) }));
      setRating(5);
      setReviewText("");
      setReviewMessage("Your review has been deleted.");
    } catch (reason) {
      setReviewError(reason.message);
    }
  };

  const postUpdate = async (submitEvent) => {
    submitEvent.preventDefault();
    setPostingUpdate(true);
    setUpdateError("");
    try {
      await api.post(`/v2/events/${id}/updates`, { message: updateDraft, important: importantDraft });
      const response = await api.get(`/v2/events/${id}/updates`);
      setUpdates(response.data);
      setUpdateDraft("");
      setImportantDraft(false);
    } catch (reason) {
      setUpdateError(reason.message);
    } finally {
      setPostingUpdate(false);
    }
  };

  useEffect(() => {
    if (ownReview) {
      setRating(ownReview.rating);
      setReviewText(ownReview.review_text);
    }
  }, [ownReview?.id, ownReview?.rating, ownReview?.review_text]);

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
            {user && <div className="quantity-control">
              <button aria-label="Remove one ticket" disabled={quantity <= 1 || submitting} onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button>
              <strong>{quantity}</strong>
              <button aria-label="Add one ticket" disabled={quantity >= availability || submitting} onClick={() => setQuantity((value) => Math.min(availability, value + 1))}>+</button>
            </div>}
            <div className="availability"><span className="status-dot" /> {availability} tickets available</div>
            <small className="live-indicator">Live availability · refreshes every 5 seconds</small>
            {availabilityError && <p className="field-error" role="alert">{availabilityError}</p>}
            {user && <div className="price-row"><span>Total</span><strong>₹{(event.ticket_price * quantity).toLocaleString("en-IN")}</strong></div>}
            {error && <div className="error-state">{error}</div>}
            <button className="primary-button wide" onClick={() => user ? submit() : navigate("/login")} disabled={!availability || event.event_status !== "ACTIVE" || event.lifecycle_status !== "UPCOMING" || submitting}>{user ? (submitting ? "Creating booking..." : "Continue to checkout") : "Sign in to book"}</button>
          </div>
        </div>
        <div className="booking-image"><img src={event.banner_image} alt={event.title} /><div><span>{event.category}</span><h2>{event.title}</h2><p>{event.location}</p></div></div>
      </div>
      <section className="event-live-updates">
        <div className="reviews-heading"><div><span className="eyebrow">Announcements</span><h2>Live updates</h2></div><span className="live-indicator">Latest first</span></div>
        {updateError && <div className="error-state" role="alert">{updateError}</div>}
        {(user?.role === "ADMIN" || (user?.role === "ORGANIZER" && user.id === event.organizer_id)) && <form className="event-update-form" onSubmit={postUpdate}>
          <label htmlFor="event-update-message">Post an announcement</label>
          <textarea id="event-update-message" value={updateDraft} onChange={(input) => setUpdateDraft(input.target.value)} maxLength={2000} required rows={3} />
          <label className="important-update-toggle"><input type="checkbox" checked={importantDraft} onChange={(input) => setImportantDraft(input.target.checked)} /> Mark as important</label>
          <button className="primary-button small" disabled={postingUpdate}>{postingUpdate ? "Posting..." : "Post update"}</button>
        </form>}
        <div className="event-update-list">
          {updates.length ? updates.map((item) => <article className={`event-update-card${item.important ? " important" : ""}`} key={item.id}>
            <strong>{item.important ? "Important announcement" : "Event announcement"}</strong><p>{item.message}</p><small>{new Date(item.created_at).toLocaleString("en-IN")}</small>
          </article>) : <p className="empty-copy">No announcements have been posted for this event.</p>}
        </div>
      </section>
      <section className="event-reviews">
        <div className="reviews-heading"><div><span className="eyebrow">Attendee feedback</span><h2>Reviews {reviews.average_rating !== null && <span>★ {reviews.average_rating}</span>}</h2></div><small>{reviews.review_count} review{reviews.review_count === 1 ? "" : "s"}</small></div>
        {reviewError && <div className="error-state">{reviewError}</div>}
        {canReview && <form className="review-form" onSubmit={submitReview}>
          <label>Your rating</label>
          <div className="star-picker" role="radiogroup" aria-label="Rating from 1 to 5">
            {[1, 2, 3, 4, 5].map((value) => <button type="button" role="radio" aria-checked={rating === value} aria-label={`${value} star${value === 1 ? "" : "s"}`} className={value <= rating ? "selected" : ""} key={value} onClick={() => setRating(value)}>★</button>)}
          </div>
          <label htmlFor="review-text">Share your experience</label>
          <textarea id="review-text" value={reviewText} onChange={(input) => setReviewText(input.target.value)} minLength={1} maxLength={2000} required rows={4} />
          {reviewMessage && <p className="success-message">{reviewMessage}</p>}
          <div className="review-actions"><button className="primary-button small">{ownReview ? "Update review" : "Submit review"}</button>{ownReview && <button type="button" className="secondary-button small" onClick={deleteReview}>Delete review</button>}</div>
        </form>}
        <div className="review-list">
          {reviews.reviews.length ? reviews.reviews.map((review) => <article className="review-item" key={review.id}>
            <div><strong>{review.username}</strong><span className="review-stars" aria-label={`${review.rating} out of 5 stars`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span></div>
            <p>{review.review_text}</p><small>{new Date(review.created_at).toLocaleDateString("en-IN")}</small>
          </article>) : <p className="empty-copy">No attendee reviews yet.</p>}
        </div>
      </section>
    </main>
  );
}
