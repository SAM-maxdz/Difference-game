"use client";

import { useState, useEffect, useRef } from "react";
import { db } from "../../lib/firebase";
import { ref, onValue, set } from "firebase/database";

const ATTEMPTS_START = 5;
const POINTS_PER_DIFF = 50;
const REVEAL_BEFORE_LEADERBOARD = 5;

export default function GamePage() {
  const [pairId, setPairId] = useState(null);
  const [pair, setPair] = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const [remaining, setRemaining] = useState(0);

  const [countdown, setCountdown] = useState(null);

  const [found, setFound] = useState({});
  const [attemptsLeft, setAttemptsLeft] =
    useState(ATTEMPTS_START);
  const [score, setScore] = useState(0);

  const [flashRed, setFlashRed] = useState(false);
  const [locked, setLocked] = useState(false);
  const [roundEnded, setRoundEnded] = useState(false);

  const [players, setPlayers] = useState({});
  const [showLeaderboard, setShowLeaderboard] =
    useState(false);

  const [muted, setMuted] = useState(false);
  const [zoomSrc, setZoomSrc] = useState(null);
  const [joinToast, setJoinToast] = useState(null);

  const playerIdRef = useRef(null);
  const knownPlayerIds = useRef(new Set());

  const musicRef = useRef(null);
  const correctSoundRef = useRef(null);
  const wrongSoundRef = useRef(null);
  const wakeLockRef = useRef(null);

  // =========================================================
  // منع إغلاق/إعتام الشاشة طول ما صفحة اللعبة مفتوحة
  //
  // بدون هذا، متصفح الهاتف يوقف تحديثات Firebase تلقائياً
  // إذا الشاشة قفلت أو التبويب راح للخلفية، فتضيع تحديثات
  // اللاعبين (مثل انضمام لاعب جديد) حتى ترجع تفتحها يدوياً.
  // =========================================================

  useEffect(() => {
    let released = false;

    async function requestWakeLock() {
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current =
            await navigator.wakeLock.request("screen");
        }
      } catch (err) {
        // بعض المتصفحات (مثل سفاري القديم) لا تدعمها،
        // نتجاهل الخطأ ونكمل عادي بدون Wake Lock.
      }
    }

    function handleVisibilityChange() {
      if (
        document.visibilityState === "visible" &&
        !released &&
        !wakeLockRef.current
      ) {
        requestWakeLock();
      }
    }

    requestWakeLock();

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      released = true;
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, []);

  // =========================================================
  // رقم اللاعب
  // =========================================================

  useEffect(() => {
    playerIdRef.current =
      sessionStorage.getItem("playerId");
  }, []);

  // =========================================================
  // حالة اللعبة
  // =========================================================

  useEffect(() => {
    const gameRef = ref(db, "game");

    const unsubscribe = onValue(
      gameRef,
      (snapshot) => {
        const data = snapshot.val() || {};

        setPairId(
          data.currentPairId || null
        );

        setStartedAt(
          data.startedAt || null
        );
      }
    );

    return () => unsubscribe();
  }, []);

  // =========================================================
  // العد التنازلي 5 4 3 2 1
  // =========================================================

  useEffect(() => {
    const gameRef = ref(db, "game");

    let interval = null;

    const unsubscribe = onValue(
      gameRef,
      (snapshot) => {
        const data = snapshot.val() || {};

        if (
          data.status !== "countdown" ||
          !data.countdownStartedAt
        ) {
          setCountdown(null);

          if (interval) {
            clearInterval(interval);
            interval = null;
          }

          return;
        }

        const countdownStartedAt =
          Number(data.countdownStartedAt);

        const updateCountdown = () => {
          const elapsed =
            (Date.now() -
              countdownStartedAt) /
            1000;

          const value =
            5 - Math.floor(elapsed);

          if (value >= 1) {
            setCountdown(value);
          } else {
            setCountdown(null);

            if (interval) {
              clearInterval(interval);
              interval = null;
            }
          }
        };

        if (interval) {
          clearInterval(interval);
        }

        updateCountdown();

        interval = setInterval(
          updateCountdown,
          100
        );
      }
    );

    return () => {
      if (interval) {
        clearInterval(interval);
      }

      unsubscribe();
    };
  }, []);

  // =========================================================
  // بيانات الصور
  // =========================================================

  useEffect(() => {
    if (!pairId) {
      setPair(null);
      return;
    }

    const pairRef = ref(
      db,
      `imagePairs/${pairId}`
    );

    const unsubscribe = onValue(
      pairRef,
      (snapshot) => {
        setPair(
          snapshot.val() || null
        );
      }
    );

    return () => unsubscribe();
  }, [pairId]);

  // =========================================================
  // تصفير الجولة الجديدة
  // =========================================================

  useEffect(() => {
    if (
      !pairId ||
      !startedAt ||
      !playerIdRef.current
    ) {
      return;
    }

    const lastRoundTime =
      sessionStorage.getItem(
        "lastRoundTime"
      );

    if (
      lastRoundTime !==
      String(startedAt)
    ) {
      sessionStorage.setItem(
        "lastRoundTime",
        String(startedAt)
      );

      // ملاحظة: النقاط لا تُصفَّر هنا عمدًا،
      // لتبقى تراكمية عبر كل الجولات ويكون
      // التصنيف تصنيفًا عامًا للعبة كلها.
      setFound({});
      setAttemptsLeft(
        ATTEMPTS_START
      );
      setLocked(false);
      setRoundEnded(false);
      setShowLeaderboard(false);
      setRemaining(0);

      set(
        ref(
          db,
          `players/${playerIdRef.current}/attemptsLeft`
        ),
        ATTEMPTS_START
      );
    }
  }, [pairId, startedAt]);

  // =========================================================
  // وقت اللعبة
  //
  // مهم جداً:
  // يبدأ بعد انتهاء عداد 5 ثواني.
  //
  // إذا كان countdownStartedAt موجوداً:
  // بداية اللعب الحقيقية = countdownStartedAt + 5000
  //
  // =========================================================

  useEffect(() => {
    if (!pair) {
      return;
    }

    const gameRef = ref(db, "game");

    let interval = null;

    const unsubscribe = onValue(
      gameRef,
      (snapshot) => {
        const data = snapshot.val() || {};

        let actualStart = null;

        // إذا المضيف يرسل playStartedAt
        // نستخدمه مباشرة لأنه يمثل بداية اللعب
        if (data.playStartedAt) {
          actualStart =
            Number(data.playStartedAt);
        }

        // إذا لا يوجد playStartedAt
        // نستخدم نهاية العد التنازلي
        else if (
          data.countdownStartedAt
        ) {
          actualStart =
            Number(
              data.countdownStartedAt
            ) + 5000;
        }

        // احتياط إذا لم يوجد عد تنازلي
        else if (data.startedAt) {
          actualStart =
            Number(data.startedAt);
        }

        if (!actualStart) {
          return;
        }

        const updateTimer = () => {
          const elapsed =
            (Date.now() -
              actualStart) /
            1000;

          // مدة الجولة: أولوية للمدة التي اختارها
          // المضيف عند بدء الجولة (roundDuration)،
          // وإن لم تكن موجودة نستخدم timeLimit
          // المخزّن مع الصورة كاحتياط.
          const limit =
            Number(data.roundDuration) ||
            Number(pair.timeLimit) ||
            0;

          const rem = Math.max(
            0,
            limit - elapsed
          );

          setRemaining(rem);

          if (rem <= 0) {
            setRoundEnded(true);

            // ثواني عرض الحل (الدوائر الصفراء/الخضراء) هي
            // الفرق بين الوقت الحالي ووقت انتهاء الجولة فعلياً
            // (limit) — احتساب مطلق وليس مؤقتاً محلياً يبدأ من
            // لحظة فتح الصفحة. هذا يضمن أنه لو اللاعب بدّل
            // الصفحة ورجع أثناء عرض التصنيف، يشوف التصنيف
            // مباشرة بدل ما يرجع يشوف الصور من جديد.
            const revealElapsed = elapsed - limit;
            setShowLeaderboard(
              revealElapsed >= REVEAL_BEFORE_LEADERBOARD
            );
          } else {
            setRoundEnded(false);
            setShowLeaderboard(false);
          }
        };

        if (interval) {
          clearInterval(interval);
        }

        updateTimer();

        interval = setInterval(
          updateTimer,
          100
        );
      }
    );

    return () => {
      if (interval) {
        clearInterval(interval);
      }

      unsubscribe();
    };
  }, [pair]);

  // =========================================================
  // بعد نهاية الجولة
  // =========================================================

  // ملاحظة: ظهور قائمة التصنيف (showLeaderboard) أصبح يُحسب
  // مباشرة داخل updateTimer أعلاه بشكل مطلق (منذ وقت انتهاء
  // الجولة الحقيقي)، بدل useEffect منفصل بمؤقت نسبي كان يعيد
  // بدء العد من لحظة فتح/تحديث الصفحة — وهذا بالضبط ما كان
  // يسبب رجوع اللاعب لمشهد الصور عند تبديل الصفحة والرجوع
  // أثناء عرض التصنيف.

  // =========================================================
  // اللاعبين
  // =========================================================

  useEffect(() => {
    const playersRef =
      ref(db, "players");

    const unsubscribe = onValue(
      playersRef,
      (snapshot) => {
        const data =
          snapshot.val() || {};

        Object.entries(data).forEach(
          ([id, p]) => {
            if (
              !knownPlayerIds.current.has(
                id
              ) &&
              knownPlayerIds.current
                .size > 0
            ) {
              setJoinToast(
                `🎉 ${p.name} انضم للعبة`
              );

              setTimeout(
                () => {
                  setJoinToast(null);
                },
                3000
              );
            }

            knownPlayerIds.current.add(
              id
            );
          }
        );

        setPlayers(data);

        // مزامنة النقاط المحلية مع القيمة
        // المخزّنة في Firebase (مهم الآن لأن
        // النقاط تراكمية عبر الجولات، فلو
        // تم تحديث الصفحة يجب ألا تُفقد).
        if (
          playerIdRef.current &&
          data[playerIdRef.current]
        ) {
          setScore(
            data[playerIdRef.current]
              .score || 0
          );
        }
      }
    );

    return () =>
      unsubscribe();
  }, []);

  // =========================================================
  // الموسيقى
  // =========================================================

  useEffect(() => {
    if (!musicRef.current) {
      return;
    }

    musicRef.current.volume =
      0.25;

    if (muted) {
      musicRef.current.pause();
    } else {
      musicRef.current
        .play()
        .catch(() => {});
    }
  }, [muted, pairId]);

  // =========================================================
  // الأصوات
  // =========================================================

  const playSound = (audioRef) => {
    if (
      muted ||
      !audioRef.current
    ) {
      return;
    }

    audioRef.current.currentTime =
      0;

    audioRef.current
      .play()
      .catch(() => {});
  };

  // =========================================================
  // الضغط على الصورة
  // =========================================================

  function handleImageClick(e) {
    if (
      locked ||
      roundEnded ||
      countdown !== null ||
      !pair ||
      remaining <= 0
    ) {
      return;
    }

    const rect =
      e.currentTarget.getBoundingClientRect();

    if (
      !rect.width ||
      !rect.height
    ) {
      return;
    }

    const xPct =
      ((e.clientX -
        rect.left) /
        rect.width) *
      100;

    const yPct =
      ((e.clientY -
        rect.top) /
        rect.height) *
      100;

    let hitIndex = -1;

    if (
      Array.isArray(
        pair.differences
      )
    ) {
      pair.differences.forEach(
        (d, i) => {
          if (found[i]) {
            return;
          }

          const dx =
            Number(d.x) -
            xPct;

          const dy =
            Number(d.y) -
            yPct;

          const dist =
            Math.sqrt(
              dx * dx +
                dy * dy
            );

          if (
            dist <=
            Number(d.radius)
          ) {
            hitIndex = i;
          }
        }
      );
    }

    // =====================================================
    // اختلاف صحيح
    // =====================================================

    if (hitIndex >= 0) {
      playSound(
        correctSoundRef
      );

      const newFound = {
        ...found,
        [hitIndex]: true,
      };

      setFound(newFound);

      const newScore =
        score +
        POINTS_PER_DIFF;

      setScore(newScore);

      if (
        playerIdRef.current
      ) {
        set(
          ref(
            db,
            `players/${playerIdRef.current}/score`
          ),
          newScore
        );
      }

      if (
        Object.keys(
          newFound
        ).length ===
        pair.differences.length
      ) {
        setLocked(true);
      }

      return;
    }

    // =====================================================
    // ضغط خاطئ
    // =====================================================

    playSound(
      wrongSoundRef
    );

    setFlashRed(true);

    setTimeout(() => {
      setFlashRed(false);
    }, 300);

    const newAttempts =
      Math.max(
        0,
        attemptsLeft - 1
      );

    setAttemptsLeft(
      newAttempts
    );

    if (
      playerIdRef.current
    ) {
      set(
        ref(
          db,
          `players/${playerIdRef.current}/attemptsLeft`
        ),
        newAttempts
      );
    }

    if (
      newAttempts <= 0
    ) {
      setLocked(true);
    }
  }

  // =========================================================
  // قائمة اللاعبين
  // =========================================================

  const playersList =
    Object.entries(players).map(
      ([id, p]) => ({
        id,
        ...p,
      })
    );

  const topSeats =
    playersList.slice(0, 5);

  const bottomSeats =
    playersList.slice(5, 10);

  const sortedLeaderboard =
    [...playersList].sort(
      (a, b) =>
        (b.score || 0) -
        (a.score || 0)
    );

  const playerCompleted =
    pair &&
    Object.keys(found)
      .length ===
      pair.differences.length;

  // =========================================================
  // الواجهة
  // =========================================================

  return (
    <main style={styles.page}>
      {/* الخلفية */}

      <video
        autoPlay
        loop
        muted
        playsInline
        style={styles.bgVideo}
      >
        <source
          src="/casino-background.MP4"
          type="video/mp4"
        />
      </video>

      <div
        style={styles.overlay}
      />

      {/* الأصوات */}

      <audio
        ref={musicRef}
        loop
        src="/sounds/casino-music.mp3"
      />

      <audio
        ref={correctSoundRef}
        src="/sounds/correct.mp3"
      />

      <audio
        ref={wrongSoundRef}
        src="/sounds/wrong.mp3"
      />

      {/* زر الموسيقى */}

      <button
        type="button"
        style={styles.muteBtn}
        onClick={() =>
          setMuted(
            (m) => !m
          )
        }
      >
        {muted
          ? "🔇"
          : "🔊"}
      </button>

      {/* إشعار دخول لاعب */}

      {joinToast && (
        <div
          style={
            styles.joinToast
          }
        >
          {joinToast}
        </div>
      )}

      {/* ================================================= */}
      {/* العد التنازلي */}
      {/* ================================================= */}

      {countdown !== null && (
        <div
          style={
            styles.countdownOverlay
          }
        >
          <div
            key={countdown}
            style={
              styles.countdownNumber
            }
          >
            {countdown}
          </div>

          <div
            style={
              styles.countdownText
            }
          >
            استعد...
          </div>
        </div>
      )}

      {/* ================================================= */}
      {/* انتظار الصور */}
      {/* ================================================= */}

      {!pairId || !pair ? (
        <div
          style={styles.center}
        >
          <p
            style={{
              color:
                "#f8d46b",
              fontSize: 20,
            }}
          >
            بانتظار قيام
            المضيف باختيار
            الصور...
          </p>
        </div>
      ) : (
        <>
          {/* ================================================= */}
          {/* شريط المعلومات */}
          {/* ================================================= */}

          <div
            style={
              styles.topBar
            }
          >
            <div
              style={{
                color:
                  "#f8d46b",
                fontWeight: 900,
                fontSize: 20,
              }}
            >
              ⏱{" "}
              {Math.ceil(
                remaining
              )}{" "}
              ثانية
            </div>

            <div
              style={{
                color:
                  "white",
              }}
            >
              النقاط:{" "}
              <strong
                style={{
                  color:
                    "#f8d46b",
                }}
              >
                {score}
              </strong>
            </div>

            <div
              style={{
                color:
                  "white",
              }}
            >
              المحاولات
              المتبقية:{" "}
              <strong
                style={{
                  color:
                    attemptsLeft >
                    0
                      ? "#f8d46b"
                      : "#e04b3f",
                }}
              >
                {attemptsLeft}
              </strong>
            </div>
          </div>

          {/* المقاعد العلوية */}

          {!roundEnded && (
            <SeatRow
              seats={
                topSeats
              }
            />
          )}

          {/* ================================================= */}
          {/* نهاية الجولة */}
          {/* ================================================= */}

          {roundEnded ? (
            showLeaderboard ? (
              <div
                style={
                  styles.results
                }
              >
                <h2
                  style={{
                    color:
                      "#f8d46b",
                  }}
                >
                  🏆 التصنيف
                </h2>

                <div
                  style={
                    styles.leaderboardList
                  }
                >
                  {sortedLeaderboard.map(
                    (p, i) => (
                      <div
                        key={
                          p.id
                        }
                        style={
                          styles.leaderboardRow
                        }
                      >
                        <span
                          style={
                            styles.leaderboardRank
                          }
                        >
                          #
                          {i +
                            1}
                        </span>

                        {p.avatar && (
                          <img
                            src={
                              p.avatar
                            }
                            alt={
                              p.name
                            }
                            style={
                              styles.leaderboardAvatar
                            }
                          />
                        )}

                        <span
                          style={{
                            flex: 1,
                          }}
                        >
                          {
                            p.name
                          }
                        </span>

                        <span
                          style={{
                            color:
                              "#f8d46b",
                          }}
                        >
                          {p.score ||
                            0}{" "}
                          نقطة
                        </span>
                      </div>
                    )
                  )}
                </div>

                <p
                  style={{
                    color:
                      "#999",
                    marginTop:
                      20,
                  }}
                >
                  بانتظار أن
                  يبدأ المضيف
                  الجولة
                  التالية...
                </p>
              </div>
            ) : (
              <div
                style={
                  styles.revealFade
                }
              >
                <h3
                  style={{
                    textAlign:
                      "center",
                    color:
                      "#f8d46b",
                  }}
                >
                  {playerCompleted
                    ? "🎉 لقد عثرت على جميع الاختلافات!"
                    : "⏰ انتهى الوقت!"}
                </h3>

                <div
                  style={
                    styles.imagesRow
                  }
                >
                  {[
                    pair.image1,
                    pair.image2,
                  ].map(
                    (
                      src,
                      idx
                    ) => (
                      <div
                        key={
                          idx
                        }
                        style={
                          styles.imgWrapOuter
                        }
                      >
                        <div
                          style={
                            styles.imgWrap
                          }
                        >
                          <img
                            src={
                              src
                            }
                            alt=""
                            style={
                              styles.img
                            }
                            draggable={
                              false
                            }
                          />

                          {pair.differences.map(
                            (
                              d,
                              i
                            ) => (
                              <div
                                key={
                                  i
                                }
                                style={{
                                  ...styles.foundMarker,
                                  left: `${d.x}%`,
                                  top: `${d.y}%`,
                                  width: `${
                                    d.radius *
                                    2
                                  }%`,
                                  height: `${
                                    d.radius *
                                    2
                                  }%`,
                                  borderColor:
                                    found[
                                      i
                                    ]
                                      ? "#00ff88"
                                      : "#ffcf00",
                                }}
                              />
                            )
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            )
          ) : (
            /* ================================================= */
            /* الصور أثناء اللعب */
            /* ================================================= */

            <div
              style={{
                ...styles.imagesRow,
                filter:
                  flashRed
                    ? "brightness(1.5) saturate(2)"
                    : "none",
                opacity:
                  countdown !==
                  null
                    ? 0
                    : 1,
              }}
            >
              <ImageBox
                src={
                  pair.image1
                }
                onClick={
                  handleImageClick
                }
                found={
                  found
                }
                differences={
                  pair.differences
                }
                locked={
                  locked
                }
                onZoom={() =>
                  setZoomSrc(
                    pair.image1
                  )
                }
                disabled={
                  countdown !==
                    null ||
                  remaining <=
                    0
                }
              />

              <ImageBox
                src={
                  pair.image2
                }
                onClick={
                  handleImageClick
                }
                found={
                  found
                }
                differences={
                  pair.differences
                }
                locked={
                  locked
                }
                onZoom={() =>
                  setZoomSrc(
                    pair.image2
                  )
                }
                disabled={
                  countdown !==
                    null ||
                  remaining <=
                    0
                }
              />
            </div>
          )}

          {/* المقاعد السفلية */}

          {!roundEnded && (
            <SeatRow
              seats={
                bottomSeats
              }
            />
          )}

          {/* رسالة حالة اللاعب */}

          {locked &&
            !roundEnded && (
              <div
                style={{
                  ...styles.lockedBanner,
                  color:
                    playerCompleted
                      ? "#00ff88"
                      : "#e04b3f",
                }}
              >
                {playerCompleted
                  ? "🎉 أحسنت! وجدت جميع الاختلافات — انتظر بقية اللاعبين..."
                  : "🔒 خلصت محاولاتك، استنى نهاية الجولة"}
              </div>
            )}
        </>
      )}

      {/* ================================================= */}
      {/* التكبير */}
      {/* ================================================= */}

      {zoomSrc && (
        <div
          style={
            styles.zoomOverlay
          }
          onClick={() =>
            setZoomSrc(
              null
            )
          }
        >
          <img
            src={zoomSrc}
            alt="zoom"
            style={
              styles.zoomImg
            }
          />

          <button
            type="button"
            style={
              styles.zoomClose
            }
            onClick={(e) => {
              e.stopPropagation();
              setZoomSrc(null);
            }}
          >
            ✕
          </button>
        </div>
      )}
    </main>
  );
}

// =========================================================
// صورة اللعبة
// =========================================================

function ImageBox({
  src,
  onClick,
  found,
  differences,
  locked,
  onZoom,
  disabled,
}) {
  return (
    <div
      style={
        styles.imgWrapOuter
      }
    >
      {/* زر التكبير */}

      <button
        type="button"
        style={
          styles.zoomBtn
        }
        onClick={(e) => {
          e.stopPropagation();
          onZoom();
        }}
      >
        🔍
      </button>

      {/* ================================================= */}
      {/* منطقة الصورة القابلة للضغط */}
      {/* ================================================= */}

      <div
        style={{
          ...styles.imgWrap,
          cursor:
            disabled ||
            locked
              ? "not-allowed"
              : "crosshair",
        }}
        onClick={
          disabled ||
          locked
            ? undefined
            : onClick
        }
      >
        <img
          src={src}
          alt=""
          style={{
            ...styles.img,
            pointerEvents:
              "none",
          }}
          draggable={false}
        />

        {/* العلامات لا تمنع الضغط */}

        {Object.keys(
          found
        ).map((i) => {
          const d =
            differences[i];

          if (!d) {
            return null;
          }

          return (
            <div
              key={i}
              style={{
                ...styles.foundMarker,
                left: `${d.x}%`,
                top: `${d.y}%`,
                width: `${
                  d.radius * 2
                }%`,
                height: `${
                  d.radius * 2
                }%`,
                pointerEvents:
                  "none",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

// =========================================================
// المقاعد
// =========================================================

function SeatRow({
  seats,
}) {
  if (
    seats.length ===
    0
  ) {
    return null;
  }

  return (
    <div
      style={
        styles.seatRow
      }
    >
      {seats.map(
        (p) => (
          <div
            key={
              p.id
            }
            style={
              styles.seat
            }
          >
            <div
              style={
                styles.seatAvatarWrap
              }
            >
              {p.avatar && (
                <img
                  src={
                    p.avatar
                  }
                  alt={
                    p.name
                  }
                  style={
                    styles.seatAvatar
                  }
                />
              )}

              <span
                style={{
                  ...styles.statusDot,
                  background:
                    p.attemptsLeft >
                    0
                      ? "#00ff88"
                      : "#e04b3f",
                }}
              />
            </div>

            <span
              style={
                styles.seatName
              }
            >
              {
                p.name
              }
            </span>

            <span
              style={
                styles.seatScore
              }
            >
              {p.score ||
                0}{" "}
              نقطة
            </span>

            <span
              style={
                styles.seatAttempts
              }
            >
              محاولات:{" "}
              {p.attemptsLeft ??
                ATTEMPTS_START}
            </span>
          </div>
        )
      )}
    </div>
  );
}

// =========================================================
// التصميم
// =========================================================

const styles = {
  page: {
    position:
      "relative",
    minHeight:
      "100vh",
    color: "white",
    fontFamily:
      "Arial, sans-serif",
    padding: 20,
    overflow:
      "hidden",
  },

  bgVideo: {
    position:
      "fixed",
    inset: 0,
    width:
      "100%",
    height:
      "100%",
    objectFit:
      "cover",
    zIndex: -2,
  },

  overlay: {
    position:
      "fixed",
    inset: 0,
    background:
      "rgba(3,3,2,0.78)",
    zIndex: -1,
  },

  muteBtn: {
    position:
      "fixed",
    top: 16,
    left: 16,
    zIndex: 20,
    background:
      "rgba(0,0,0,0.5)",
    border:
      "1px solid #444",
    borderRadius:
      "50%",
    width: 44,
    height: 44,
    fontSize: 20,
    color: "#fff",
    cursor:
      "pointer",
  },

  joinToast: {
    position:
      "fixed",
    top: 20,
    right: 20,
    zIndex: 30,
    background:
      "rgba(0,0,0,0.75)",
    border:
      "1px solid #f8d46b",
    color:
      "#f8d46b",
    padding:
      "10px 18px",
    borderRadius:
      20,
  },

  center: {
    minHeight:
      "80vh",
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
  },

  topBar: {
    display:
      "flex",
    justifyContent:
      "space-around",
    alignItems:
      "center",
    padding: 15,
    background:
      "rgba(232,184,74,0.08)",
    borderRadius:
      12,
    marginBottom:
      12,
    border:
      "1px solid rgba(232,184,74,0.3)",
  },

  countdownOverlay: {
    position:
      "fixed",
    inset: 0,
    zIndex: 100,
    background:
      "rgba(0,0,0,0.90)",
    display:
      "flex",
    flexDirection:
      "column",
    alignItems:
      "center",
    justifyContent:
      "center",
    backdropFilter:
      "blur(8px)",
  },

  countdownNumber: {
    fontSize:
      "clamp(100px, 20vw, 220px)",
    fontWeight:
      900,
    color:
      "#f8d46b",
    textShadow:
      "0 0 25px rgba(248,212,107,0.7), 0 0 70px rgba(248,212,107,0.35)",
    animation:
      "countdownPop 0.9s ease-out",
  },

  countdownText: {
    marginTop:
      10,
    color:
      "#fff",
    fontSize:
      24,
    fontWeight:
      700,
    letterSpacing:
      2,
  },

  seatRow: {
    display:
      "flex",
    justifyContent:
      "center",
    gap: 10,
    flexWrap:
      "wrap",
    margin:
      "10px 0",
  },

  seat: {
    display:
      "flex",
    flexDirection:
      "column",
    alignItems:
      "center",
    background:
      "rgba(255,255,255,0.07)",
    borderRadius:
      12,
    padding:
      "6px 10px",
    minWidth: 76,
  },

  seatAvatarWrap: {
    position:
      "relative",
  },

  seatAvatar: {
    width: 40,
    height: 40,
    borderRadius:
      "50%",
    objectFit:
      "cover",
    border:
      "2px solid #f8d46b",
  },

  statusDot: {
    position:
      "absolute",
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius:
      "50%",
    border:
      "2px solid #111",
  },

  seatName: {
    fontSize: 11,
    marginTop: 4,
  },

  seatScore: {
    fontSize: 10,
    color:
      "#f8d46b",
  },

  seatAttempts: {
    fontSize: 9,
    color:
      "#aaa",
  },

  imagesRow: {
    display:
      "flex",
    gap: 15,
    flexWrap:
      "wrap",
    justifyContent:
      "center",
    transition:
      "opacity 0.5s ease, filter 0.2s",
  },

  imgWrapOuter: {
    position:
      "relative",
    flex: 1,
    minWidth: 300,
    maxWidth: 600,
  },

  zoomBtn: {
    position:
      "absolute",
    top: 8,
    right: 8,
    zIndex: 10,
    background:
      "rgba(0,0,0,0.6)",
    border:
      "1px solid #555",
    borderRadius:
      8,
    color:
      "#fff",
    padding:
      "4px 10px",
    cursor:
      "pointer",
  },

  imgWrap: {
    position:
      "relative",
    border:
      "2px solid #333",
    borderRadius:
      12,
    overflow:
      "hidden",
    width:
      "100%",
  },

  img: {
    width:
      "100%",
    display:
      "block",
    userSelect:
      "none",
    WebkitUserSelect:
      "none",
    WebkitTouchCallout:
      "none",
  },

  foundMarker: {
    position:
      "absolute",
    transform:
      "translate(-50%, -50%)",
    border:
      "3px solid #00ff88",
    borderRadius:
      "50%",
    boxShadow:
      "0 0 15px rgba(0,255,136,0.6)",
    pointerEvents:
      "none",
  },

  lockedBanner: {
    textAlign:
      "center",
    marginTop:
      16,
    fontSize: 18,
    fontWeight:
      700,
  },

  revealFade: {
    animation:
      "none",
  },

  results: {
    textAlign:
      "center",
    padding: 40,
  },

  leaderboardList: {
    display:
      "flex",
    flexDirection:
      "column",
    gap: 8,
    width:
      "min(90%, 420px)",
    margin:
      "16px auto 0",
  },

  leaderboardRow: {
    display:
      "flex",
    alignItems:
      "center",
    gap: 10,
    background:
      "rgba(255,255,255,0.08)",
    padding:
      "8px 14px",
    borderRadius:
      12,
  },

  leaderboardRank: {
    width: 30,
    fontWeight:
      "bold",
    color:
      "#f8d46b",
  },

  leaderboardAvatar: {
    width: 32,
    height: 32,
    borderRadius:
      "50%",
    objectFit:
      "cover",
  },

  zoomOverlay: {
    position:
      "fixed",
    inset: 0,
    background:
      "rgba(0,0,0,0.9)",
    zIndex: 50,
    display:
      "flex",
    alignItems:
      "center",
    justifyContent:
      "center",
    padding: 20,
  },

  zoomImg: {
    maxWidth:
      "95%",
    maxHeight:
      "95%",
    borderRadius:
      12,
  },

  zoomClose: {
    position:
      "absolute",
    top: 20,
    right: 20,
    background:
      "rgba(255,255,255,0.15)",
    border:
      "none",
    color:
      "#fff",
    borderRadius:
      "50%",
    width: 44,
    height: 44,
    fontSize: 20,
    cursor:
      "pointer",
  },
};

// =========================================================
// Animation
// =========================================================

if (
  typeof document !==
  "undefined"
) {
  if (
    !document.getElementById(
      "difference-game-countdown-style"
    )
  ) {
    const style =
      document.createElement(
        "style"
      );

    style.id =
      "difference-game-countdown-style";

    style.innerHTML = `
      @keyframes countdownPop {
        0% {
          transform: scale(1.5);
          opacity: 0;
        }

        45% {
          transform: scale(0.9);
          opacity: 1;
        }

        75% {
          transform: scale(1.05);
          opacity: 1;
        }

        100% {
          transform: scale(1);
          opacity: 1;
        }
      }
    `;

    document.head.appendChild(
      style
    );
  }
}
