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

    if (saved === "true") {
      setAuthorized(true);
    }
  }, []);

  // ---------- اللاعبين ----------
  useEffect(() => {
    if (!authorized) return;

    const playersRef = ref(db, "players");

    const unsubscribe = onValue(
      playersRef,
      (snapshot) => {
        setPlayers(snapshot.val() || {});
      }
    );

    return () => unsubscribe();
  }, [authorized]);

  // ---------- حالة اللعبة ----------
  useEffect(() => {
    if (!authorized) return;

    const statusRef = ref(db, "game/status");

    const unsubscribe = onValue(
      statusRef,
      (snapshot) => {
        setStatus(
          snapshot.val() || "waiting"
        );
      }
    );

    return () => unsubscribe();
  }, [authorized]);

  // ---------- مجموعات الصور ----------
  useEffect(() => {
    if (!authorized) return;

    const pairsRef = ref(
      db,
      "imagePairs"
    );

    const unsubscribe = onValue(
      pairsRef,
      (snapshot) => {
        setImagePairs(
          snapshot.val() || {}
        );
      }
    );

    return () => unsubscribe();
  }, [authorized]);

  // ---------- تسجيل دخول المضيف ----------
  function handleLogin() {
    if (
      passwordInput ===
      HOST_PASSWORD
    ) {
      setAuthorized(true);

      sessionStorage.setItem(
        "hostAuthorized",
        "true"
      );

      setError("");
    } else {
      setError(
        "كلمة المرور غير صحيحة"
      );
    }
  }

  // =====================================================
  // بدء اللعبة مع العد التنازلي
  // =====================================================

  async function startGame() {
    if (!selectedPairId) {
      alert(
        "يرجى اختيار مجموعة صور أولاً"
      );
      return;
    }

    if (status === "playing") {
      return;
    }

    const countdownStartedAt =
      Date.now();

    // نحدد الصور أولاً
    await set(
      ref(db, "game/currentPairId"),
      selectedPairId
    );

    // نرسل وقت بداية العد لجميع الأجهزة
    await set(
      ref(
        db,
        "game/countdownStartedAt"
      ),
      countdownStartedAt
    );

    // حالة العد التنازلي
    await set(
      ref(db, "game/status"),
      "countdown"
    );

    /*
      ننتظر 5 ثوانٍ.

      جميع الأجهزة تقرأ countdownStartedAt
      وتقوم بالعد حسب وقت Firebase/الجهاز.

      بعد انتهاء العد نبدأ الجولة فعلياً.
    */

    setTimeout(async () => {
      const startedAt =
        Date.now();

      await set(
        ref(
          db,
          "game/startedAt"
        ),
        startedAt
      );

      await set(
        ref(
          db,
          "game/status"
        ),
        "playing"
      );
    }, 5000);
  }

  // =====================================================
  // إعادة اللعبة إلى الانتظار
  // =====================================================

  async function resetGame() {
    await set(
      ref(db, "game/status"),
      "waiting"
    );

    await set(
      ref(db, "game/startedAt"),
      null
    );

    await set(
      ref(
        db,
        "game/countdownStartedAt"
      ),
      null
    );
  }

  // =====================================================
  // صفحة تسجيل دخول المضيف
  // =====================================================

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
          fontFamily:
            "Arial, sans-serif",
          gap: 15,
          padding: 20,
        }}
      >
        <h2
          style={{
            color: "#f8d46b",
          }}
        >
          تسجيل دخول المضيف
        </h2>

        <input
          type="password"
          placeholder="كلمة المرور"
          value={
            passwordInput
          }
          onChange={(e) =>
            setPasswordInput(
              e.target.value
            )
          }
          onKeyDown={(e) =>
            e.key === "Enter" &&
            handleLogin()
          }
          style={{
            padding: 14,
            borderRadius: 10,
            border:
              "1px solid #d8b45b",
            background:
              "rgba(255,255,255,0.05)",
            color: "white",
            textAlign:
              "center",
          }}
        />

        <button
          onClick={
            handleLogin
          }
          style={{
            padding:
              "12px 28px",
            background:
              "linear-gradient(135deg, #a86f12, #f7d574, #a86f12)",
            border: "none",
            borderRadius: 10,
            color: "#120b02",
            fontWeight: 900,
            cursor:
              "pointer",
          }}
        >
          دخول
        </button>

        {error && (
          <p
            style={{
              color:
                "#e04b3f",
            }}
          >
            {error}
          </p>
        )}
      </main>
    );
  }

  const playersList =
    Object.entries(players);

  const pairsList =
    Object.entries(
      imagePairs
    );

  // =====================================================
  // لوحة تحكم المضيف
  // =====================================================

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#030302",
        color: "white",
        padding: 40,
        fontFamily:
          "Arial, sans-serif",
      }}
    >
      <h1
        style={{
          color:
            "#f8d46b",
        }}
      >
        لوحة تحكم المضيف
      </h1>

      <p>
        حالة اللعبة:{" "}
        <strong
          style={{
            color:
              status ===
              "playing"
                ? "#00ff88"
                : status ===
                  "countdown"
                ? "#f8d46b"
                : "white",
          }}
        >
          {status ===
          "countdown"
            ? "العد التنازلي"
            : status ===
              "playing"
            ? "اللعبة تعمل"
            : "انتظار"}
        </strong>
      </p>

      <p>
        عدد اللاعبين:{" "}
        <strong>
          {playersList.length}
        </strong>{" "}
        / 10
      </p>

      {/* ---------- اللاعبين ---------- */}

      <div
        style={{
          marginTop: 20,
          padding: 20,
          border:
            "1px solid #333",
          borderRadius: 15,
          maxWidth: 600,
        }}
      >
        <h2
          style={{
            color:
              "#f8d46b",
            marginTop: 0,
          }}
        >
          اللاعبين
        </h2>

        {playersList.length ===
        0 ? (
          <p
            style={{
              color:
                "#999",
            }}
          >
            لا يوجد لاعبين
            حتى الآن
          </p>
        ) : (
          <ul>
            {playersList.map(
              ([id, p]) => (
                <li
                  key={id}
                  style={{
                    marginBottom: 8,
                  }}
                >
                  {p.avatar && (
                    <img
                      src={
                        p.avatar
                      }
                      alt=""
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius:
                          "50%",
                        verticalAlign:
                          "middle",
                        marginLeft: 8,
                      }}
                    />
                  )}

                  {p.name}
                </li>
              )
            )}
          </ul>
        )}
      </div>

      {/* ---------- اختيار الصور ---------- */}

      <h2
        style={{
          color:
            "#f8d46b",
          marginTop: 30,
        }}
      >
        اختر مجموعة الصور
      </h2>

      {pairsList.length ===
      0 ? (
        <p
          style={{
            color:
              "#999",
          }}
        >
          لا توجد أي مجموعة
          صور محفوظة. يرجى
          الانتقال إلى صفحة
          /admin/differences
          لإضافة مجموعة صور
          جديدة.
        </p>
      ) : (
        <div
          style={{
            display:
              "flex",
            flexDirection:
              "column",
            gap: 10,
            maxWidth: 600,
          }}
        >
          {pairsList.map(
            ([id, pair]) => (
              <label
                key={id}
                style={{
                  display:
                    "flex",
                  alignItems:
                    "center",
                  gap: 10,
                  padding: 12,
                  border:
                    selectedPairId ===
                    id
                      ? "2px solid #f8d46b"
                      : "1px solid #333",
                  borderRadius:
                    10,
                  cursor:
                    "pointer",
                  background:
                    selectedPairId ===
                    id
                      ? "rgba(248,212,107,0.08)"
                      : "transparent",
                }}
              >
                <input
                  type="radio"
                  name="pair"
                  checked={
                    selectedPairId ===
                    id
                  }
                  onChange={() =>
                    setSelectedPairId(
                      id
                    )
                  }
                />

                <span>
                  المستوى{" "}
                  {pair.level}{" "}
                  ({pair.name})
                  {" — "}
                  {pair
                    .differences
                    ?.length ||
                    0}{" "}
                  اختلافات
                  {" — "}
                  {pair.timeLimit}{" "}
                  ثانية
                </span>
              </label>
            )
          )}
        </div>
      )}

      {/* ================================================= */}
      {/* أزرار التحكم */}
      {/* ================================================= */}

      <div
        style={{
          display:
            "flex",
          gap: 15,
          marginTop: 25,
          flexWrap:
            "wrap",
        }}
      >
        <button
          onClick={
            startGame
          }
          disabled={
            status ===
              "playing" ||
            status ===
              "countdown"
          }
          style={{
            padding:
              "15px 30px",
            fontSize: 18,
            background:
              status ===
                "playing" ||
              status ===
                "countdown"
                ? "#555"
                : "linear-gradient(135deg, #a86f12, #f7d574, #a86f12)",
            border: "none",
            borderRadius: 10,
            color:
              status ===
                "playing" ||
              status ===
                "countdown"
                ? "#aaa"
                : "#120b02",
            fontWeight: 900,
            cursor:
              status ===
                "playing" ||
              status ===
                "countdown"
                ? "not-allowed"
                : "pointer",
          }}
        >
          {status ===
          "countdown"
            ? "⏳ العد التنازلي..."
            : status ===
              "playing"
            ? "🎮 اللعبة تعمل"
            : "▶ بدء اللعبة"}
        </button>

        <button
          onClick={
            resetGame
          }
          style={{
            padding:
              "15px 30px",
            fontSize: 18,
            background:
              "transparent",
            border:
              "1px solid #d8b45b",
            borderRadius: 10,
            color:
              "#d8b45b",
            cursor:
              "pointer",
          }}
        >
          إعادة تعيين
        </button>
      </div>

      {/* ---------- شرح الحالة ---------- */}

      {status ===
        "countdown" && (
        <div
          style={{
            marginTop: 25,
            padding: 18,
            maxWidth: 600,
            border:
              "1px solid rgba(248,212,107,0.35)",
            borderRadius: 12,
            background:
              "rgba(248,212,107,0.05)",
            color:
              "#f8d46b",
          }}
        >
          🎬 العد التنازلي
          يعمل الآن عند جميع
          اللاعبين...
          <br />
          <span
            style={{
              color:
                "#aaa",
              fontSize: 14,
            }}
          >
            ستظهر الصور
            تلقائياً بعد انتهاء
            العد.
          </span>
        </div>
      )}
    </main>
  );
}
