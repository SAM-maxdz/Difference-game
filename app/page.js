"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { db, auth } from "../lib/firebase";
import {
  ref,
  set,
  update,
  onValue,
  onDisconnect,
  remove,
} from "firebase/database";
import {
  onAuthStateChanged,
  signInAnonymously,
} from "firebase/auth";

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
  const router = useRouter();

  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(avatars[0]);
  const [joined, setJoined] = useState(false);
  const [players, setPlayers] = useState({});
  const [gameStatus, setGameStatus] = useState("waiting");
  const [locked, setLocked] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [muted, setMuted] = useState(false);

  const playerIdRef = useRef(null);
  const musicRef = useRef(null);

  // قراءة تفضيل كتم الموسيقى من الجلسة (يبقى متزامناً مع صفحة اللعبة)
  useEffect(() => {
    setMuted(sessionStorage.getItem("musicMuted") === "true");
  }, []);

  // تشغيل/إيقاف موسيقى الخلفية — نفس الملف المستخدم داخل اللعبة،
  // فتبدأ من واجهة الدخول وتستمر بلا انقطاع محسوس عبر كل الموقع.
  useEffect(() => {
    if (!musicRef.current) return;
    musicRef.current.volume = 0.25;
    if (muted) {
      musicRef.current.pause();
    } else {
      musicRef.current.play().catch(() => {});
    }
  }, [muted]);

  function toggleMuted() {
    setMuted((m) => {
      const next = !m;
      sessionStorage.setItem("musicMuted", String(next));
      return next;
    });
  }

  // تسجيل دخول مجهول (Anonymous) تلقائي — لازم قبل أي قراءة/كتابة
  // لأن قواعد Firebase الآن تمنع أي وصول بدون تسجيل دخول.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthReady(true);
      } else {
        signInAnonymously(auth).catch(() => {});
      }
    });
    return () => unsubscribe();
  }, []);

  // إنشاء ID ثابت للاعب
  useEffect(() => {
    let id = sessionStorage.getItem("playerId");

    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem("playerId", id);
    }

    playerIdRef.current = id;
  }, []);

  // مراقبة اللاعبين الموجودين
  useEffect(() => {
    if (!authReady) return;

    const playersRef = ref(db, "players");

    const unsubscribe = onValue(
      playersRef,
      (snapshot) => {
        setPlayers(snapshot.val() || {});
      }
    );

    return () => unsubscribe();
  }, [authReady]);

  // نبضة حياة (heartbeat): طول ما اللاعب داخل قاعة الانتظار، نعيد
  // كتابة اسمه وصورته ووقت آخر ظهور له كل 15 ثانية — وليس وقت
  // الظهور فقط. هذا يصلّح تلقائياً حالة رجوعه من خلفية سفاري بعد
  // ما ينقطع اتصاله فعلياً وتُمسح بياناته بالكامل (onDisconnect)،
  // وأيضاً يسمح للوحة المضيف بمعرفة اللاعبين "المعلّقين" فعلاً.
  useEffect(() => {
    if (!joined || !authReady) return;
    const id = playerIdRef.current;
    if (!id) return;

    const playerRef = ref(db, `players/${id}`);

    const sendHeartbeat = () => {
      update(playerRef, {
        name: name.trim(),
        avatar,
        lastSeen: Date.now(),
      });
      // نعيد تسجيل الحذف التلقائي عند الانقطاع في كل نبضة، لأن أي
      // اتصال جديد (بعد رجوع من الخلفية) يفقد التسجيل القديم.
      onDisconnect(playerRef).remove();
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 15000);
    return () => clearInterval(interval);
  }, [joined, authReady]);

  // استعادة حالة "joined" تلقائياً بعد تحديث الصفحة (refresh)
  // إذا كان اللاعب موجوداً أصلاً في قائمة اللاعبين بقاعدة البيانات،
  // بدل ما يرجع لشاشة إدخال الاسم والصورة من الصفر ويفقد مكانه.
  useEffect(() => {
    if (joined) return;
    const id = playerIdRef.current;
    if (!id) return;
    if (players[id]) {
      setJoined(true);
    }
  }, [players, joined]);

  // مراقبة حالة اللعبة
  useEffect(() => {
    if (!authReady) return;

    const statusRef = ref(db, "game/status");

    const unsubscribe = onValue(
      statusRef,
      (snapshot) => {
        setGameStatus(
          snapshot.val() || "waiting"
        );
      }
    );

    return () => unsubscribe();
  }, [authReady]);

  // مراقبة حالة قفل اللعبة — لها أولوية على كل شي آخر
  useEffect(() => {
    if (!authReady) return;

    const lockedRef = ref(db, "game/locked");

    const unsubscribe = onValue(lockedRef, (snapshot) => {
      setLocked(snapshot.val() === true);
    });

    return () => unsubscribe();
  }, [authReady]);

  // =====================================================
  // الانتقال إلى اللعبة
  // =====================================================
  //
  // مهم:
  // عندما يضغط المضيف Start تصبح الحالة countdown
  // لذلك ننتقل إلى /game فورًا.
  //
  // GamePage هو الذي سيعرض:
  // 5 → 4 → 3 → 2 → 1
  // ثم الصور.
  //
  useEffect(() => {
    if (joined && !locked && gameStatus !== "waiting") {
      router.push("/game");
    }
  }, [
    joined,
    locked,
    gameStatus,
    router,
  ]);

  // دخول اللاعب
  function handleJoin() {
    const id = playerIdRef.current;

    if (!id || !name.trim() || !authReady) {
      return;
    }

    const playerRef = ref(
      db,
      `players/${id}`
    );

    set(playerRef, {
      name: name.trim(),
      avatar,
      joinedAt: Date.now(),
    });

    // حذف اللاعب تلقائيًا عند انقطاع الاتصال
    onDisconnect(playerRef).remove();

    setJoined(true);
  }

  // تغيير الاسم أو الصورة
  function handleChangeInfo() {
    const id = playerIdRef.current;

    if (id) {
      remove(
        ref(
          db,
          `players/${id}`
        )
      );
    }

    setJoined(false);
  }

  const playersList =
    Object.entries(players);

  // =====================================================
  // اللعبة مقفلة — أولوية مطلقة على أي شاشة أخرى
  // =====================================================

  if (locked) {
    return (
      <main className="casino">
        <div className="stars"></div>
        <div className="glow glow1"></div>
        <div className="glow glow2"></div>
        <audio ref={musicRef} loop src="/sounds/casino-music.mp3" />
        <button onClick={toggleMuted} style={styles.muteBtn}>
          {muted ? "🔇" : "🔊"}
        </button>
        <section className="hero">
          <div className="logo">♠ ♥ ♦ ♣</div>
          <h1 className="brand-title">
            <span className="brand-text">FHDxNJD</span>
          </h1>
          <div
            style={{
              marginTop: 30,
              fontSize: 40,
            }}
          >
            🔒
          </div>
          <p
            style={{
              color: "#f4ce67",
              fontSize: 18,
              letterSpacing: 2,
              marginTop: 10,
            }}
          >
            اللعبة مقفلة الآن
          </p>
          <p style={{ color: "rgba(255,255,255,0.45)" }}>
            انتهت الجلسة الحالية. تواصل مع المضيف إذا كنت تنتظر جولة جديدة.
          </p>
        </section>
      </main>
    );
  }

  // =====================================================
  // WAITING LOBBY
  // =====================================================

  if (joined) {
    return (
      <main className="casino">
        <div className="stars"></div>

        <div className="glow glow1"></div>

        <div className="glow glow2"></div>

        <audio ref={musicRef} loop src="/sounds/casino-music.mp3" />
        <button onClick={toggleMuted} style={styles.muteBtn}>
          {muted ? "🔇" : "🔊"}
        </button>

        <section className="lobby">

          <div className="brand-small">
            FHDxNJD
          </div>

          <div className="lobby-header">
            <span>
              PRIVATE TABLE
            </span>

            <strong>
              {playersList.length} / 10 PLAYERS
            </strong>
          </div>

          <h2>
            WAITING LOBBY
          </h2>

          {playersList.map(
            ([id, player]) => (
              <div
                className="player-seat"
                key={id}
              >
                <div className="seat-avatar">
                  <img
                    src={player.avatar}
                    alt="avatar"
                  />
                </div>

                <div>
                  <strong>
                    {player.name}
                  </strong>

                  <span>
                    {id ===
                    playerIdRef.current
                      ? "YOU"
                      : "PLAYER"}
                  </span>
                </div>
              </div>
            )
          )}

          <div className="waiting">
            Waiting for the host to start the game...
          </div>

          <button
            className="back-button"
            onClick={
              handleChangeInfo
            }
          >
            CHANGE NAME / AVATAR
          </button>

        </section>
      </main>
    );
  }

  // =====================================================
  // JOIN SCREEN
  // =====================================================

  return (
    <main className="casino">

      <div className="stars"></div>

      <div className="glow glow1"></div>

      <div className="glow glow2"></div>

      <audio ref={musicRef} loop src="/sounds/casino-music.mp3" />
      <button onClick={toggleMuted} style={styles.muteBtn}>
        {muted ? "🔇" : "🔊"}
      </button>

      <section className="hero">

        <div className="logo">
          ♠ ♥ ♦ ♣
        </div>

        <h1 className="brand-title">
          <span className="brand-text">
            FHDxNJD
          </span>
        </h1>

        <div className="subtitle">
          PRIVATE GAME
        </div>

        <p>
          Wait for the host to start the game.
        </p>

        <div className="join-card">

          <label>
            اسم اللاعب
          </label>

          <input
            type="text"
            placeholder="Enter your name"
            value={name}
            onChange={(event) =>
              setName(
                event.target.value
              )
            }
            maxLength={16}
          />

          <div className="avatar-title">
            اختر صورتك الرمزية
          </div>

          <div className="avatars">

            {avatars.map(
              (item) => (
                <button
                  key={item}
                  className={`avatar-choice ${
                    avatar === item
                      ? "selected"
                      : ""
                  }`}
                  onClick={() =>
                    setAvatar(item)
                  }
                >
                  <img
                    src={item}
                    alt="avatar option"
                  />
                </button>
              )
            )}

          </div>

          <div className="selected-avatar">

            <img
              src={avatar}
              alt="selected avatar"
            />

          </div>

          <button
            className="join-button"
            disabled={
              !name.trim() || !authReady
            }
            onClick={
              handleJoin
            }
          >
            JOIN TABLE
          </button>

          <div className="private">
            🔒 PRIVATE ROOM
          </div>

        </div>

        <div className="players">
          UP TO 10 PLAYERS
        </div>

      </section>

    </main>
  );
}

const styles = {
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
};
