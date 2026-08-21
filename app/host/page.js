"use client";

import { useState, useEffect, useRef } from "react";
import { db, auth } from "../../lib/firebase";
import { ref, onValue, update } from "firebase/database";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

// هذا مجرد معرّف حساب المضيف (مو سرّي) — كلمة المرور
// الحقيقية غير موجودة إطلاقاً في الكود، بل مخزّنة ومُتحقَّق
// منها داخل Firebase Authentication نفسه.
const HOST_EMAIL = "host@difference-game.local";
const COUNTDOWN_SECONDS = 5;
const REVEAL_SECONDS = 5;

const DURATION_OPTIONS = [
  { label: "30 ثانية", value: 30 },
  { label: "دقيقة واحدة", value: 60 },
  { label: "دقيقتان", value: 120 },
  { label: "3 دقائق", value: 180 },
  { label: "4 دقائق", value: 240 },
];

export default function HostPage() {
  const [authorized, setAuthorized] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [error, setError] = useState("");

  const [players, setPlayers] = useState({});
  const [gameData, setGameData] = useState({});
  const [imagePairs, setImagePairs] = useState({});
  const [selectedPairId, setSelectedPairId] = useState("");
  const [selectedDuration, setSelectedDuration] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [search, setSearch] = useState("");
  const [labelDrafts, setLabelDrafts] = useState({});
  const wakeLockRef = useRef(null);

  // منع إعتام/قفل شاشة المضيف طول ما اللعبة مفتوحة عنده —
  // المضيف هو من يشغّل اللعبة، فانقطاع اتصاله يعطّل الجميع.
  useEffect(() => {
    if (!authorized) return;

    async function requestWakeLock() {
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        }
      } catch (err) {
        // غير مدعوم في بعض المتصفحات، نتجاهل ونكمل عادي
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && !wakeLockRef.current) {
        requestWakeLock();
      }
    }

    requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [authorized]);

  // نعتمد على Firebase Auth نفسه لمعرفة هل المضيف مسجّل
  // دخول أو لا (يبقى مسجلاً حتى بعد تحديث الصفحة تلقائياً،
  // بدون أي حيلة يدوية بـ sessionStorage).
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthorized(!!user && user.email === HOST_EMAIL);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authorized) return;
    const playersRef = ref(db, "players");
    const unsubscribe = onValue(playersRef, (snapshot) => {
      setPlayers(snapshot.val() || {});
    });
    return () => unsubscribe();
  }, [authorized]);

  // نقرأ عقدة game كاملة (وليس status فقط) حتى نحسب
  // بأنفسنا في أي مرحلة نحن: عد تنازلي / لعب / عرض الحل / تصنيف
  useEffect(() => {
    if (!authorized) return;
    const gameRef = ref(db, "game");
    const unsubscribe = onValue(gameRef, (snapshot) => {
      setGameData(snapshot.val() || {});
    });
    return () => unsubscribe();
  }, [authorized]);

  useEffect(() => {
    if (!authorized) return;
    const pairsRef = ref(db, "imagePairs");
    const unsubscribe = onValue(pairsRef, (snapshot) => {
      setImagePairs(snapshot.val() || {});
    });
    return () => unsubscribe();
  }, [authorized]);

  // ساعة داخلية لحساب مرحلة الجولة الحالية لحظيًا
  useEffect(() => {
    if (!authorized) return;
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, [authorized]);

  function handleLogin() {
    setError("");
    signInWithEmailAndPassword(auth, HOST_EMAIL, passwordInput).catch(() => {
      setError("كلمة المرور غير صحيحة");
    });
  }

  function handleLogout() {
    signOut(auth);
    setPasswordInput("");
  }

  // =========================================================
  // حساب مرحلة الجولة الحالية بشكل مطابق لما تحسبه صفحة اللعب:
  // idle -> countdown -> playing -> revealing -> leaderboard
  // (تبقى في leaderboard حتى يبدأ المضيف جولة جديدة)
  // =========================================================

  const countdownStartedAt = gameData.countdownStartedAt || null;
  const currentPair = gameData.currentPairId
    ? imagePairs[gameData.currentPairId]
    : null;
  const roundDuration =
    Number(gameData.roundDuration) ||
    Number(currentPair?.timeLimit) ||
    0;

  let phase = "idle";
  if (countdownStartedAt) {
    const elapsed = (now - countdownStartedAt) / 1000;
    if (elapsed < COUNTDOWN_SECONDS) {
      phase = "countdown";
    } else if (elapsed < COUNTDOWN_SECONDS + roundDuration) {
      phase = "playing";
    } else if (
      elapsed <
      COUNTDOWN_SECONDS + roundDuration + REVEAL_SECONDS
    ) {
      phase = "revealing";
    } else {
      phase = "leaderboard";
    }
  }

  const phaseLabels = {
    idle: "بانتظار بدء اللعبة",
    countdown: "⏳ عد تنازلي...",
    playing: "🎮 الجولة جارية الآن",
    revealing: "👁 عرض الحل للاعبين",
    leaderboard: "🏆 عرض التصنيف — بانتظارك لبدء الجولة التالية",
  };

  const canStart =
    selectedPairId &&
    selectedDuration &&
    (phase === "idle" || phase === "leaderboard");

  const startButtonLabel =
    phase === "leaderboard" ? "ابدأ الجولة التالية" : "بدء اللعبة";

  function startGame() {
    if (!selectedPairId || !selectedDuration) {
      alert("يرجى اختيار الصورة ومدة الجولة أولاً");
      return;
    }

    /*
      مهم جدًا:
      هنا لا نضع startedAt.
      نضع فقط وقت بداية العد التنازلي، ومدة الجولة التي اخترتها.
      وبعد 5 ثوانٍ نضع startedAt.
      بهذه الطريقة وقت اللعب الحقيقي لا يبدأ أثناء 5 -> 4 -> 3 -> 2 -> 1.
    */

    const newCountdownStartedAt = Date.now();

    // كتابة كل حقول الجولة الجديدة دفعة واحدة (atomic update) بدل
    // عدة set() منفصلة — هذا يمنع وصول بيانات متضاربة/ناقصة لأي
    // لاعب يفتح أو يحدّث صفحته بالضبط في تلك اللحظة.
    update(ref(db), {
      "game/currentPairId": selectedPairId,
      "game/roundDuration": selectedDuration,
      "game/countdownStartedAt": newCountdownStartedAt,
      "game/startedAt": null, // إزالة وقت الجولة القديمة
      "game/status": "countdown", // بداية العد التنازلي
    });

    // بعد 5 ثوانٍ بالضبط تبدأ الجولة فعليًا
    setTimeout(() => {
      const realGameStart =
        newCountdownStartedAt + COUNTDOWN_SECONDS * 1000;

      update(ref(db), {
        "game/startedAt": realGameStart,
        "game/status": "playing",
      });
    }, COUNTDOWN_SECONDS * 1000);
  }

  function resetGame() {
    if (
      !confirm(
        "سيتم إنهاء اللعبة الحالية وتصفير نقاط ومحاولات جميع اللاعبين. متابعة؟"
      )
    ) {
      return;
    }

    update(ref(db), {
      "game/status": "waiting",
      "game/startedAt": null,
      "game/countdownStartedAt": null,
      "game/currentPairId": null,
      "game/roundDuration": null,
    });

    // تصفير نقاط ومحاولات جميع اللاعبين لبدء لعبة جديدة من الصفر
    const playerUpdates = {};
    Object.keys(players).forEach((id) => {
      playerUpdates[`players/${id}/score`] = 0;
      playerUpdates[`players/${id}/attemptsLeft`] = 5;
    });
    if (Object.keys(playerUpdates).length > 0) {
      update(ref(db), playerUpdates);
    }

    setSelectedPairId("");
    setSelectedDuration(null);
  }

  function commitLabel(id, fallback) {
    const draft = labelDrafts[id];
    if (draft === undefined) return;
    const trimmed = draft.trim();
    if (trimmed && trimmed !== fallback) {
      update(ref(db), { [`imagePairs/${id}/label`]: trimmed });
    }
  }

  if (!authorized) {
    return (
      <main style={styles.loginPage}>
        <div style={styles.loginCard}>
          <div style={styles.loginBadge}>♠</div>
          <h2 style={styles.loginTitle}>لوحة تحكم المضيف</h2>
          <p style={styles.loginSubtitle}>سجّل دخولك لبدء إدارة الجولة</p>

          <input
            type="password"
            placeholder="كلمة المرور"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            style={styles.loginInput}
          />

          <button onClick={handleLogin} style={styles.loginButton}>
            دخول
          </button>

          {error && <p style={styles.loginError}>{error}</p>}
        </div>
      </main>
    );
  }

  const playersList = Object.entries(players);
  const pairsList = Object.entries(imagePairs);
  const roundLocked = phase === "countdown" || phase === "playing" || phase === "revealing";

  const filteredPairs = pairsList.filter(([, pair]) => {
    const label = pair.label || pair.name || "";
    return label.toLowerCase().includes(search.trim().toLowerCase());
  });

  const phaseTone = {
    idle: styles.pillNeutral,
    countdown: styles.pillWarn,
    playing: styles.pillActive,
    revealing: styles.pillWarn,
    leaderboard: styles.pillGold,
  };

  return (
    <main style={styles.page}>
      <header style={styles.topBar}>
        <div style={styles.topBarLeft}>
          <span style={styles.logoBadge}>♦</span>
          <h1 style={styles.pageTitle}>لوحة تحكم المضيف</h1>
        </div>
        <div style={styles.topBarRight}>
          <span style={{ ...styles.pill, ...phaseTone[phase] }}>
            {phaseLabels[phase]}
          </span>
          <button onClick={handleLogout} style={styles.logoutButton}>
            تسجيل خروج
          </button>
        </div>
      </header>

      <div style={styles.layout}>
        {/* ============ العمود الرئيسي ============ */}
        <div style={styles.mainColumn}>
          {/* مكتبة الصور */}
          <section style={styles.card}>
            <div style={styles.cardHeaderRow}>
              <h2 style={styles.cardTitle}>1. اختر صورة الجولة</h2>
              <input
                type="text"
                placeholder="🔍 ابحث بالاسم..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={styles.searchInput}
              />
            </div>

            {pairsList.length === 0 ? (
              <p style={styles.emptyText}>
                لا توجد أي صور محفوظة بعد. أضِف صوراً من صفحة
                /admin/differences.
              </p>
            ) : filteredPairs.length === 0 ? (
              <p style={styles.emptyText}>لا توجد نتائج مطابقة للبحث.</p>
            ) : (
              <div style={styles.libraryScroll}>
                <div style={styles.libraryGrid}>
                  {filteredPairs.map(([id, pair]) => {
                    const displayName = pair.label || pair.name || "بدون اسم";
                    const isSelected = selectedPairId === id;
                    return (
                      <div
                        key={id}
                        onClick={() => !roundLocked && setSelectedPairId(id)}
                        style={{
                          ...styles.pairCard,
                          ...(isSelected ? styles.pairCardSelected : {}),
                          ...(roundLocked ? styles.pairCardLocked : {}),
                        }}
                      >
                        {isSelected && (
                          <span style={styles.pairCheckmark}>✓</span>
                        )}
                        <div style={styles.pairThumbWrap}>
                          <img
                            src={pair.image1}
                            alt={displayName}
                            style={styles.pairThumb}
                            draggable={false}
                          />
                        </div>
                        <input
                          type="text"
                          value={labelDrafts[id] ?? displayName}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            setLabelDrafts((prev) => ({
                              ...prev,
                              [id]: e.target.value,
                            }))
                          }
                          onBlur={() => commitLabel(id, displayName)}
                          onKeyDown={(e) =>
                            e.key === "Enter" && e.currentTarget.blur()
                          }
                          style={styles.pairNameInput}
                        />
                        <span style={styles.pairMeta}>
                          {pair.differences?.length || 0} اختلاف
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* مدة الجولة */}
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>2. اختر مدة الجولة</h2>
            <div style={styles.durationRow}>
              {DURATION_OPTIONS.map((opt) => {
                const isSelected = selectedDuration === opt.value;
                return (
                  <button
                    key={opt.value}
                    disabled={roundLocked}
                    onClick={() => setSelectedDuration(opt.value)}
                    style={{
                      ...styles.durationButton,
                      ...(isSelected ? styles.durationButtonSelected : {}),
                      ...(roundLocked ? styles.disabledLook : {}),
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* أزرار التحكم */}
          <section style={styles.controlBar}>
            <button
              onClick={startGame}
              disabled={!canStart}
              style={{
                ...styles.primaryButton,
                ...(canStart ? {} : styles.primaryButtonDisabled),
              }}
            >
              {startButtonLabel}
            </button>
            <button onClick={resetGame} style={styles.secondaryButton}>
              إعادة تعيين اللعبة بالكامل
            </button>
          </section>
        </div>

        {/* ============ عمود اللاعبين ============ */}
        <aside style={styles.sideColumn}>
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>
              اللاعبون ({playersList.length}/10)
            </h2>
            {playersList.length === 0 ? (
              <p style={styles.emptyText}>لا يوجد لاعبون بعد.</p>
            ) : (
              <div style={styles.playersScroll}>
                {playersList.map(([id, p]) => (
                  <div key={id} style={styles.playerRow}>
                    {p.avatar ? (
                      <img
                        src={p.avatar}
                        alt={p.name}
                        style={styles.playerAvatar}
                      />
                    ) : (
                      <div style={styles.playerAvatarFallback}>
                        {(p.name || "?").charAt(0)}
                      </div>
                    )}
                    <span style={styles.playerName}>{p.name}</span>
                    <span style={styles.playerScore}>{p.score || 0}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}

const GOLD = "#f8d46b";
const GOLD_SOFT = "rgba(248,212,107,0.18)";
const BORDER = "rgba(248,212,107,0.16)";

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0a0a0e",
    color: "#f2f2f2",
    fontFamily: "system-ui, -apple-system, Arial, sans-serif",
    padding: "24px 28px 60px",
  },

  // ---- شاشة الدخول ----
  loginPage: {
    minHeight: "100vh",
    background: "#0a0a0e",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  loginCard: {
    width: "min(92%, 360px)",
    background: "#131318",
    border: `1px solid ${BORDER}`,
    borderRadius: 20,
    padding: "36px 28px",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 14,
  },
  loginBadge: {
    width: 48,
    height: 48,
    borderRadius: "50%",
    background: GOLD_SOFT,
    color: GOLD,
    fontSize: 22,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  loginTitle: { color: GOLD, margin: 0, fontSize: 20 },
  loginSubtitle: { color: "#999", margin: 0, fontSize: 13 },
  loginInput: {
    width: "100%",
    padding: 14,
    borderRadius: 10,
    border: `1px solid ${BORDER}`,
    background: "rgba(255,255,255,0.04)",
    color: "white",
    textAlign: "center",
    fontSize: 15,
  },
  loginButton: {
    width: "100%",
    padding: "13px 28px",
    background: `linear-gradient(135deg, #a86f12, ${GOLD}, #a86f12)`,
    border: "none",
    borderRadius: 10,
    color: "#120b02",
    fontWeight: 900,
    cursor: "pointer",
    fontSize: 15,
  },
  loginError: { color: "#e04b3f", margin: 0, fontSize: 13 },

  // ---- الشريط العلوي ----
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  topBarLeft: { display: "flex", alignItems: "center", gap: 12 },
  topBarRight: { display: "flex", alignItems: "center", gap: 12 },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    background: GOLD_SOFT,
    color: GOLD,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
  },
  pageTitle: { color: GOLD, margin: 0, fontSize: 22 },
  logoutButton: {
    background: "transparent",
    border: "1px solid #444",
    color: "#aaa",
    borderRadius: 8,
    padding: "9px 16px",
    cursor: "pointer",
    fontSize: 13,
  },

  pill: {
    padding: "7px 16px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 700,
    border: "1px solid transparent",
  },
  pillNeutral: { background: "rgba(255,255,255,0.06)", color: "#bbb" },
  pillWarn: { background: "rgba(255,180,60,0.12)", color: "#ffb43c", borderColor: "rgba(255,180,60,0.3)" },
  pillActive: { background: "rgba(80,220,140,0.12)", color: "#5fe3a1", borderColor: "rgba(80,220,140,0.3)" },
  pillGold: { background: GOLD_SOFT, color: GOLD, borderColor: BORDER },

  // ---- التخطيط العام ----
  layout: {
    display: "flex",
    gap: 20,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  mainColumn: {
    flex: "2 1 480px",
    display: "flex",
    flexDirection: "column",
    gap: 20,
    minWidth: 320,
  },
  sideColumn: {
    flex: "1 1 280px",
    minWidth: 260,
    maxWidth: 340,
  },

  card: {
    background: "#131318",
    border: `1px solid ${BORDER}`,
    borderRadius: 16,
    padding: 20,
  },
  cardTitle: { color: GOLD, margin: "0 0 14px", fontSize: 16 },
  cardHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  emptyText: { color: "#888", fontSize: 14, margin: 0 },

  searchInput: {
    padding: "9px 14px",
    borderRadius: 999,
    border: "1px solid #333",
    background: "rgba(255,255,255,0.04)",
    color: "white",
    fontSize: 13,
    minWidth: 180,
  },

  // ---- مكتبة الصور ----
  libraryScroll: {
    maxHeight: 440,
    overflowY: "auto",
    paddingRight: 4,
  },
  libraryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
    gap: 12,
  },
  pairCard: {
    position: "relative",
    border: "2px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    overflow: "hidden",
    background: "rgba(255,255,255,0.02)",
    cursor: "pointer",
    transition: "border-color 0.15s ease",
  },
  pairCardSelected: {
    borderColor: GOLD,
    boxShadow: `0 0 0 1px ${GOLD}`,
  },
  pairCardLocked: {
    opacity: 0.45,
    cursor: "not-allowed",
  },
  pairCheckmark: {
    position: "absolute",
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: GOLD,
    color: "#120b02",
    fontWeight: 900,
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  pairThumbWrap: {
    width: "100%",
    aspectRatio: "1 / 1",
    background: "#000",
  },
  pairThumb: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  pairNameInput: {
    width: "100%",
    boxSizing: "border-box",
    background: "transparent",
    border: "none",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    color: "#eee",
    fontSize: 12.5,
    textAlign: "center",
    padding: "7px 6px 2px",
    outline: "none",
  },
  pairMeta: {
    display: "block",
    textAlign: "center",
    color: "#777",
    fontSize: 10.5,
    paddingBottom: 7,
  },

  // ---- مدة الجولة ----
  durationRow: { display: "flex", gap: 10, flexWrap: "wrap" },
  durationButton: {
    padding: "11px 18px",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13.5,
    border: "1px solid #333",
    background: "rgba(255,255,255,0.03)",
    color: "#ddd",
  },
  durationButtonSelected: {
    border: `2px solid ${GOLD}`,
    background: GOLD_SOFT,
    color: GOLD,
  },
  disabledLook: { opacity: 0.4, cursor: "not-allowed" },

  // ---- أزرار التحكم ----
  controlBar: { display: "flex", gap: 14, flexWrap: "wrap" },
  primaryButton: {
    padding: "15px 32px",
    fontSize: 16,
    background: `linear-gradient(135deg, #a86f12, ${GOLD}, #a86f12)`,
    border: "none",
    borderRadius: 12,
    color: "#120b02",
    fontWeight: 900,
    cursor: "pointer",
  },
  primaryButtonDisabled: {
    background: "#2a2a2e",
    color: "#777",
    cursor: "not-allowed",
  },
  secondaryButton: {
    padding: "15px 26px",
    fontSize: 14,
    background: "transparent",
    border: `1px solid ${BORDER}`,
    borderRadius: 12,
    color: GOLD,
    cursor: "pointer",
  },

  // ---- اللاعبون ----
  playersScroll: {
    maxHeight: 460,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    paddingRight: 4,
  },
  playerRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.03)",
  },
  playerAvatar: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    objectFit: "cover",
    border: `1px solid ${BORDER}`,
  },
  playerAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: GOLD_SOFT,
    color: GOLD,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    fontSize: 13,
  },
  playerName: { flex: 1, fontSize: 13.5, color: "#eee" },
  playerScore: { color: GOLD, fontWeight: 700, fontSize: 13 },
};
