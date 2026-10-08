import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";
import { ProtectedRoute, RoleRoute } from "./components/ProtectedRoute";
import { AuthProvider, useAuth } from "./context/AuthContext";
import BookingHistory from "./pages/bookingHistory";
import BookingConfirmationPage from "./pages/bookingConfirmation";
import EventDetails from "./pages/eventDetails";
import Home from "./pages/home";
import Login from "./pages/login";
import Notifications from "./pages/notifications";
import Profile from "./pages/Profile";
import Register from "./pages/register";
import Tickets from "./pages/tickets";
import {
  AdminBookings,
  AdminDashboard,
  AdminEvents,
  AdminUsers,
  OrganizerBookings,
  OrganizerDashboard,
  OrganizerEventForm,
  OrganizerEvents,
} from "./pages/management";

function AppRoutes() {
  const { user, authError } = useAuth();
  const location = useLocation();

  return (
    <div className="app">
      <Navbar />
      {authError && <div className="session-error" role="alert">{authError} Refresh the page after the backend is available.</div>}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/events/:id/book" element={<ProtectedRoute><EventDetails /></ProtectedRoute>} />
        <Route path="/booking-confirmation" element={<ProtectedRoute><BookingConfirmationPage /></ProtectedRoute>} />
        <Route path="/bookings" element={<ProtectedRoute><BookingHistory /></ProtectedRoute>} />
        <Route path="/tickets" element={<ProtectedRoute><Tickets /></ProtectedRoute>} />
        <Route path="/tickets/:id" element={<ProtectedRoute><Tickets /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/organizer" element={<RoleRoute roles={["ORGANIZER"]}><OrganizerDashboard /></RoleRoute>} />
        <Route path="/organizer/events" element={<RoleRoute roles={["ORGANIZER"]}><OrganizerEvents /></RoleRoute>} />
        <Route path="/organizer/events/new" element={<RoleRoute roles={["ORGANIZER"]}><OrganizerEventForm /></RoleRoute>} />
        <Route path="/organizer/events/:eventId/edit" element={<RoleRoute roles={["ORGANIZER"]}><OrganizerEventForm /></RoleRoute>} />
        <Route path="/organizer/events/:eventId/bookings" element={<RoleRoute roles={["ORGANIZER"]}><OrganizerBookings /></RoleRoute>} />
        <Route path="/admin" element={<RoleRoute roles={["ADMIN"]}><AdminDashboard /></RoleRoute>} />
        <Route path="/admin/users" element={<RoleRoute roles={["ADMIN"]}><AdminUsers currentUser={user} /></RoleRoute>} />
        <Route path="/admin/events" element={<RoleRoute roles={["ADMIN"]}><AdminEvents /></RoleRoute>} />
        <Route path="/admin/bookings" element={<RoleRoute roles={["ADMIN"]}><AdminBookings /></RoleRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {location.pathname !== "/login" && location.pathname !== "/register" && <div className="mobile-top" />}
      <footer><span className="brand"><span className="brand-mark">S</span> SmartEvent</span><p>Discover. Book. Experience.</p><small>© 2026 SmartEvent</small></footer>
    </div>
  );
}

export default function App() {
  return <AuthProvider><AppRoutes /></AuthProvider>;
}
