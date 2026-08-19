‏import { useState } from "react";

‏export default function Home() {
‏  const [name, setName] = useState("");

‏  return (
‏    <main className="casino">
‏      <div className="glow glow1"></div>
‏      <div className="glow glow2"></div>

‏      <section className="hero">
‏        <div className="logo">♠ ♥ ♦ ♣</div>

‏        <h1>DIFFERENCE</h1>

‏        <div className="subtitle">THE GAME</div>

‏        <p>
‏          Find the differences before time runs out.
‏        </p>

‏        <div className="join-card">
‏          <label>PLAYER NAME</label>

‏          <input
‏            type="text"
‏            placeholder="Enter your name"
‏            value={name}
‏            onChange={(e) => setName(e.target.value)}
‏            maxLength={16}
          />

‏          <div className="avatar-title">YOUR AVATAR</div>

‏          <div className="avatar">🎩</div>

‏          <button disabled={!name.trim()}>
‏            JOIN TABLE
‏          </button>

‏          <div className="private">
‏            🔒 Private game • No account required
‏          </div>
‏        </div>

‏        <div className="players">
‏          UP TO 10 PLAYERS
‏        </div>
‏      </section>
‏    </main>
  );
}
