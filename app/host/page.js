"use client";
import { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { ref, onValue, set } from "firebase/database";

export default function HostPage() {
  const [players, setPlayers] = useState({});
  const [status, setStatus] = useState("waiting");

  useEffect(() => {
    const playersRef = ref(db, "players");
    const unsubscribe = onValue(playersRef, (snapshot) => {
      setPlayers(snapshot.val() || {});
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const statusRef = ref(db, "game/status");
    const unsubscribe = onValue(statusRef, (snapshot) => {
      setStatus(snapshot.val() || "waiting");
    });
    return () => unsubscribe();
  }, []);

  function startGame() {
    set(ref(db, "game/status"), "playing");
  }

  function resetGame() {
    set(ref(db, "game/status"), "waiting");
  }

  const playersList = Object.entries(players);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#030302",
        color: "white",
        padding: 40,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1 style={{ color: "#f8d46b" }}>لوحة تحكم المضيف</h1>
      <p>
        حالة اللعبة: <strong>{status}</strong>
      </p>
      <p>
        عدد اللاعبين: {playersList.length} / 10
      </p>
      <ul>
        {playersList.map(([id, p]) => (
          <li key={id}>{p.name}</li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: 15, marginTop: 20 }}>
        <button
          onClick={startGame}
          disabled={status === "playing"}
          style={{
            padding: "15px 30px",
            fontSize: 18,
            background: "linear-gradient(135deg, #a86f12, #f7d574, #a86f12)",
            border: "none",
            borderRadius: 10,
            color: "#120b02",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          START GAME
        </button>
        <button
          onClick={resetGame}
          style={{
            padding: "15px 30px",
            fontSize: 18,
            background: "transparent",
            border: "1px solid #d8b45b",
            borderRadius: 10,
            color: "#d8b45b",
            cursor: "pointer",
          }}
        >
          RESET
        </button>
      </div>
    </main>
  );
}
