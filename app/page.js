"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { db, auth } from "../lib/firebase";
import {
  ref,
  set,
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
  const [authReady, setAuthReady] = useState(false);

  const playerIdRef = useRef(null);

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
    if (joined && gameStatus !== "waiting") {
      router.push("/game");
    }
  }, [
    joined,
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
  // WAITING LOBBY
  // =====================================================

  if (joined) {
    return (
      <main className="casino">
        <div className="stars"></div>

        <div className="glow glow1"></div>

        <div className="glow glow2"></div>

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
