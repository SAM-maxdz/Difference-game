"use client";

import { useState } from "react";

const avatars = [
  "/avatars/man1.PNG",
  "/avatars/man2.PNG",
  "/avatars/man3.PNG",
  "/avatars/man4.PNG",
  "/avatars/woman1.PNG",
  "/avatars/woman2.PNG",
  "/avatars/woman3.PNG",
  "/avatars/woman4.PNG",
];

export default function Home() {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(avatars[0]);
  const [joined, setJoined] = useState(false);

  if (joined) {
    return (
      <main className="casino">
        <div className="stars"></div>
        <div className="glow glow1"></div>
        <div className="glow glow2"></div>

        <section className="lobby">
          <div className="brand-small">FHDxNJD</div>

          <div className="lobby-header">
            <span>PRIVATE TABLE</span>
            <strong>0 / 10 PLAYERS</strong>
          </div>

          <h2>WAITING LOBBY</h2>

          <div className="player-seat">
            <div className="seat-avatar">
              <img src={avatar} alt="avatar" />
            </div>
            <div>
              <strong>{name}</strong>
              <span>YOU</span>
            </div>
          </div>

          <div className="waiting">
            Waiting for the host to start the game...
          </div>

          <button
            className="back-button"
            onClick={() => setJoined(false)}
          >
            CHANGE NAME / AVATAR
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="casino">
      <div className="stars"></div>
      <div className="glow glow1"></div>
      <div className="glow glow2"></div>

      <section className="hero">
        <div className="logo">♠ ♥ ♦ ♣</div>

        <h1 className="brand-title">
          <span className="brand-text">FHDxNJD</span>
        </h1>

        <div className="subtitle">PRIVATE GAME</div>

        <p>Wait for the host to start the game.</p>

        <div className="join-card">
          <label>اسم اللاعب</label>

          <input
            type="text"
            placeholder="Enter your name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={16}
          />

          <div className="avatar-title">اختر صورتك الرمزية</div>

          <div className="avatars">
            {avatars.map((item) => (
              <button
                key={item}
                className={`avatar-choice ${
                  avatar === item ? "selected" : ""
                }`}
                onClick={() => setAvatar(item)}
              >
                <img src={item} alt="avatar option" />
              </button>
            ))}
          </div>

          <div className="selected-avatar">
            <img src={avatar} alt="selected avatar" />
          </div>

          <button
            className="join-button"
            disabled={!name.trim()}
            onClick={() => setJoined(true)}
          >
            JOIN TABLE
          </button>

          <div className="private">🔒 PRIVATE ROOM</div>
        </div>

        <div className="players">UP TO 10 PLAYERS</div>
      </section>
    </main>
  );
}
