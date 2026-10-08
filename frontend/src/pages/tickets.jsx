import { Ticket } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api";
import TicketCard from "../components/TicketCard";

export default function Tickets() {
  const { id } = useParams();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/tickets")
      .then((response) => setTickets(response.data))
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  const visibleTickets = id ? tickets.filter((ticket) => String(ticket.id) === String(id)) : tickets;
  return (
    <main className="page-shell">
      <div className="page-title"><div><span className="eyebrow">Digital access</span><h1>{id ? "Ticket details" : "My tickets"}</h1></div></div>
      {loading ? <div className="page-loader">Loading tickets...</div>
        : error ? <div className="error-state">{error}</div>
          : visibleTickets.length ? <div className="ticket-grid">{visibleTickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)}</div>
            : id ? <div className="empty-state"><Ticket size={34} /><h3>Ticket not found</h3><button className="secondary-button" onClick={() => navigate("/tickets")}>View all tickets</button></div>
              : <div className="empty-state"><Ticket size={34} /><h3>No tickets yet</h3><p>Book an event to generate a digital ticket.</p></div>}
    </main>
  );
}
