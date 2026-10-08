export default function TicketCard({ ticket }) {
  const download = () => {
    const link = document.createElement("a");
    link.href = ticket.qr_code_url;
    link.download = `${ticket.ticket_code}.png`;
    link.click();
  };

  return (
    <article className="ticket-card">
      <div className="ticket-top"><span>SMARTEVENT</span><small>{ticket.ticket_code}</small></div>
      <img src={ticket.qr_code_url} alt={`QR code for ${ticket.ticket_code}`} />
      <div className="ticket-details">
        <h3>{ticket.booking.event.title}</h3>
        <p>{ticket.booking.event.location}</p>
        <div><span>Date</span><strong>{new Date(ticket.booking.event.event_date).toLocaleDateString("en-IN")}</strong></div>
        <div><span>Quantity</span><strong>{ticket.booking.ticket_quantity}</strong></div>
      </div>
      <button className="primary-button wide" onClick={download}>Download ticket</button>
    </article>
  );
}
