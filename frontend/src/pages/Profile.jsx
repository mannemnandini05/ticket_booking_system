import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../api";

export default function Profile() {
  const { user, setUser, logout } = useAuth();
  const [username, setUsername] = useState(user.username);
  const [pictureUrl, setPictureUrl] = useState(user.profile_picture_url || "");
  const [activity, setActivity] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    api.get("/v2/profile/activity")
      .then((response) => active && setActivity(response.data))
      .catch((reason) => active && setError(reason.message));
    return () => { active = false; };
  }, []);

  const saveProfile = async (submitEvent) => {
    submitEvent.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await api.put("/v2/profile", {
        username,
        profile_picture_url: pictureUrl.trim() || null,
      });
      setUser(response.data);
      setMessage("Your profile was updated.");
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  };

  const uploadPicture = async (event) => {
    const image = event.target.files?.[0];
    if (!image) return;
    setError("");
    setMessage("");
    const formData = new FormData();
    formData.append("image", image);
    try {
      const response = await api.post("/v2/profile/picture", formData);
      setUser(response.data);
      setPictureUrl(response.data.profile_picture_url || "");
      setMessage("Your profile picture was uploaded.");
    } catch (reason) {
      setError(reason.message);
    } finally {
      event.target.value = "";
    }
  };

  return <main className="page-shell profile-page">
    <div className="page-title"><div><span className="eyebrow">Account settings</span><h1>Your profile</h1></div></div>
    <div className="profile-layout">
      <div className="profile-card">
        {pictureUrl ? <img className="profile-avatar profile-picture" src={pictureUrl} alt="" /> : <div className="profile-avatar">{user.username[0].toUpperCase()}</div>}
        <h2>{user.username}</h2><p>{user.email}</p><p className="profile-role">{user.role}</p>
        <button className="secondary-button" onClick={logout}>Sign out</button>
      </div>
      <div className="profile-edit-card">
        <h2>Edit profile</h2>
        <form className="profile-form" onSubmit={saveProfile}>
          <label htmlFor="profile-username">Display name<input id="profile-username" value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={80} required /></label>
          <label htmlFor="profile-picture-url">Profile picture URL (optional)<input id="profile-picture-url" type="url" value={pictureUrl} onChange={(event) => setPictureUrl(event.target.value)} placeholder="https://..." /></label>
          <label htmlFor="profile-picture-upload">Or upload a PNG, JPEG, or WebP image (max 2 MB)<input id="profile-picture-upload" type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadPicture} /></label>
          {error && <p className="field-error" role="alert">{error}</p>}
          {message && <p className="success-message" role="status">{message}</p>}
          <button className="primary-button small" disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>
        </form>
        <h2 className="activity-heading">Your activity</h2>
        {activity ? <div className="profile-activity">
          <div><strong>{activity.upcoming_bookings}</strong><span>Upcoming bookings</span></div>
          <div><strong>{activity.past_bookings}</strong><span>Past events</span></div>
          <div><strong>{activity.events_viewed}</strong><span>Events viewed</span></div>
          <div><strong>{activity.saved_events}</strong><span>Saved events</span></div>
          <div><strong>₹{Number(activity.total_spent).toLocaleString("en-IN")}</strong><span>Total spent</span></div>
        </div> : <p className="empty-copy">Loading your activity summary...</p>}
      </div>
    </div>
  </main>;
}
