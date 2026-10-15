import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import EventCard from "../components/EventCard";
import api from "../api";

export default function Wishlist() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    api.get("/v2/wishlist")
      .then((response) => active && setItems(response.data))
      .catch((reason) => active && setError(reason.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const remove = async (event) => {
    setError("");
    try {
      await api.delete(`/v2/wishlist/${event.id}`);
      setItems((current) => current.filter((item) => item.event_id !== event.id));
    } catch (reason) {
      setError(reason.message);
    }
  };

  return <main className="page-shell">
    <div className="page-title"><div><span className="eyebrow">Saved for later</span><h1>Your wishlist</h1></div></div>
    {error && <div className="error-state" role="alert">{error}</div>}
    {loading ? <div className="page-loader">Loading your saved events...</div>
      : items.length ? <div className="event-grid">{items.map(({ event }) => <EventCard key={event.id} event={event} isSaved onToggleSave={remove} onBook={(item) => navigate(`/events/${item.id}`)} />)}</div>
        : <div className="empty-state"><h3>No saved events yet</h3><p>Save events you like and come back to them here.</p><button className="primary-button small" onClick={() => navigate("/")}>Explore events</button></div>}
  </main>;
}
