import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { LoadingState, ErrorState } from "../components/Common";

export default function Profile() {
  const { user, setUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [saveNote, setSaveNote] = useState("");

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwNote, setPwNote] = useState("");

  async function load() {
    try {
      const data = await api.getProfile();
      setProfile(data);
      setName(data.user.name);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSaveName(e) {
    e.preventDefault();
    setSaveNote("");
    try {
      await api.updateProfile({ name });
      setUser({ ...user, name });
      setSaveNote("Saved.");
      await load();
    } catch (e) {
      setSaveNote(e.message);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setPwError("");
    setPwNote("");
    try {
      await api.changePassword({ currentPassword: curPw, newPassword: newPw });
      setPwNote("Password updated.");
      setCurPw("");
      setNewPw("");
    } catch (e) {
      setPwError(e.message);
    }
  }

  if (error) return <div className="page"><ErrorState message={error} onRetry={load} /></div>;
  if (!profile) return <div className="page"><LoadingState /></div>;

  return (
    <div className="page page-medium">
      <div className="page-header">
        <div>
          <h1>Profile &amp; settings</h1>
          <div className="page-sub">Manage your account details.</div>
        </div>
      </div>

      <div className="profile-stat-row">
        <div className="profile-stat">
          <div className="n">{profile.watchlistCount}</div>
          <div className="l">Stocks tracked</div>
        </div>
        <div className="profile-stat">
          <div className="n">{new Date(profile.user.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
          <div className="l">Member since</div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, marginBottom: 16 }}>Account details</h3>
        {saveNote && <div className={saveNote === "Saved." ? "inline-success" : "inline-error"}>{saveNote}</div>}
        <form onSubmit={handleSaveName}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" value={profile.user.email} disabled />
          </div>
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit">
            Save changes
          </button>
        </form>
      </div>

      <div className="card card-pad">
        <h3 style={{ fontSize: 16, marginBottom: 16 }}>Change password</h3>
        {pwError && <div className="inline-error">{pwError}</div>}
        {pwNote && <div className="inline-success">{pwNote}</div>}
        <form onSubmit={handleChangePassword}>
          <div className="field">
            <label htmlFor="curPw">Current password</label>
            <input id="curPw" type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="newPw">New password</label>
            <input id="newPw" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} minLength={6} />
          </div>
          <button className="btn" type="submit">
            Update password
          </button>
        </form>
      </div>
    </div>
  );
}
