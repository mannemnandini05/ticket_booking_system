import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AuthForm({ mode }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (mode === "login") await login(form.email, form.password);
      else await register(form.username, form.email, form.password);
      navigate("/");
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-art">
        <div className="auth-logo"><span>S</span> SmartEvent</div>
        <div><span className="eyebrow">Made for memorable moments</span><h1>One account.<br />Every experience.</h1><p>Join a community discovering inspiring events and securing your place in seconds.</p></div>
        <div className="auth-quote">“The easiest way to turn plans into memories.”</div>
      </div>
      <section className="auth-form-wrap"><div className="auth-form">
        <span className="eyebrow">{mode === "login" ? "Welcome back" : "Join SmartEvent"}</span>
        <h2>{mode === "login" ? "Sign in to your account" : "Create your account"}</h2>
        <p>{mode === "login" ? "Continue discovering the events you love." : "Start discovering events and booking your next moment."}</p>
        <form onSubmit={submit}>
          {mode === "register" && <label>Username<input required minLength="3" maxLength="80" pattern="[A-Za-z0-9_-]+" title="Use 3-80 letters, numbers, underscores, or hyphens." value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="Choose a username" /></label>}
          <label>Email address<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" /></label>
          <label>Password<input required minLength="8" maxLength="128" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="At least 8 characters" /></label>
          {error && <div className="error-state">{error}</div>}
          <button className="primary-button wide" disabled={submitting}>{submitting ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}</button>
        </form>
        <p className="auth-switch">{mode === "login" ? "New to SmartEvent?" : "Already have an account?"} <button onClick={() => navigate(mode === "login" ? "/register" : "/login")}>{mode === "login" ? "Create an account" : "Sign in"}</button></p>
      </div></section>
    </main>
  );
}
