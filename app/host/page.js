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

  if (!authorized) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#030302",
          color: "white",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Arial, sans-serif",
          gap: 15,
          padding: 20,
        }}
      >
        <h2 style={{ color: "#f8d46b" }}>تسجيل دخول المضيف</h2>

        <input
          type="password"
          placeholder="كلمة المرور"
          value={passwordInput}
          onChange={(e) => setPasswordInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          style={{
            padding: 14,
            borderRadius: 10,
            border: "1px solid #d8b45b",
            background: "rgba(255,255,255,0.05)",
            color: "white",
            textAlign: "center",
          }}
        />

        <button
          onClick={handleLogin}
          style={{
            padding: "12px 28px",
            background:
              "linear-gradient(135deg, #a86f12, #f7d574, #a86f12)",
            border: "none",
            borderRadius: 10,
            color: "#120b02",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          دخول
        </button>

        {error && <p style={{ color: "#e04b3f" }}>{error}</p>}
      </main>
    );
  }

  const playersList = Object.entries(players);
  const pairsList = Object.entries(imagePairs);
  const roundLocked = phase === "countdown" || phase === "playing" || phase === "revealing";

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ color: "#f8d46b" }}>لوحة تحكم المضيف</h1>
        <button
          onClick={handleLogout}
          style={{
            background: "transparent",
            border: "1px solid #555",
            color: "#aaa",
            borderRadius: 8,
            padding: "8px 16px",
            cursor: "pointer",
          }}
        >
          تسجيل خروج
        </button>
      </div>

      <p style={{ fontSize: 16 }}>
        حالة الجولة: <strong style={{ color: "#f8d46b" }}>{phaseLabels[phase]}</strong>
      </p>

      <p>عدد اللاعبين: {playersList.length} / 10</p>

      <ul>
        {playersList.map(([id, p]) => (
          <li key={id}>
            {p.name} — {p.score || 0} نقطة
          </li>
        ))}
      </ul>

      <h2 style={{ color: "#f8d46b", marginTop: 30 }}>1. اختر الصورة</h2>

      {pairsList.length === 0 ? (
        <p style={{ color: "#999" }}>
          لا توجد أي مجموعة صور محفوظة. يرجى الانتقال إلى صفحة
          /admin/differences لإضافة مجموعة صور جديدة.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 500 }}>
          {pairsList.map(([id, pair]) => (
            <label
              key={id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 12,
                borderRadius: 10,
                border:
                  selectedPairId === id ? "2px solid #f8d46b" : "1px solid #333",
                cursor: roundLocked ? "not-allowed" : "pointer",
                opacity: roundLocked ? 0.5 : 1,
              }}
            >
              <input
                type="radio"
                name="pair"
                disabled={roundLocked}
                checked={selectedPairId === id}
                onChange={() => setSelectedPairId(id)}
              />
              <span>
                المستوى {pair.level} ({pair.name}) —{" "}
                {pair.differences?.length || 0} اختلافات
              </span>
            </label>
          ))}
        </div>
      )}

      <h2 style={{ color: "#f8d46b", marginTop: 30 }}>2. اختر مدة الجولة</h2>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", maxWidth: 560 }}>
        {DURATION_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            disabled={roundLocked}
            onClick={() => setSelectedDuration(opt.value)}
            style={{
              padding: "12px 18px",
              borderRadius: 10,
              cursor: roundLocked ? "not-allowed" : "pointer",
              fontWeight: 700,
              opacity: roundLocked ? 0.5 : 1,
              border:
                selectedDuration === opt.value
                  ? "2px solid #f8d46b"
                  : "1px solid #444",
              background:
                selectedDuration === opt.value
                  ? "rgba(248,212,107,0.15)"
                  : "transparent",
              color: selectedDuration === opt.value ? "#f8d46b" : "#ddd",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 15, marginTop: 30 }}>
        <button
          onClick={startGame}
          disabled={!canStart}
          style={{
            padding: "15px 30px",
            fontSize: 18,
            background: canStart
              ? "linear-gradient(135deg, #a86f12, #f7d574, #a86f12)"
              : "#333",
            border: "none",
            borderRadius: 10,
            color: canStart ? "#120b02" : "#777",
            fontWeight: 900,
            cursor: canStart ? "pointer" : "not-allowed",
          }}
        >
          {startButtonLabel}
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
          إعادة تعيين اللعبة بالكامل
        </button>
      </div>
    </main>
  );
}
