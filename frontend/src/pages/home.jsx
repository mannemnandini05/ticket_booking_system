import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import EventCard from "../components/EventCard";
import { useAuth } from "../context/AuthContext";
import api from "../api";

export default function Home() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api.get("/events", { params: { search, category } })
      .then((response) => active && setEvents(response.data))
      .catch((reason) => active && setError(reason.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [search, category, reloadKey]);

  const content = loading
    ? <div className="page-loader">Finding events...</div>
    : error
      ? <div className="error-state">{error}<button className="secondary-button small" onClick={() => setReloadKey((value) => value + 1)}>Retry</button></div>
      : events.length
        ? <div className="event-grid">{events.map((event) => <EventCard key={event.id} event={event} onBook={(item) => navigate(`/events/${item.id}/book`, { state: { event: item } })} />)}</div>
        : <div className="empty-state"><Search size={34} /><h3>No events found</h3><p>Try another search or category.</p></div>;

  return (
    <main>
      <section className="hero">
        <div className="hero-glow" />
        <div className="hero-content">
          <span className="eyebrow">Your next unforgettable day starts here</span>
          <h1>Discover the moments<br /><em>that move you.</em></h1>
          <p>Explore handpicked events, secure your place in seconds, and carry every ticket in your pocket.</p>
          <div className="hero-search">
            <Search size={19} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search events, artists or places..." />
            <button onClick={() => document.getElementById("events")?.scrollIntoView({ behavior: "smooth" })}>Search</button>
          </div>
        </div>
        <div className="hero-art"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="hero-ticket"><span>SMARTEVENT</span><strong>LIVE<br />EXPERIENCE</strong><small>Book your moment</small></div></div>
      </section>
      <section className="events-section" id="events">
        <div className="section-heading">
          <div><span className="eyebrow">Explore events</span><h2>Find your next favorite</h2></div>
          <div className="filter-row">{["", "Music", "Tech", "Sports", "Business"].map((item) => <button key={item || "all"} className={category === item ? "filter active" : "filter"} onClick={() => setCategory(item)}>{item || "All"}</button>)}</div>
        </div>
        {content}
      </section>
      {user && <section className="cta-strip"><div><span className="eyebrow">Welcome back</span><h2>Ready for another experience?</h2></div><button className="primary-button" onClick={() => navigate("/bookings")}>View my bookings</button></section>}
    </main>
  );
}
