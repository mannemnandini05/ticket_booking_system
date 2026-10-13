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
  const [location, setLocation] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState("date");
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api.get("/events", { params: { search, category, location, date_from: dateFrom || undefined, date_to: dateTo || undefined, sort } })
      .then((response) => active && setEvents(response.data))
      .catch((reason) => active && setError(reason.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [search, category, location, dateFrom, dateTo, sort, reloadKey]);

  const content = loading
    ? <div className="page-loader">Finding events...</div>
    : error
      ? <div className="error-state">{error}<button className="secondary-button small" onClick={() => setReloadKey((value) => value + 1)}>Retry</button></div>
      : events.length
        ? <div className="event-grid">{events.map((event) => <EventCard key={event.id} event={event} onBook={(item) => navigate(`/events/${item.id}`)} />)}</div>
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
        <div className="discovery-filters" aria-label="Event filters">
          <label>Location<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="City or venue" /></label>
          <label>From<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label>To<input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} /></label>
          <label>Sort by<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="date">Date</option><option value="popularity">Popularity</option><option value="price">Price</option></select></label>
          {(location || dateFrom || dateTo || sort !== "date") && <button className="filter-clear" onClick={() => { setLocation(""); setDateFrom(""); setDateTo(""); setSort("date"); }}>Clear filters</button>}
        </div>
        {content}
      </section>
      {user && <section className="cta-strip"><div><span className="eyebrow">Welcome back</span><h2>Ready for another experience?</h2></div><button className="primary-button" onClick={() => navigate("/bookings")}>View my bookings</button></section>}
    </main>
  );
}
