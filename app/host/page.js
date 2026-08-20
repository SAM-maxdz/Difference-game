"use client";

import { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { ref, onValue, set } from "firebase/database";

const HOST_PASSWORD = "055105";

export default function HostPage() {
  const [authorized, setAuthorized] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [error, setError] = useState("");

  const [players, setPlayers] = useState({});
  const [status, setStatus] = useState("waiting");
  const [imagePairs, setImagePairs] = useState({});
  const [selectedPairId, setSelectedPairId] = useState("");

  useEffect(() => {
    const saved = sessionStorage.getItem("hostAuthorized");
    if (saved === "true") setAuthorized(true);
  }, []);

  useEffect(() => {
    if (!authorized) return;

    const playersRef = ref(db, "players");

    const unsubscribe = onValue(playersRef, (snapshot) => {
      setPlayers(snapshot.val() || {});
    });

    return () => unsubscribe();
  }, [authorized]);

  useEffect(() => {
    if (!authorized) return;

    const statusRef = ref(db, "game/status");

    const unsubscribe = onValue(statusRef, (snapshot) => {
      setStatus(snapshot.val() || "waiting");
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

  function handleLogin() {
    if (passwordInput === HOST_PASSWORD) {
      setAuthorized(true);
      sessionStorage.setItem("hostAuthorized", "true");
      setError("");
    } else {
      setError("كلمة المرور غير صحيحة");
    }
  }

  async function startGame() {
    if (!selectedPairId) {
      alert("يرجى اختيار مجموعة صور أولاً");
      return;
    }

    if (status === "countdown" || status === "playing") {
      return;
    }

    const countdownStartedAt = Date.now();

    /*
      نرسل كل معلومات الجولة في Firebase
      حتى تستقبلها جميع الأجهزة في نفس الوقت.
    */

    await set(ref(db, "game/currentPairId"), selectedPairId);

    await set(
      ref(db, "game/countdownStartedAt"),
      countdownStartedAt
    );

    await set(
      ref(db, "game/startedAt"),
      null
    );

    await set(
      ref(db, "game/status"),
      "countdown"
    );

    /*
      بعد 5 ثوانٍ يبدأ اللعب عند الجميع.
    */
    setTimeout(async () => {
      const startedAt = Date.now();

      await set(
        ref(db, "game/startedAt"),
        startedAt
      );

      await set(
        ref(db, "game/status"),
        "playing"
      );
    }, 5000);
  }

  async function resetGame() {
    await set(ref(db, "game/status"), "waiting");
    await set(ref(db, "game/countdownStartedAt"), null);
    await set(ref(db, "game/startedAt"), null);
    await set(ref(db, "game/currentPairId"), null);
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
        <h2 style={{ color: "#f8d46b" }}>
          تسجيل دخول المضيف
        </h2>

        <input
          type="password"
          placeholder="كلمة المرور"
          value={passwordInput}
          onChange={(e) =>
            setPasswordInput(e.target.value)
          }
          onKeyDown={(e) =>
            e.key === "Enter" && handleLogin()
          }
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

        {error && (
          <p style={{ color: "#e04b3f" }}>
            {error}
          </p>
        )}
      </main>
    );
  }

  const playersList = Object.entries(players);
  const pairsList = Object.entries(imagePairs);

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
      <h1 style={{ color: "#f8d46b" }}>
        لوحة تحكم المضيف
      </h1>

      <p>
        حالة اللعبة:{" "}
        <strong>
          {status === "countdown"
            ? "العد التنازلي..."
            : status === "playing"
            ? "جارية"
            : "انتظار"}
        </strong>
      </p>

      <p>
        عدد اللاعبين: {playersList.length} / 10
      </p>

      <ul>
        {playersList.map(([id, p]) => (
          <li key={id}>
            {p.name}
          </li>
        ))}
      </ul>

      <h2
        style={{
          color: "#f8d46b",
          marginTop: 30,
        }}
      >
        اختر مجموعة الصور
      </h2>

      {pairsList.length === 0 ? (
        <p style={{ color: "#999" }}>
          لا توجد أي مجموعة صور محفوظة. يرجى الانتقال إلى صفحة
          /admin/differences لإضافة مجموعة صور جديدة.
        </p>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            maxWidth: 500,
          }}
        >
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
                  selectedPairId === id
                    ? "2px solid #f8d46b"
                    : "1px solid #333",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="pair"
                checked={
                  selectedPairId === id
                }
                onChange={() =>
                  setSelectedPairId(id)
                }
              />

              <span>
                المستوى {pair.level} ({pair.name}) —{" "}
                {pair.differences?.length || 0} اختلافات —{" "}
                {pair.timeLimit} ثانية
              </span>
            </label>
          ))}
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 15,
          marginTop: 25,
        }}
      >
        <button
          onClick={startGame}
          disabled={
            status === "playing" ||
            status === "countdown"
          }
          style={{
            padding: "15px 30px",
            fontSize: 18,
            background:
              status === "playing" ||
              status === "countdown"
                ? "#555"
                : "linear-gradient(135deg, #a86f12, #f7d574, #a86f12)",
            border: "none",
            borderRadius: 10,
            color:
              status === "playing" ||
              status === "countdown"
                ? "#aaa"
                : "#120b02",
            fontWeight: 900,
            cursor:
              status === "playing" ||
              status === "countdown"
                ? "not-allowed"
                : "pointer",
          }}
        >
          {status === "countdown"
            ? "العد التنازلي..."
            : status === "playing"
            ? "اللعبة جارية"
            : "بدء اللعبة"}
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
          إعادة تعيين
        </button>
      </div>
    </main>
  );
}
