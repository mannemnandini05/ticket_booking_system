import { ChevronDown, LogOut, Menu, UserRound, X } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import NotificationDropdown from "./NotificationDropdown";
import { useAuth } from "../context/AuthContext";
import "./components.css";

export default function Navbar() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="navbar">
      <div className="nav-inner">
        <NavLink to="/" className="brand"><span className="brand-mark">S</span> SmartEvent</NavLink>
        <nav className={menuOpen ? "nav-links open" : "nav-links"}>
          <NavLink to="/" onClick={closeMenu}>Discover</NavLink>
          {user && <>
            <NavLink to="/bookings" onClick={closeMenu}>My bookings</NavLink>
            <NavLink to="/tickets" onClick={closeMenu}>My tickets</NavLink>
            <NavLink to="/notifications" onClick={closeMenu}>Notifications</NavLink>
          </>}
          {user?.role === "ORGANIZER" && <NavLink to="/organizer" onClick={closeMenu}>Organizer</NavLink>}
          {user?.role === "ADMIN" && <NavLink to="/admin" onClick={closeMenu}>Admin</NavLink>}
        </nav>
        <div className="nav-actions">
          {user && <NotificationDropdown />}
          {user
            ? <div className="profile-menu">
              <button className="profile-button" onClick={() => navigate("/profile")}><UserRound size={18} /><span>{user.username}</span><ChevronDown size={15} /></button>
              <div className="profile-dropdown"><button onClick={logout}><LogOut size={16} /> Sign out</button></div>
            </div>
            : <div className="auth-nav-actions">
              <button className="secondary-button small" onClick={() => navigate("/login")}>Sign in</button>
              <button className="primary-button small" onClick={() => navigate("/register")}>Create account</button>
            </div>}
          <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">{menuOpen ? <X /> : <Menu />}</button>
        </div>
      </div>
    </header>
  );
}
