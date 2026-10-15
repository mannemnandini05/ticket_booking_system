import { Bot, MessageCircle, Send, X } from "lucide-react";
import { useState } from "react";
import api from "../api";
import { useAuth } from "../context/AuthContext";

export default function ChatAssistant() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! I can help you discover events or find your booking information." },
  ]);
  const [sending, setSending] = useState(false);
  const quickSuggestions = [
    "Trending events",
    "Find events near me",
    user ? "Show my bookings" : "How do I book tickets?",
  ];

  const send = async (text = draft) => {
    const message = text.trim();
    if (!message || sending) return;
    setDraft("");
    setMessages((current) => [...current, { role: "user", content: message }]);
    setSending(true);
    try {
      if (message.toLowerCase() === "trending events") {
        const response = await api.get("/v2/trending");
        const reply = response.data.length
          ? `Trending events: ${response.data.map((event) => `${event.title} (${event.location})`).join("; ")}`
          : "There are no trending upcoming events right now.";
        setMessages((current) => [...current, { role: "assistant", content: reply }]);
      } else {
        const response = await api.post("/v2/chat", { message });
        const eventList = response.data.events?.length
          ? ` ${response.data.events.map((event) => `${event.title} — ${event.location}, ${new Date(event.event_date).toLocaleDateString("en-IN")}`).join("; ")}`
          : "";
        setMessages((current) => [...current, { role: "assistant", content: `${response.data.reply}${eventList}` }]);
      }
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", content: error.message }]);
    } finally {
      setSending(false);
    }
  };

  return <div className="chat-assistant">
    {open && <section className="chat-panel" aria-label="SmartEvent assistant">
      <header className="chat-header"><span><Bot size={19} /> Event assistant</span><button type="button" aria-label="Close chat" onClick={() => setOpen(false)}><X size={19} /></button></header>
      <div className="chat-messages" aria-live="polite">
        {messages.map((message, index) => <p className={`chat-message ${message.role}`} key={`${index}-${message.role}`}>{message.content}</p>)}
        {sending && <p className="chat-message assistant">Thinking…</p>}
      </div>
      <div className="chat-suggestions">{quickSuggestions.map((suggestion) => <button type="button" key={suggestion} disabled={sending} onClick={() => send(suggestion)}>{suggestion}</button>)}</div>
      <form className="chat-compose" onSubmit={(event) => { event.preventDefault(); send(); }}>
        <input aria-label="Ask the event assistant" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder="Ask about events or bookings..." />
        <button type="submit" aria-label="Send message" disabled={sending || !draft.trim()}><Send size={17} /></button>
      </form>
    </section>}
    <button type="button" className="chat-launcher" aria-label={open ? "Close event assistant" : "Open event assistant"} onClick={() => setOpen((value) => !value)}>
      {open ? <X size={23} /> : <MessageCircle size={23} />}
    </button>
  </div>;
}
