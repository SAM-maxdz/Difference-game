"use client";
import { useState, useEffect, useRef } from "react";
import { db } from "../../lib/firebase";
import { ref, onValue, set } from "firebase/database";

const ATTEMPTS_START = 5;
const POINTS_PER_DIFF = 50;

export default function GamePage() {
  const [pairId, setPairId] = useState(null);
  const [pair, setPair] = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [found, setFound] = useState({});
  const [attemptsLeft, setAttemptsLeft] = useState(ATTEMPTS_START);
  const [score, setScore] = useState(0);
  const [flashRed, setFlashRed] = useState(false);
  const [locked, setLocked] = useState(false);
  const [roundEnded, setRoundEnded] = useState(false);
  const [players, setPlayers] = useState({});
  const playerIdRef = useRef(null);

  useEffect(() => {
    playerIdRef.current = sessionStorage.getItem("playerId");
  }, []);

  useEffect(() => {
    const gameRef = ref(db, "game");
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const data = snapshot.val() || {};
      setPairId(data.currentPairId || null);
      setStartedAt(data.startedAt || null);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!pairId) return;
    const pairRef = ref(db, `imagePairs/${pairId}`);
    const unsubscribe = onValue(pairRef, (snapshot) => {
      setPair(snapshot.val());
    });
    return () => unsubscribe();
  }, [pairId]);

  useEffect(() => {
    if (!pairId || !playerIdRef.current) return;
    const lastPairId = sessionStorage.getItem("lastPairId");
    if (lastPairId !== pairId) {
      sessionStorage.setItem("lastPairId", pairId);
      setFound({});
      setAttemptsLeft(ATTEMPTS_START);
      setScore(0);
      setLocked(false);
      setRoundEnded(false);
      set(ref(db, `players/${playerIdRef.current}/score`), 0);
      set(ref(db, `players/${playerIdRef.current}/attemptsLeft`), ATTEMPTS_START);
    }
  }, [pairId]);

  useEffect(() => {
    if (!pair || !startedAt) return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const rem = Math.max(0, pair.timeLimit - elapsed);
      setRemaining(rem);
      if (rem <= 0) {
        setRoundEnded(true);
        clearInterval(interval);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [pair, startedAt]);

  useEffect(() => {
    const playersRef = ref(db, "players");
    const unsubscribe = onValue(playersRef, (snapshot) => {
      setPlayers(snapshot.val() || {});
    });
    return () => unsubscribe();
  }, []);

  function handleImageClick(e) {
    if (locked || roundEnded || !pair) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;

    let hitIndex = -1;
    pair.differences.forEach((d, i) => {
      if (found[i]) return;
      const dist = Math.sqrt((d.x - xPct) ** 2 + (d.y - yPct) ** 2);
      if (dist <= d.radius) hitIndex = i;
    });

    if (hitIndex >= 0) {
      const newFound = { ...found, [hitIndex]: true };
      setFound(newFound);
      const newScore = score + POINTS_PER_DIFF;
      setScore(newScore);
      set(ref(db, `players/${playerIdRef.current}/score`), newScore);

      if (Object.keys(newFound).length === pair.differences.length) {
        setRoundEnded(true);
      }
    } else {
      setFlashRed(true);
      setTimeout(() => setFlashRed(false), 300);
      const newAttempts = attemptsLeft - 1;
      setAttemptsLeft(newAttempts);
      set(ref(db, `players/${playerIdRef.current}/attemptsLeft`), newAttempts);
      if (newAttempts <= 0) setLocked(true);
    }
  }

  if (!pairId || !pair) {
    return (
      <main style={styles.center}>
        <p style={{ color: "#f8d46b", fontSize: 20 }}>
          في انتظار المضيف يختار الصور...
        </p>
      </main>
    );
  }

  const playersList = Object.entries(players);

  return (
    <main style={styles.page}>
      <div style={styles.topBar}>
        <div style={{ color: "#f8d46b", fontWeight: 900, fontSize: 20 }}>
          ⏱ {Math.ceil(remaining)}s
        </div>
        <div style={{ color: "white" }}>
          النقاط: <strong style={{ color: "#f8d46b" }}>{score}</strong>
        </div>
        <div style={{ color: "white" }}>
          المحاولات:{" "}
          <strong style={{ color: attemptsLeft > 0 ? "#f8d46b" : "#e04b3f" }}>
            {attemptsLeft}
          </strong>
        </div>
      </div>

      {roundEnded ? (
        <div style={styles.results}>
          <h2 style={{ color: "#f8d46b" }}>
            {Object.keys(found).length === pair.differences.length
              ? "🎉 لقيت كل الاختلافات!"
              : "⏰ خلص الوقت!"}
          </h2>
          <p>نقاطك: {score}</p>
          <h3 style={{ color: "#f8d46b", marginTop: 20 }}>الترتيب</h3>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {playersList
              .sort((a, b) => (b[1].score || 0) - (a[1].score || 0))
              .map(([id, p]) => (
                <li key={id} style={{ padding: 6 }}>
                  {p.name}: {p.score || 0} نقطة
                </li>
              ))}
          </ul>
          <p style={{ color: "#999", marginTop: 20 }}>
            في انتظار المضيف يبدا الجولة الجاية...
          </p>
        </div>
      ) : (
        <div
          style={{
            ...styles.imagesRow,
            filter: flashRed ? "brightness(1.5) saturate(2)" : "none",
          }}
        >
          <div style={styles.imgWrap} onClick={handleImageClick}>
            <img src={pair.image1} alt="1" style={styles.img} draggable={false} />
            {Object.keys(found).map((i) => {
              const d = pair.differences[i];
              return (
                <div
                  key={i}
                  style={{
                    ...styles.foundMarker,
                    left: `${d.x}%`,
                    top: `${d.y}%`,
                    width: `${d.radius * 2}%`,
                    height: `${d.radius * 2}%`,
                  }}
                />
              );
            })}
          </div>
          <div style={styles.imgWrap} onClick={handleImageClick}>
            <img src={pair.image2} alt="2" style={styles.img} draggable={false} />
            {Object.keys(found).map((i) => {
              const d = pair.differences[i];
              return (
                <div
                  key={i}
                  style={{
                    ...styles.foundMarker,
                    left: `${d.x}%`,
                    top: `${d.y}%`,
                    width: `${d.radius * 2}%`,
                    height: `${d.radius * 2}%`,
                  }}
                />
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#030302",
    color: "white",
    fontFamily: "Arial, sans-serif",
    padding: 20,
  },
  center: {
    minHeight: "100vh",
    background: "#030302",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  topBar: {
    display: "flex",
    justifyContent: "space-around",
    padding: 15,
    background: "rgba(232,184,74,0.08)",
    borderRadius: 12,
    marginBottom: 20,
    border: "1px solid rgba(232,184,74,0.3)",
  },
  imagesRow: {
    display: "flex",
    gap: 15,
    flexWrap: "wrap",
    justifyContent: "center",
    transition: "filter 0.2s",
  },
  imgWrap: {
    position: "relative",
    flex: 1,
    minWidth: 300,
    maxWidth: 600,
    cursor: "crosshair",
    border: "2px solid #333",
    borderRadius: 12,
    overflow: "hidden",
  },
  img: { width: "100%", display: "block", userSelect: "none" },
  foundMarker: {
    position: "absolute",
    transform: "translate(-50%, -50%)",
    border: "3px solid #00ff88",
    borderRadius: "50%",
    boxShadow: "0 0 15px rgba(0,255,136,0.6)",
  },
  results: {
    textAlign: "center",
    padding: 40,
  },
};
