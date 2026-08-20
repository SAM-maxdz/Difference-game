"use client";
import { useState, useEffect, useRef } from "react";
import { db } from "../../lib/firebase";
import { ref, onValue, set } from "firebase/database";

const ATTEMPTS_START = 5;
const POINTS_PER_DIFF = 50;
const REVEAL_BEFORE_LEADERBOARD = 10; // ثواني عرض الاختلافات قبل التصنيف

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
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [muted, setMuted] = useState(false);
  const [zoomSrc, setZoomSrc] = useState(null);
  const [joinToast, setJoinToast] = useState(null);

  const playerIdRef = useRef(null);
  const knownPlayerIds = useRef(new Set());
  const musicRef = useRef(null);
  const correctSoundRef = useRef(null);
  const wrongSoundRef = useRef(null);

  useEffect(() => {
    playerIdRef.current = sessionStorage.getItem("playerId");
  }, []);

  // ---------- حالة اللعبة ----------
  useEffect(() => {
    const gameRef = ref(db, "game");
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const data = snapshot.val() || {};
      setPairId(data.currentPairId || null);
      setStartedAt(data.startedAt || null);
    });
    return () => unsubscribe();
  }, []);

  // ---------- بيانات المستوى الحالي ----------
  useEffect(() => {
    if (!pairId) return;
    const pairRef = ref(db, `imagePairs/${pairId}`);
    const unsubscribe = onValue(pairRef, (snapshot) => {
      setPair(snapshot.val());
    });
    return () => unsubscribe();
  }, [pairId]);

  // ---------- تصفير التقدم عند بداية جولة جديدة ----------
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
      setShowLeaderboard(false);
      set(ref(db, `players/${playerIdRef.current}/score`), 0);
      set(ref(db, `players/${playerIdRef.current}/attemptsLeft`), ATTEMPTS_START);
    }
  }, [pairId]);

  // ---------- عداد الوقت ----------
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

  // ---------- بعد نهاية الجولة: اعرض الاختلافات ثم التصنيف ----------
  useEffect(() => {
    if (!roundEnded) return;
    const t = setTimeout(() => setShowLeaderboard(true), REVEAL_BEFORE_LEADERBOARD * 1000);
    return () => clearTimeout(t);
  }, [roundEnded]);

  // ---------- اللاعبين + إشعار الانضمام ----------
  useEffect(() => {
    const playersRef = ref(db, "players");
    const unsubscribe = onValue(playersRef, (snapshot) => {
      const data = snapshot.val() || {};
      // كشف لاعب جديد
      Object.entries(data).forEach(([id, p]) => {
        if (!knownPlayerIds.current.has(id) && knownPlayerIds.current.size > 0) {
          setJoinToast(`🎉 ${p.name} انضم للعبة`);
          setTimeout(() => setJoinToast(null), 3000);
        }
        knownPlayerIds.current.add(id);
      });
      setPlayers(data);
    });
    return () => unsubscribe();
  }, []);

  // ---------- الموسيقى ----------
  useEffect(() => {
    if (!musicRef.current) return;
    musicRef.current.volume = 0.25;
    if (muted) musicRef.current.pause();
    else musicRef.current.play().catch(() => {});
  }, [muted, pairId]);

  const playSound = (r) => {
    if (muted || !r.current) return;
    r.current.currentTime = 0;
    r.current.play().catch(() => {});
  };

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
      playSound(correctSoundRef);
      const newFound = { ...found, [hitIndex]: true };
      setFound(newFound);
      const newScore = score + POINTS_PER_DIFF;
      setScore(newScore);
      set(ref(db, `players/${playerIdRef.current}/score`), newScore);

      if (Object.keys(newFound).length === pair.differences.length) {
        setRoundEnded(true);
      }
    } else {
      playSound(wrongSoundRef);
      setFlashRed(true);
      setTimeout(() => setFlashRed(false), 300);
      const newAttempts = attemptsLeft - 1;
      setAttemptsLeft(newAttempts);
      set(ref(db, `players/${playerIdRef.current}/attemptsLeft`), newAttempts);
      if (newAttempts <= 0) setLocked(true);
    }
  }

  const playersList = Object.entries(players).map(([id, p]) => ({ id, ...p }));
  const topSeats = playersList.slice(0, 5);
  const bottomSeats = playersList.slice(5, 10);
  const sortedLeaderboard = [...playersList].sort((a, b) => (b.score || 0) - (a.score || 0));

  return (
    <main style={styles.page}>
      <video autoPlay loop muted playsInline style={styles.bgVideo}>
        <source src="/casino-background.MP4" type="video/mp4" />
      </video>
      <div style={styles.overlay} />

      {/* أصوات — زود ملفاتك الحقيقية في public/sounds/ */}
      <audio ref={musicRef} loop src="/sounds/casino-music.mp3" />
      <audio ref={correctSoundRef} src="/sounds/correct.mp3" />
      <audio ref={wrongSoundRef} src="/sounds/wrong.mp3" />

      <button style={styles.muteBtn} onClick={() => setMuted((m) => !m)}>
        {muted ? "🔇" : "🔊"}
      </button>

      {joinToast && <div style={styles.joinToast}>{joinToast}</div>}

      {!pairId || !pair ? (
        <div style={styles.center}>
          <p style={{ color: "#f8d46b", fontSize: 20 }}>
            بانتظار قيام المضيف باختيار الصور...
          </p>
        </div>
      ) : (
        <>
          <div style={styles.topBar}>
            <div style={{ color: "#f8d46b", fontWeight: 900, fontSize: 20 }}>
              ⏱ {Math.ceil(remaining)} ثانية
            </div>
            <div style={{ color: "white" }}>
              النقاط: <strong style={{ color: "#f8d46b" }}>{score}</strong>
            </div>
            <div style={{ color: "white" }}>
              المحاولات المتبقية:{" "}
              <strong style={{ color: attemptsLeft > 0 ? "#f8d46b" : "#e04b3f" }}>
                {attemptsLeft}
              </strong>
            </div>
          </div>

          {!roundEnded && <SeatRow seats={topSeats} />}

          {roundEnded ? (
            showLeaderboard ? (
              <div style={styles.results}>
                <h2 style={{ color: "#f8d46b" }}>🏆 التصنيف</h2>
                <div style={styles.leaderboardList}>
                  {sortedLeaderboard.map((p, i) => (
                    <div key={p.id} style={styles.leaderboardRow}>
                      <span style={styles.leaderboardRank}>#{i + 1}</span>
                      {p.avatar && (
                        <img src={p.avatar} alt={p.name} style={styles.leaderboardAvatar} />
                      )}
                      <span style={{ flex: 1 }}>{p.name}</span>
                      <span style={{ color: "#f8d46b" }}>{p.score || 0} نقطة</span>
                    </div>
                  ))}
                </div>
                <p style={{ color: "#999", marginTop: 20 }}>
                  بانتظار أن يبدأ المضيف الجولة التالية...
                </p>
              </div>
            ) : (
              <div style={styles.revealFade}>
                <h3 style={{ textAlign: "center", color: "#f8d46b" }}>
                  {Object.keys(found).length === pair.differences.length
                    ? "🎉 لقد عثرت على جميع الاختلافات!"
                    : "⏰ انتهى الوقت!"}
                </h3>
                <div style={styles.imagesRow}>
                  {[pair.image1, pair.image2].map((src, idx) => (
                    <div key={idx} style={styles.imgWrapOuter}>
                      <div style={styles.imgWrap}>
                        <img src={src} alt="" style={styles.img} draggable={false} />
                        {pair.differences.map((d, i) => (
                          <div
                            key={i}
                            style={{
                              ...styles.foundMarker,
                              left: `${d.x}%`,
                              top: `${d.y}%`,
                              width: `${d.radius * 2}%`,
                              height: `${d.radius * 2}%`,
                              borderColor: found[i] ? "#00ff88" : "#ffcf00",
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : (
            <div
              style={{
                ...styles.imagesRow,
                filter: flashRed ? "brightness(1.5) saturate(2)" : "none",
              }}
            >
              <ImageBox
                src={pair.image1}
                onClick={handleImageClick}
                found={found}
                differences={pair.differences}
                locked={locked}
                onZoom={() => setZoomSrc(pair.image1)}
              />
              <ImageBox
                src={pair.image2}
                onClick={handleImageClick}
                found={found}
                differences={pair.differences}
                locked={locked}
                onZoom={() => setZoomSrc(pair.image2)}
              />
            </div>
          )}

          {!roundEnded && <SeatRow seats={bottomSeats} />}

          {locked && !roundEnded && (
            <div style={styles.lockedBanner}>🔒 خلصت محاولاتك، استنى نهاية الجولة</div>
          )}
        </>
      )}

      {zoomSrc && (
        <div style={styles.zoomOverlay} onClick={() => setZoomSrc(null)}>
          <img src={zoomSrc} alt="zoom" style={styles.zoomImg} />
          <button style={styles.zoomClose} onClick={() => setZoomSrc(null)}>
            ✕
          </button>
        </div>
      )}
    </main>
  );
}

function ImageBox({ src, onClick, found, differences, locked, onZoom }) {
  return (
    <div style={styles.imgWrapOuter}>
      <button style={styles.zoomBtn} onClick={onZoom}>
        🔍
      </button>
      <div
        style={{ ...styles.imgWrap, cursor: locked ? "not-allowed" : "crosshair" }}
        onClick={onClick}
      >
        <img src={src} alt="" style={styles.img} draggable={false} />
        {Object.keys(found).map((i) => {
          const d = differences[i];
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
  );
}

function SeatRow({ seats }) {
  if (seats.length === 0) return null;
  return (
    <div style={styles.seatRow}>
      {seats.map((p) => (
        <div key={p.id} style={styles.seat}>
          <div style={styles.seatAvatarWrap}>
            {p.avatar && <img src={p.avatar} alt={p.name} style={styles.seatAvatar} />}
            <span
              style={{
                ...styles.statusDot,
                background: p.attemptsLeft > 0 ? "#00ff88" : "#e04b3f",
              }}
            />
          </div>
          <span style={styles.seatName}>{p.name}</span>
          <span style={styles.seatScore}>{p.score || 0} نقطة</span>
          <span style={styles.seatAttempts}>محاولات: {p.attemptsLeft ?? ATTEMPTS_START}</span>
        </div>
      ))}
    </div>
  );
}

const styles = {
  page: {
    position: "relative",
    minHeight: "100vh",
    color: "white",
    fontFamily: "Arial, sans-serif",
    padding: 20,
    overflow: "hidden",
  },
  bgVideo: {
    position: "fixed",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    zIndex: -2,
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(3,3,2,0.78)",
    zIndex: -1,
  },
  muteBtn: {
    position: "fixed",
    top: 16,
    left: 16,
    zIndex: 20,
    background: "rgba(0,0,0,0.5)",
    border: "1px solid #444",
    borderRadius: "50%",
    width: 44,
    height: 44,
    fontSize: 20,
    color: "#fff",
    cursor: "pointer",
  },
  joinToast: {
    position: "fixed",
    top: 20,
    right: 20,
    zIndex: 30,
    background: "rgba(0,0,0,0.75)",
    border: "1px solid #f8d46b",
    color: "#f8d46b",
    padding: "10px 18px",
    borderRadius: 20,
    animation: "none",
  },
  center: {
    minHeight: "80vh",
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
    marginBottom: 12,
    border: "1px solid rgba(232,184,74,0.3)",
  },
  seatRow: {
    display: "flex",
    justifyContent: "center",
    gap: 10,
    flexWrap: "wrap",
    margin: "10px 0",
  },
  seat: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    background: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    padding: "6px 10px",
    minWidth: 76,
  },
  seatAvatarWrap: { position: "relative" },
  seatAvatar: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    objectFit: "cover",
    border: "2px solid #f8d46b",
  },
  statusDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: "50%",
    border: "2px solid #111",
  },
  seatName: { fontSize: 11, marginTop: 4 },
  seatScore: { fontSize: 10, color: "#f8d46b" },
  seatAttempts: { fontSize: 9, color: "#aaa" },
  imagesRow: {
    display: "flex",
    gap: 15,
    flexWrap: "wrap",
    justifyContent: "center",
    transition: "filter 0.2s",
  },
  imgWrapOuter: { position: "relative", flex: 1, minWidth: 300, maxWidth: 600 },
  zoomBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 5,
    background: "rgba(0,0,0,0.6)",
    border: "1px solid #555",
    borderRadius: 8,
    color: "#fff",
    padding: "4px 10px",
    cursor: "pointer",
  },
  imgWrap: {
    position: "relative",
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
  lockedBanner: { textAlign: "center", marginTop: 16, fontSize: 18, color: "#e04b3f" },
  revealFade: { animation: "none" },
  results: { textAlign: "center", padding: 40 },
  leaderboardList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    width: "min(90%, 420px)",
    margin: "16px auto 0",
  },
  leaderboardRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "rgba(255,255,255,0.08)",
    padding: "8px 14px",
    borderRadius: 12,
  },
  leaderboardRank: { width: 30, fontWeight: "bold", color: "#f8d46b" },
  leaderboardAvatar: { width: 32, height: 32, borderRadius: "50%", objectFit: "cover" },
  zoomOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.9)",
    zIndex: 50,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  zoomImg: { maxWidth: "95%", maxHeight: "95%", borderRadius: 12 },
  zoomClose: {
    position: "absolute",
    top: 20,
    right: 20,
    background: "rgba(255,255,255,0.15)",
    border: "none",
    color: "#fff",
    borderRadius: "50%",
    width: 44,
    height: 44,
    fontSize: 20,
    cursor: "pointer",
  },
};
