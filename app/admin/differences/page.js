"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ref, push, set } from "firebase/database";
import { db, auth } from "../../../lib/firebase";
import { onAuthStateChanged, signInWithEmailAndPassword } from "firebase/auth";

// نفس حساب المضيف المستخدم في لوحة التحكم — هذه الأداة تكتب
// مباشرة في imagePairs، فيجب حمايتها بنفس الطريقة.
const HOST_EMAIL = "host@difference-game.local";

// أداة الإدارة: تحديد نقاط الاختلاف بالضغط على الصورة
// ملاحظة مهمة: هذه الأداة لا ترفع الصور إلى أي خادم.
// يقوم المصمم برفع الصور يدوياً إلى المجلد public/pairs/<اسم-الزوج>/ عبر GitHub
// بنفس الطريقة التي تم بها رفع الصور الرمزية والفيديو.
// هذه الأداة تقوم فقط بحساب إحداثيات نقاط الاختلاف وربطها بمسار الصورتين
// وحفظ كل ذلك في Firebase (دون استخدام Storage، ودون الحاجة لخطة Blaze).

export default function DifferencesAdmin() {
  const [authorized, setAuthorized] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthorized(!!user && user.email === HOST_EMAIL);
    });
    return () => unsubscribe();
  }, []);

  function handleLogin() {
    setLoginError("");
    signInWithEmailAndPassword(auth, HOST_EMAIL, passwordInput).catch(() => {
      setLoginError("كلمة المرور غير صحيحة");
    });
  }

  const [image1, setImage1] = useState(null); // { file, url } - للمعاينة المحلية فقط
  const [image2, setImage2] = useState(null);
  const [image1Path, setImage1Path] = useState(""); // المسار الحقيقي داخل public/
  const [image2Path, setImage2Path] = useState("");
  const [points, setPoints] = useState([]); // [{ id, x, y, radius }]
  const [selectedPointId, setSelectedPointId] = useState(null);
  const [resizingId, setResizingId] = useState(null);
  const imgWrapRef = useRef(null);
  const suppressClickRef = useRef(false);
  const [level, setLevel] = useState(""); // رقم المستوى: 1, 2, 3 ... 90
  const pairName = level ? `lvl${level}` : "";
  // ملاحظة: الوقت الفعلي لكل جولة يختاره المضيف من لوحة التحكم
  // (30ث/1د/2د/3د/4د) وهو ما يُستخدم دائماً فعلياً. هذه القيمة
  // ثابتة احتياطية فقط تُحفظ مع الصورة ولا تُستخدم إلا في حال
  // خطأ غير متوقع، لذلك أُزيلت من الواجهة.
  const FALLBACK_TIME_LIMIT = 60;
  const [defaultRadius, setDefaultRadius] = useState(3);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  const handleFile = (setter) => (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setter({ file, url });
  };

  const handleImageClick = useCallback(
    (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const xPct = ((e.clientX - rect.left) / rect.width) * 100;
      const yPct = ((e.clientY - rect.top) / rect.height) * 100;

      const newPoint = {
        id: crypto.randomUUID(),
        x: Number(xPct.toFixed(2)),
        y: Number(yPct.toFixed(2)),
        radius: defaultRadius,
      };
      setPoints((prev) => [...prev, newPoint]);
      setSelectedPointId(newPoint.id);
    },
    [defaultRadius]
  );

  const removePoint = (id) => {
    setPoints((prev) => prev.filter((p) => p.id !== id));
    if (selectedPointId === id) setSelectedPointId(null);
  };

  const updatePointRadius = (id, radius) => {
    setPoints((prev) =>
      prev.map((p) => (p.id === id ? { ...p, radius: Number(radius) } : p))
    );
  };

  // ---- سحب مقبض الدائرة لتكبير/تصغير مساحة الضغط مباشرة ----
  const handleResizeStart = (e, point) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedPointId(point.id);
    setResizingId(point.id);
    suppressClickRef.current = true;
    try {
      e.target.setPointerCapture(e.pointerId);
    } catch (err) {
      // بعض المتصفحات القديمة لا تدعمها، نتجاهل
    }
  };

  const handleResizeMove = (e, point) => {
    if (resizingId !== point.id || !imgWrapRef.current) return;
    const rect = imgWrapRef.current.getBoundingClientRect();
    const cx = rect.left + (point.x / 100) * rect.width;
    const cy = rect.top + (point.y / 100) * rect.height;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const distPct = (Math.sqrt(dx * dx + dy * dy) / rect.width) * 100;
    const clamped = Math.min(30, Math.max(0.5, distPct));
    updatePointRadius(point.id, Number(clamped.toFixed(1)));
  };

  const handleResizeEnd = (e) => {
    e.stopPropagation();
    setResizingId(null);
  };

  const clearAll = () => {
    if (confirm("هل أنت متأكد من رغبتك في مسح جميع النقاط؟")) setPoints([]);
  };

  const jsonPreview = JSON.stringify(
    {
      level: Number(level) || null,
      name: pairName,
      image1: image1Path,
      image2: image2Path,
      timeLimit: FALLBACK_TIME_LIMIT,
      differences: points.map(({ x, y, radius }) => ({ x, y, radius })),
    },
    null,
    2
  );

  const copyJson = async () => {
    await navigator.clipboard.writeText(jsonPreview);
    setSavedMsg("تم نسخ JSON ✅");
    setTimeout(() => setSavedMsg(""), 2000);
  };

  const saveToFirebase = async () => {
    if (!image1Path || !image2Path || points.length === 0 || !level) {
      alert(
        "يجب تحديد رقم المستوى، مسار الصورتين داخل public/، ونقاط الاختلاف"
      );
      return;
    }
    setSaving(true);
    try {
      const pairsRef = ref(db, "imagePairs");
      const newPairRef = push(pairsRef);
      await set(newPairRef, {
        level: Number(level),
        name: pairName,
        image1: image1Path,
        image2: image2Path,
        timeLimit: FALLBACK_TIME_LIMIT,
        differences: points.map(({ x, y, radius }) => ({ x, y, radius })),
        createdAt: Date.now(),
      });
      setSavedMsg("تم الحفظ في Firebase ✅ (لا تنسَ رفع الصور فعلياً إلى نفس المسار داخل public/)");
      setTimeout(() => setSavedMsg(""), 5000);
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء الحفظ، يرجى مراجعة وحدة التحكم (Console)");
    } finally {
      setSaving(false);
    }
  };

  if (!authorized) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0e0e16",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          gap: 15,
          padding: 20,
        }}
      >
        <h2 style={{ color: "#ffb800" }}>تسجيل دخول المضيف</h2>
        <input
          type="password"
          placeholder="كلمة المرور"
          value={passwordInput}
          onChange={(e) => setPasswordInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          style={{
            padding: 14,
            borderRadius: 10,
            border: "1px solid #444",
            background: "rgba(255,255,255,0.05)",
            color: "white",
            textAlign: "center",
          }}
        />
        <button
          onClick={handleLogin}
          style={{
            padding: "12px 28px",
            background: "linear-gradient(90deg,#ffb800,#ff7a00)",
            border: "none",
            borderRadius: 10,
            color: "#1a1a1a",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          دخول
        </button>
        {loginError && <p style={{ color: "#ff6b6b" }}>{loginError}</p>}
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>🎯 أداة تحديد نقاط الاختلاف</h1>

      <div style={styles.noticeBox}>
        ⚠️ هذه الأداة مخصصة للمعاينة وحساب الإحداثيات فقط. الصور التي ترفعها
        هنا محفوظة محلياً على جهازك فقط، ويجب عليك لاحقاً وضعها يدوياً في
        المجلد <code style={styles.code}>public/pairs/اسم-الزوج/</code> عبر
        GitHub، ثم كتابة نفس المسار في الحقول أدناه.
      </div>

      <div style={styles.topControls}>
        <div style={styles.field}>
          <label style={styles.label}>رقم المستوى (Level)</label>
          <input
            type="number"
            style={styles.input}
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            placeholder="مثال: 1"
          />
          {pairName && (
            <span style={{ fontSize: 12, color: "#888" }}>الاسم: {pairName}</span>
          )}
        </div>
        <div style={styles.field}>
          <label style={styles.label}>نصف قطر النقطة الافتراضي (%)</label>
          <input
            type="number"
            style={styles.input}
            value={defaultRadius}
            onChange={(e) => setDefaultRadius(Number(e.target.value))}
          />
        </div>
      </div>

      <div style={styles.uploadRow}>
        <div style={styles.uploadBox}>
          <label style={styles.uploadLabel}>
            الصورة الأولى محلياً (للمعاينة وتحديد النقاط)
            <input type="file" accept="image/*" onChange={handleFile(setImage1)} />
          </label>
          <input
            style={styles.input}
            placeholder={pairName ? `/pairs/${pairName}/1.png` : "/pairs/lvl1/1.png"}
            value={image1Path}
            onChange={(e) => setImage1Path(e.target.value)}
          />
        </div>
        <div style={styles.uploadBox}>
          <label style={styles.uploadLabel}>
            الصورة الثانية محلياً (للمقارنة البصرية فقط)
            <input type="file" accept="image/*" onChange={handleFile(setImage2)} />
          </label>
          <input
            style={styles.input}
            placeholder={pairName ? `/pairs/${pairName}/2.png` : "/pairs/lvl1/2.png"}
            value={image2Path}
            onChange={(e) => setImage2Path(e.target.value)}
          />
        </div>
      </div>

      {image1 && image2 && (
        <div style={styles.imagesRow}>
          <div
            style={styles.imgWrap}
            ref={imgWrapRef}
            onClick={(e) => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              handleImageClick(e);
            }}
          >
            <img src={image1.url} alt="1" style={styles.img} draggable={false} />
            {points.map((p) => (
              <div
                key={p.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPointId(p.id);
                }}
                style={{
                  ...styles.marker,
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  width: `${p.radius * 2}%`,
                  height: `${p.radius * 2}%`,
                  borderColor: selectedPointId === p.id ? "#00ff88" : "#ff3b3b",
                }}
                title={`x:${p.x}% y:${p.y}%`}
              >
                {resizingId === p.id && (
                  <span style={styles.resizeReadout}>{p.radius}%</span>
                )}
                <span
                  onPointerDown={(e) => handleResizeStart(e, p)}
                  onPointerMove={(e) => handleResizeMove(e, p)}
                  onPointerUp={handleResizeEnd}
                  style={styles.resizeHandle}
                  title="اسحب لتكبير/تصغير مساحة الضغط"
                />
              </div>
            ))}
          </div>
          <div style={styles.imgWrap}>
            <img src={image2.url} alt="2" style={styles.img} draggable={false} />
            {points.map((p) => (
              <div
                key={p.id}
                style={{
                  ...styles.marker,
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  width: `${p.radius * 2}%`,
                  height: `${p.radius * 2}%`,
                  borderColor: selectedPointId === p.id ? "#00ff88" : "#ff3b3b",
                  pointerEvents: "none",
                }}
              />
            ))}
          </div>
        </div>
      )}

      {points.length > 0 && (
        <div style={styles.listSection}>
          <h3 style={styles.subTitle}>نقاط الاختلاف ({points.length})</h3>
          <p style={{ fontSize: 12.5, color: "#888", marginTop: -4, marginBottom: 12 }}>
            💡 يمكنك سحب النقطة الخضراء الصغيرة على حافة كل دائرة (بالصورة
            الأولى) لتكبيرها أو تصغيرها مباشرة، أو كتابة الرقم يدوياً بالأسفل.
          </p>
          <div style={styles.pointsList}>
            {points.map((p, i) => (
              <div
                key={p.id}
                style={{
                  ...styles.pointRow,
                  background: selectedPointId === p.id ? "#2a2a3a" : "transparent",
                }}
                onClick={() => setSelectedPointId(p.id)}
              >
                <span>#{i + 1}</span>
                <span>x: {p.x}%</span>
                <span>y: {p.y}%</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  نصف القطر:
                  <input
                    type="number"
                    value={p.radius}
                    onChange={(e) => updatePointRadius(p.id, e.target.value)}
                    style={styles.smallInput}
                    onClick={(e) => e.stopPropagation()}
                  />
                </span>
                <button
                  style={styles.deleteBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    removePoint(p.id);
                  }}
                >
                  حذف
                </button>
              </div>
            ))}
          </div>

          <div style={styles.actionsRow}>
            <button style={styles.btnGhost} onClick={clearAll}>
              مسح الكل
            </button>
            <button style={styles.btnGhost} onClick={copyJson}>
              نسخ JSON
            </button>
            <button style={styles.btnPrimary} onClick={saveToFirebase} disabled={saving}>
              {saving ? "جاري الحفظ..." : "حفظ في Firebase"}
            </button>
          </div>

          {savedMsg && <p style={styles.savedMsg}>{savedMsg}</p>}

          <pre style={styles.jsonBox}>{jsonPreview}</pre>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0e0e16",
    color: "#fff",
    padding: "24px",
    fontFamily: "system-ui, sans-serif",
    direction: "rtl",
  },
  title: { fontSize: 24, marginBottom: 12 },
  noticeBox: {
    background: "#2a1f0a",
    border: "1px solid #5a4514",
    color: "#ffcf6b",
    padding: "12px 16px",
    borderRadius: 10,
    fontSize: 13,
    lineHeight: 1.8,
    marginBottom: 20,
  },
  code: {
    background: "#000",
    padding: "1px 6px",
    borderRadius: 4,
    direction: "ltr",
    display: "inline-block",
  },
  topControls: { display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 13, color: "#aaa" },
  input: {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #333",
    background: "#1a1a26",
    color: "#fff",
    minWidth: 160,
  },
  uploadRow: { display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" },
  uploadBox: {
    flex: 1,
    minWidth: 240,
    border: "1px dashed #444",
    borderRadius: 12,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  uploadLabel: { display: "flex", flexDirection: "column", gap: 8, fontSize: 14 },
  imagesRow: { display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 },
  imgWrap: {
    position: "relative",
    flex: 1,
    minWidth: 300,
    cursor: "crosshair",
    border: "1px solid #333",
    borderRadius: 12,
    overflow: "hidden",
  },
  img: { width: "100%", display: "block", userSelect: "none" },
  marker: {
    position: "absolute",
    transform: "translate(-50%, -50%)",
    border: "2px solid",
    borderRadius: "50%",
    boxShadow: "0 0 8px rgba(0,0,0,0.6)",
  },
  resizeHandle: {
    position: "absolute",
    right: -7,
    top: "50%",
    transform: "translateY(-50%)",
    width: 16,
    height: 16,
    borderRadius: "50%",
    background: "#00ff88",
    border: "2px solid #0e0e16",
    cursor: "ew-resize",
    touchAction: "none",
  },
  resizeReadout: {
    position: "absolute",
    top: -22,
    left: "50%",
    transform: "translateX(-50%)",
    background: "#000",
    color: "#00ff88",
    fontSize: 11,
    padding: "2px 6px",
    borderRadius: 6,
    whiteSpace: "nowrap",
  },
  listSection: { marginTop: 12 },
  subTitle: { fontSize: 18, marginBottom: 10 },
  pointsList: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 },
  pointRow: {
    display: "flex",
    gap: 16,
    alignItems: "center",
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #2a2a3a",
    cursor: "pointer",
  },
  smallInput: {
    width: 50,
    padding: "2px 4px",
    borderRadius: 4,
    border: "1px solid #333",
    background: "#1a1a26",
    color: "#fff",
  },
  deleteBtn: {
    marginRight: "auto",
    background: "#3a1a1a",
    color: "#ff6b6b",
    border: "1px solid #5a2a2a",
    borderRadius: 6,
    padding: "4px 10px",
    cursor: "pointer",
  },
  actionsRow: { display: "flex", gap: 10, marginBottom: 12 },
  btnGhost: {
    padding: "10px 16px",
    borderRadius: 8,
    border: "1px solid #444",
    background: "transparent",
    color: "#fff",
    cursor: "pointer",
  },
  btnPrimary: {
    padding: "10px 16px",
    borderRadius: 8,
    border: "none",
    background: "linear-gradient(90deg,#ffb800,#ff7a00)",
    color: "#1a1a1a",
    fontWeight: "bold",
    cursor: "pointer",
  },
  savedMsg: { color: "#00ff88", marginBottom: 10 },
  jsonBox: {
    background: "#05050a",
    padding: 16,
    borderRadius: 10,
    fontSize: 12,
    maxHeight: 240,
    overflow: "auto",
    direction: "ltr",
    textAlign: "left",
  },
};
