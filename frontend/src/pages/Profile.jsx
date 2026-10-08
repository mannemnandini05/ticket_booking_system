import { useAuth } from "../context/AuthContext";

export default function Profile() {
  const { user, logout } = useAuth();
  return <main className="page-shell profile-page"><div className="profile-card"><div className="profile-avatar">{user.username[0].toUpperCase()}</div><h1>{user.username}</h1><p>{user.email}</p><p className="profile-role">{user.role}</p><button className="primary-button" onClick={logout}>Sign out</button></div></main>;
}
