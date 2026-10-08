import { CalendarDays } from "lucide-react";

export default function EventCard({ event, onBook }) {
  const date = new Date(event.event_date);
  return (
    <article className="event-card">
      <div className="event-image">
        <img src={event.banner_image || "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80"} alt={event.title} />
        <span className="category-pill">{event.category}</span>
        <span className={`event-state ${event.lifecycle_status.toLowerCase()}`}>{event.lifecycle_status}</span>
      </div>
      <div className="event-body">
        <div className="event-date"><CalendarDays size={15} /> {date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
        <h3>{event.title}</h3>
        <p>{event.description}</p>
        <div className="event-footer">
          <div><small>From</small><strong>₹{event.ticket_price.toLocaleString("en-IN")}</strong></div>
          <button className="primary-button small" disabled={event.event_status !== "ACTIVE" || event.lifecycle_status !== "UPCOMING"} onClick={() => onBook(event)}>
            {event.event_status === "CANCELLED" ? "Cancelled" : event.event_status === "COMPLETED" ? "Completed" : "Book tickets"}
          </button>
        </div>
      </div>
    </article>
  );
}
