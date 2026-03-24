import { useState, useEffect, useRef, useCallback } from "react";
import { supabase, signIn, signUp, signInMagicLink, signOut,
  loadProfile, saveProfile, loadExams, saveExam,
  loadTasks, saveTasks, loadCards, saveCards,
  loadSemesterPlan, saveSemesterPlan,
  convertExam, convertTask, convertCard } from './supabase';

const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap";
document.head.appendChild(fontLink);

const T = {
  bg: "#0d0f14", surface: "#151820", card: "#1c2030", border: "#262d42",
  accent: "#7c6af7", accentSoft: "#2d2757", green: "#3ecf8e", orange: "#f5a623",
  red: "#f56565", yellow: "#fbbf24", text: "#e8eaf0", muted: "#8891a8",
  font: "'Syne', sans-serif", body: "'DM Sans', sans-serif",
};

const globalCSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { overflow-x: hidden; }
  body { background: ${T.bg}; color: ${T.text}; font-family: ${T.body}; overflow-x: hidden; position: relative; }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: ${T.surface}; }
  ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 3px; }
  input, textarea, select { outline: none; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes glow { 0%,100%{box-shadow:0 0 8px ${T.accent}44} 50%{box-shadow:0 0 22px ${T.accent}88} }
  @keyframes pop { 0%{transform:scale(1)} 50%{transform:scale(1.15)} 100%{transform:scale(1)} }
  @keyframes confetti { 0%{transform:translateY(0) rotate(0deg);opacity:1} 100%{transform:translateY(80px) rotate(720deg);opacity:0} }
  @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
  @keyframes confetti-fall { 0%{transform:translateY(-10px) rotate(0deg) scale(1);opacity:1} 100%{transform:translateY(60px) rotate(360deg) scale(0.5);opacity:0} }
  @keyframes xp-float { 0%{transform:translateY(0) scale(0.8);opacity:1} 100%{transform:translateY(-50px) scale(1.2);opacity:0} }
  @keyframes bounce-in { 0%{transform:scale(0)} 60%{transform:scale(1.3)} 100%{transform:scale(1)} }
  @keyframes confetti-fall { 0%{transform:translateY(-20px) rotate(0deg);opacity:1} 100%{transform:translateY(80px) rotate(360deg);opacity:0} }
  @keyframes xp-pop { 0%{transform:scale(0.5) translateY(0);opacity:1} 100%{transform:scale(1.2) translateY(-40px);opacity:0} }
  @keyframes bounce-in { 0%{transform:scale(0);} 60%{transform:scale(1.2);} 100%{transform:scale(1);} }

  @media (max-width: 768px) {
    .desktop-nav { display: none !important; }
    .mobile-header { display: flex !important; }
    .mobile-nav { display: block !important; }
    .main-content {
      padding-top: 56px !important;
      padding-bottom: 90px !important;
      overflow-x: hidden !important;
      width: 100% !important;
    }
    .main-content > * {
      max-width: 100% !important;
      overflow-x: hidden !important;
    }
  }
  @media (min-width: 769px) {
    .mobile-header { display: none !important; }
    .mobile-nav { display: none !important; }
  }
`;
const styleEl = document.createElement("style");
styleEl.textContent = globalCSS;
document.head.appendChild(styleEl);

// Mobile Detection Hook
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

async function extractPdfText(file) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ') + '\n';
  }
  return text;
}

async function callClaude(messages, systemPrompt = "") {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: systemPrompt,
      messages,
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

async function callClaudeLarge(messages, systemPrompt = "") {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      system: systemPrompt,
      messages,
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

function safeParseJSON(raw) {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const clean = jsonMatch ? jsonMatch[0] : raw;
  try { return JSON.parse(clean); }
  catch {
    const lastBrace = clean.lastIndexOf('}');
    return JSON.parse(clean.substring(0, lastBrace + 1));
  }
}

const daysUntil = (dateStr) => { const [y,m,d] = dateStr.split('-').map(Number); const target = new Date(y,m-1,d); const now = new Date(); now.setHours(0,0,0,0); return Math.max(0, Math.ceil((target-now)/86400000)); };
const randomId = () => Math.random().toString(36).slice(2, 9);
const todayStr = () => { const d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
const todayLabel = () => new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
const getLevel = (xp) => Math.floor(xp / 100) + 1;
const getXPProgress = (xp) => xp % 100;

const getStreakInfo = (streak) => {
  if (streak === 0) return { icon: "💤", color: "#6b7280", label: "Noch kein Streak", sub: "Fang heute an!" };
  if (streak === 1) return { icon: "🌱", color: "#84cc16", label: `${streak} Tag`, sub: "Guter Start!" };
  if (streak < 3)  return { icon: "✨", color: "#a3e635", label: `${streak} Tage`, sub: "Weiter so!" };
  if (streak < 5)  return { icon: "🔥", color: "#f59e0b", label: `${streak} Tage`, sub: "Auf Kurs!" };
  if (streak < 7)  return { icon: "🔥", color: "#f97316", label: `${streak} Tage`, sub: "Stark!" };
  if (streak < 14) return { icon: "⚡", color: "#eab308", label: `${streak} Tage`, sub: "Wochenkrieger!" };
  if (streak < 21) return { icon: "🌟", color: "#f59e0b", label: `${streak} Tage`, sub: "Unaufhaltsam!" };
  if (streak < 30) return { icon: "💫", color: "#a78bfa", label: `${streak} Tage`, sub: "Legendär!" };
  return { icon: "👑", color: "#fbbf24", label: `${streak} Tage`, sub: "Absolute Legende!" };
};

const BADGES = [
  { id: "first_session", icon: "🎯", name: "Erster Schritt", desc: "Erste Lernsession abgeschlossen", xpBonus: 10 },
  { id: "streak_3", icon: "🔥", name: "Auf Kurs", desc: "3 Tage Lernstreak", xpBonus: 20 },
  { id: "streak_7", icon: "⚡", name: "Wochenkrieger", desc: "7 Tage Lernstreak", xpBonus: 50 },
  { id: "streak_14", icon: "🌟", name: "Unaufhaltsam", desc: "14 Tage Lernstreak", xpBonus: 100 },
  { id: "level_5", icon: "🏅", name: "Lernprofi", desc: "Level 5 erreicht", xpBonus: 30 },
  { id: "level_10", icon: "🥈", name: "Experte", desc: "Level 10 erreicht", xpBonus: 75 },
  { id: "level_20", icon: "🥇", name: "Meister", desc: "Level 20 erreicht", xpBonus: 150 },
  { id: "cards_50", icon: "🃏", name: "Kartensammler", desc: "50 Flashcards gelernt", xpBonus: 40 },
  { id: "perfect_quiz", icon: "💯", name: "Perfektionist", desc: "Quiz mit 100% abgeschlossen", xpBonus: 25 },
  { id: "all_done", icon: "🎓", name: "Klausurbereit", desc: "Alle Aufgaben eines Fachs erledigt", xpBonus: 60 },
  { id: "planner", icon: "📆", name: "Stratege", desc: "Semesterplan erstellt", xpBonus: 30 },
  { id: "early_bird", icon: "🌅", name: "Frühstarter", desc: "Lernplan 30+ Tage vor Klausur erstellt", xpBonus: 35 },
];

const getLevelReward = (level) => {
  const rewards = {
    2:  { icon: "🎯", text: "Badge freigeschaltet: Erster Schritt!" },
    5:  { icon: "🏅", text: "Badge freigeschaltet: Lernprofi!" },
    10: { icon: "🥈", text: "Badge freigeschaltet: Experte! +75 Bonus-XP" },
    15: { icon: "🎨", text: "Neues Theme freigeschaltet: Dark Gold!" },
    20: { icon: "🥇", text: "Badge freigeschaltet: Meister! +150 Bonus-XP" },
    25: { icon: "🚀", text: "Alle Features freigeschaltet!" },
  };
  return rewards[level] || null;
};

// Prioritätsscore: je näher die Klausur und je weniger Fortschritt, desto höher
function calcPriority(exam) {
  const days = daysUntil(exam.date);
  const progress = exam.progress || 0;
  const urgency = days <= 3 ? 100 : days <= 7 ? 80 : days <= 14 ? 60 : days <= 21 ? 40 : 20;
  return urgency + (100 - progress) * 0.3;
}

const DOPAMINE_TIPS = [
  "🎯 Klein anfangen – der erste Schritt zählt!",
  "🏆 Du hast heute schon etwas geschafft. Stolz sein ist erlaubt.",
  "🎵 Dein Gehirn liebt Musik beim Lernen – probier lo-fi!",
  "🌊 Flow-Zustand: Handy weg, Timer an, abtauchen.",
  "🎲 Gamifiziere deinen Tag – jede Aufgabe = Punkte!",
  "💧 Wasser trinken aktiviert den Fokus-Modus.",
  "🐾 Kleine Pausen = große Leistung. Du bist kein Roboter.",
];

// ════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [lastStudyDate, setLastStudyDate] = useState("");
  const [exams, setExams] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [dailyMinutes, setDailyMinutes] = useState(60);
  const [cards, setCards] = useState([]);
  const [semesterPlan, setSemesterPlan] = useState(null);
  const [generatingSemester, setGeneratingSemester] = useState(false);
  const [badges, setBadges] = useState([]);
  const [toast, setToast] = useState(null);
  const [tip, setTip] = useState(DOPAMINE_TIPS[Math.floor(Math.random() * DOPAMINE_TIPS.length)]);
  const [activeTask, setActiveTask] = useState(null);
  const [completionAnim, setCompletionAnim] = useState(null); // {x, y} für Confetti

  const switchTab = (newTab) => {
    setTab(newTab);
    // Tipp alle paar Tab-Wechsel rotieren
    if (Math.random() > 0.5) setTip(DOPAMINE_TIPS[Math.floor(Math.random() * DOPAMINE_TIPS.length)]);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
      if (session?.user) loadAllData(session.user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) loadAllData(session.user.id);
      else resetData();
    });
    return () => subscription.unsubscribe();
  }, []);

  const resetData = () => {
    setXp(0); setStreak(0); setLastStudyDate(""); setExams([]);
    setTasks([]); setDailyMinutes(60); setCards([]); setSemesterPlan(null); setBadges([]);
  };

  const loadAllData = async (userId) => {
    setSyncing(true);
    try {
      const [profile, dbExams, dbTasks, dbCards, dbPlan] = await Promise.all([
        loadProfile(userId), loadExams(userId), loadTasks(userId),
        loadCards(userId), loadSemesterPlan(userId),
      ]);
      if (profile) {
        setXp(profile.xp || 0);
        setStreak(profile.streak || 0);
        setLastStudyDate(profile.last_study_date || "");
        setDailyMinutes(profile.daily_minutes || 60);
        setBadges(profile.badges || []);
      }
      setExams(dbExams.map(convertExam));
      setTasks(dbTasks.map(convertTask));
      setCards(dbCards.map(convertCard));
      if (dbPlan) setSemesterPlan(dbPlan);
    } catch (err) { console.error("Ladefehler:", err); }
    setSyncing(false);
  };

  const saveTimeout = useRef(null);
  const pendingSave = useRef({});

  const scheduleSave = useCallback((key, fn) => {
    pendingSave.current[key] = fn;
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      const fns = { ...pendingSave.current };
      pendingSave.current = {};
      for (const f of Object.values(fns)) await f();
    }, 1500);
  }, []);

  useEffect(() => {
    if (!user) return;
    scheduleSave('profile', () => saveProfile(user.id, {
      xp, streak, last_study_date: lastStudyDate,
      daily_minutes: dailyMinutes, badges,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xp, streak, lastStudyDate, dailyMinutes, badges]);

  useEffect(() => {
    if (!user || !exams.length) return;
    scheduleSave('exams', () => Promise.all(exams.map(e => saveExam(user.id, e))));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exams]);

  useEffect(() => {
    if (!user) return;
    scheduleSave('tasks', () => saveTasks(user.id, tasks));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  useEffect(() => {
    if (!user || !cards.length) return;
    scheduleSave('cards', () => saveCards(user.id, cards));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  useEffect(() => {
    if (!user || !semesterPlan) return;
    scheduleSave('semplan', () => saveSemesterPlan(user.id, semesterPlan));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semesterPlan]);

  useEffect(() => {
    setTasks(prev => {
      const seen = new Set();
      return prev.filter(t => {
        const key = `${t.text}|${t.examId}|${t.plannedDate || "none"}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });
  }, []);


  const showToast = (icon, text) => {
    setToast({ icon, text });
    setTimeout(() => setToast(null), 3500);
  };

  const unlockBadge = (badgeId) => {
    setBadges(prev => {
      if (prev.includes(badgeId)) return prev;
      const badge = BADGES.find(b => b.id === badgeId);
      if (badge) {
        showToast(badge.icon, `Badge freigeschaltet: ${badge.name}!`);
        setXp(x => x + badge.xpBonus);
      }
      return [...prev, badgeId];
    });
  };

  const addXP = (val) => {
    setXp(prev => {
      const newXp = prev + val;
      const oldLevel = getLevel(prev);
      const newLevel = getLevel(newXp);
      if (newLevel > oldLevel) {
        const reward = getLevelReward(newLevel);
        setTimeout(() => showToast(reward?.icon || "⬆️", reward?.text || `Level ${newLevel} erreicht!`), 100);
        if (newLevel >= 5) unlockBadge("level_5");
        if (newLevel >= 10) unlockBadge("level_10");
        if (newLevel >= 20) unlockBadge("level_20");
      }
      return newXp;
    });
  };

  const handleDataImport = async (raw) => {
    if (!user) throw new Error("Nicht eingeloggt");
    let count = 0;

    // XP & Profil
    const newXp = JSON.parse(raw['ff_xp'] || '0');
    const newStreak = JSON.parse(raw['ff_streak'] || '0');
    const newLastStudy = raw['ff_lastStudy'] || '';
    const newDailyMin = JSON.parse(raw['ff_dailyMin'] || '60');
    const newBadges = JSON.parse(raw['ff_badges'] || '[]');
    setXp(newXp); setStreak(newStreak); setLastStudyDate(newLastStudy);
    setDailyMinutes(newDailyMin); setBadges(newBadges);
    await saveProfile(user.id, { xp: newXp, streak: newStreak, last_study_date: newLastStudy, daily_minutes: newDailyMin, badges: newBadges });
    count++;

    // Klausuren
    const newExams = JSON.parse(raw['ff_exams'] || '[]');
    if (newExams.length) {
      setExams(newExams);
      await Promise.all(newExams.map(e => saveExam(user.id, e)));
      count += newExams.length;
    }

    // Tasks
    const newTasks = JSON.parse(raw['ff_tasks'] || '[]');
    if (newTasks.length) {
      setTasks(newTasks);
      await saveTasks(user.id, newTasks);
      count += newTasks.length;
    }

    // Flashcards
    const newCards = JSON.parse(raw['ff_cards'] || '[]');
    if (newCards.length) {
      setCards(newCards);
      await saveCards(user.id, newCards);
      count += newCards.length;
    }

    // Semesterplan
    const newPlan = JSON.parse(raw['ff_semesterplan'] || 'null');
    if (newPlan) {
      setSemesterPlan(newPlan);
      await saveSemesterPlan(user.id, newPlan);
      count++;
    }

    return `${count} Einträge erfolgreich`;
  };

  const markStudiedToday = () => {
    const today = todayStr();
    if (lastStudyDate === today) return;
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.getFullYear()+'-'+String(yesterday.getMonth()+1).padStart(2,'0')+'-'+String(yesterday.getDate()).padStart(2,'0');
    setStreak(prev => lastStudyDate === yStr ? prev + 1 : 1);
    setLastStudyDate(today);
  };

  const completeTask = (id, feedback) => {
    const task = tasks.find(t => t.id === id);
    const xpGain = feedback === "verstanden" ? task?.xpVal : feedback === "teilweise" ? Math.floor((task?.xpVal||25) / 2) : 5;
    if (feedback === "verstanden") {
      setCompletionAnim({ ts: Date.now() });
      setTimeout(() => setCompletionAnim(null), 2000);
      setTimeout(() => showToast("🎉", `+${xpGain} XP – Gut gemacht!`), 300);
    } else if (feedback === "teilweise") {
      setTimeout(() => showToast("💪", `+${xpGain} XP – Weitermachen!`), 100);
    }
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t;
      addXP(xpGain);
      markStudiedToday();
      const newPriority = feedback === "verstanden" ? (t.priority || 1) * 0.5
        : feedback === "teilweise" ? (t.priority || 1) * 1.2
        : (t.priority || 1) * 2;
      return { ...t, done: feedback === "verstanden", feedback, priority: newPriority, doneDate: todayStr() };
    }));
    setExams(prev => prev.map(e => {
      if (e.id !== tasks.find(t => t.id === id)?.examId) return e;
      const examTasks = tasks.filter(t => t.examId === e.id);
      const doneTasks = examTasks.filter(t => t.done || t.id === id).length;
      return { ...e, progress: Math.round((doneTasks / examTasks.length) * 100) };
    }));
    setActiveTask(null);
  };

  // Heutige Tasks: sortiert nach Priorität, gefiltert auf heute
  const todayTasks = tasks
    .filter(t => !t.done && !t.doneDate && (!t.plannedDate || t.plannedDate <= todayStr()))
    .sort((a, b) => {
      const examA = exams.find(e => e.id === a.examId);
      const examB = exams.find(e => e.id === b.examId);
      const prioA = (examA ? calcPriority(examA) : 0) * (a.priority || 1);
      const prioB = (examB ? calcPriority(examB) : 0) * (b.priority || 1);
      return prioB - prioA;
    });

  // Wie viele Minuten heute schon geplant
  const usedMinutesToday = todayTasks.slice(0, 20).reduce((sum, t) => sum + (t.duration || 25), 0);

  const navItems = [
    { id: "dashboard", icon: "⚡", label: "Dashboard" },
    { id: "kalender", icon: "🗓️", label: "Kalender" },
    { id: "heute", icon: "📋", label: "Heute" },
    { id: "exams", icon: "📅", label: "Klausuren" },
    { id: "upload", icon: "📄", label: "Unterlagen" },
    { id: "plan", icon: "📊", label: "Lernplan" },
    { id: "karten", icon: "🃏", label: "Flashcards" },
    { id: "focus", icon: "🎯", label: "Fokus" },
    { id: "badges", icon: "🏅", label: "Badges" },
    { id: "chat", icon: "🤖", label: "KI-Coach" },
  ];

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div style={{ fontFamily: T.font, fontSize: 28, fontWeight: 800 }}><span style={{ color: T.accent }}>fokus</span>flow</div>
        <div style={{ width: 36, height: 36, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  if (!user) return <LoginScreen />;

  if (activeTask) {
    return <LernModus task={activeTask} exams={exams} cards={cards} setCards={setCards} onComplete={completeTask} onCancel={() => setActiveTask(null)} addXP={addXP} />;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: T.bg, overflow: "hidden", maxWidth: "100vw" }}>
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
          background: T.card, border: `1px solid ${T.accent}`, borderRadius: 12,
          padding: "12px 20px", display: "flex", alignItems: "center", gap: 10,
          zIndex: 9999, boxShadow: `0 8px 32px ${T.accent}44`,
          animation: "fadeUp 0.3s ease", maxWidth: "90vw",
        }}>
          <span style={{ fontSize: 22 }}>{toast.icon}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{toast.text}</span>
        </div>
      )}

      {/* Confetti nach Task abgeschlossen */}
      {completionAnim && (
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9998, overflow: "hidden" }}>
          {Array.from({length: 18}).map((_, i) => (
            <div key={i} style={{
              position: "absolute",
              left: `${10 + (i * 5.2) % 85}%`,
              top: `${20 + (i * 7) % 40}%`,
              width: 10, height: 10,
              borderRadius: i % 3 === 0 ? "50%" : i % 3 === 1 ? "2px" : "50% 0",
              background: [T.accent, T.green, T.yellow, T.orange, "#a78bfa", "#34d399"][i % 6],
              animation: `confetti-fall ${0.8 + (i * 0.1) % 0.8}s ease-out ${(i * 0.06)}s forwards`,
            }} />
          ))}
          <div style={{
            position: "absolute", top: "35%", left: "50%", transform: "translateX(-50%)",
            fontFamily: T.font, fontSize: 28, fontWeight: 800, color: T.green,
            animation: "xp-float 1.5s ease-out forwards", textShadow: `0 0 20px ${T.green}88`,
            whiteSpace: "nowrap",
          }}>✅ Verstanden! +XP</div>
        </div>
      )}

      {/* Desktop Sidebar – versteckt auf Mobile */}
      <nav style={{ width: 220, background: T.surface, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", padding: "24px 0", position: "sticky", top: 0, height: "100vh", overflowY: "auto", flexShrink: 0 }}
        className="desktop-nav">
        <div style={{ padding: "0 20px 28px" }}>
          <div style={{ fontFamily: T.font, fontSize: 20, fontWeight: 800, color: T.text, letterSpacing: -0.5 }}>
            <span style={{ color: T.accent }}>fokus</span>flow
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>Smarter lernen.</div>
          <div style={{ fontSize: 10, color: T.muted, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{user?.email}</div>
          {syncing && (
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", border: `1.5px solid ${T.accent}`, borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
              <span style={{ fontSize: 9, color: T.accent }}>Wird gespeichert...</span>
            </div>
          )}
          {generatingSemester && (
            <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 5, background: T.accentSoft, borderRadius: 6, padding: "3px 8px" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", border: `1.5px solid ${T.accent}`, borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
              <span style={{ fontSize: 9, color: T.accent }}>Semesterplan...</span>
            </div>
          )}
          <button onClick={async () => { await signOut(); resetData(); }} style={{
            marginTop: 8, background: "transparent", border: `1px solid ${T.border}`,
            borderRadius: 8, padding: "4px 10px", color: T.muted, cursor: "pointer",
            fontSize: 11, width: "100%", textAlign: "left",
          }}>↩ Abmelden</button>
        </div>

        <div style={{ margin: "0 16px 24px", background: T.card, borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: T.muted }}>Level {getLevel(xp)}</span>
            <span style={{ fontSize: 12, color: T.accent, fontWeight: 600 }}>{xp} XP</span>
          </div>
          <div style={{ background: T.border, borderRadius: 99, height: 6, overflow: "hidden" }}>
            <div style={{ width: `${getXPProgress(xp)}%`, background: `linear-gradient(90deg, ${T.accent}, #a78bfa)`, height: "100%", borderRadius: 99, transition: "width 0.6s ease" }} />
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 5 }}>{100 - getXPProgress(xp)} XP bis Level {getLevel(xp) + 1}</div>
        </div>

        {navItems.map((n) => {
          const badge = n.id === "heute" ? todayTasks.length : 0;
          return (
            <button key={n.id} onClick={() => switchTab(n.id)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 20px",
              background: tab === n.id ? T.accentSoft : "transparent",
              border: "none", color: tab === n.id ? T.text : T.muted,
              cursor: "pointer", fontSize: 14, fontFamily: T.body, textAlign: "left",
              borderLeft: `3px solid ${tab === n.id ? T.accent : "transparent"}`,
              transition: "all 0.15s", position: "relative",
            }}>
              <span>{n.icon}</span> {n.label}
              {badge > 0 && (
                <span style={{ marginLeft: "auto", background: T.accent, color: "white", borderRadius: 99, fontSize: 10, padding: "1px 7px", fontWeight: 700 }}>{badge}</span>
              )}
            </button>
          );
        })}

        <div style={{ marginTop: "auto", padding: "0 16px" }}>
          {(() => {
            const si = getStreakInfo(streak);
            return (
              <div style={{ background: `linear-gradient(135deg, ${si.color}22, ${si.color}11)`, border: `1px solid ${si.color}33`, borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontSize: 22 }}>{si.icon}</div>
                <div style={{ fontFamily: T.font, fontWeight: 700, fontSize: 18, color: si.color }}>{si.label}</div>
                <div style={{ fontSize: 11, color: T.muted }}>{si.sub}</div>
              </div>
            );
          })()}
        </div>
      </nav>

      {/* Mobile Header */}
      <div className="mobile-header" style={{ display: "none", position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "10px 16px", alignItems: "center", justifyContent: "space-between", height: 56, overflow: "hidden" }}>
        <div style={{ fontFamily: T.font, fontSize: 18, fontWeight: 800, flexShrink: 0 }}>
          <span style={{ color: T.accent }}>fokus</span>flow
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div onClick={() => setTab("badges")} style={{ background: T.accentSoft, borderRadius: 99, padding: "4px 12px", fontSize: 12, color: T.accent, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer" }}>
            ⚡ {xp} XP
          </div>
          {syncing && <div style={{ width: 8, height: 8, borderRadius: "50%", border: `2px solid ${T.accent}`, borderTopColor: "transparent", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />}
        </div>
      </div>

      {/* Main Content */}
      <main style={{ flex: 1, overflow: "auto", minWidth: 0, maxWidth: "100%" }} className="main-content">
        {tab === "dashboard" && <Dashboard tasks={tasks} exams={exams} tip={tip} xp={xp} streak={streak} dailyMinutes={dailyMinutes} usedMinutesToday={usedMinutesToday} setTab={setTab} />}
        {tab === "heute" && <Heute tasks={todayTasks} exams={exams} cards={cards} setCards={setCards} addXP={addXP} dailyMinutes={dailyMinutes} setDailyMinutes={setDailyMinutes} setActiveTask={setActiveTask} />}
        {tab === "exams" && <Exams exams={exams} setExams={setExams} />}
        {tab === "upload" && <Upload exams={exams} addXP={addXP} onAnalysisComplete={(examId, topics) => {
          setExams(prev => prev.map(e => e.id === examId ? { ...e, topics } : e));
          setTab("plan");
        }} />}
        {tab === "plan" && <Plan exams={exams} setExams={setExams} tasks={tasks} setTasks={setTasks} dailyMinutes={dailyMinutes} />}
        {tab === "kalender" && <Kalender exams={exams} tasks={tasks} setTasks={setTasks} dailyMinutes={dailyMinutes} addXP={addXP} semesterPlan={semesterPlan} setSemesterPlan={setSemesterPlan} generating={generatingSemester} setGenerating={setGeneratingSemester} />}
        {tab === "focus" && <Focus addXP={addXP} markStudiedToday={markStudiedToday} />}
        {tab === "karten" && <Flashcards exams={exams} cards={cards} setCards={setCards} addXP={addXP} />}
        {tab === "badges" && <BadgesTab badges={badges} xp={xp} streak={streak} tasks={tasks} onImport={handleDataImport} />}
        {tab === "chat" && <Chat exams={exams} tasks={tasks} />}
      </main>

      {/* Mobile Bottom Navigation */}
      <div className="mobile-nav" style={{ display: "none", position: "fixed", bottom: 0, left: 0, right: 0, background: T.surface, borderTop: `1px solid ${T.border}`, zIndex: 100, paddingBottom: "env(safe-area-inset-bottom, 8px)" }}>
        <div style={{ display: "flex", justifyContent: "space-around", alignItems: "stretch" }}>
          {[
            { id: "dashboard", icon: "⚡", label: "Start" },
            { id: "heute", icon: "📋", label: "Heute" },
            { id: "kalender", icon: "🗓️", label: "Plan" },
            { id: "karten", icon: "🃏", label: "Karten" },
            { id: "focus", icon: "🎯", label: "Fokus" },
          ].map(n => {
            const isActive = tab === n.id;
            return (
              <button key={n.id} onClick={() => switchTab(n.id)} style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", gap: 4, background: "transparent", border: "none",
                color: isActive ? T.accent : T.muted, cursor: "pointer",
                padding: "12px 4px 10px", minHeight: 64, position: "relative",
                WebkitTapHighlightColor: "transparent",
              }}>
                {isActive && (
                  <div style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: 2, background: T.accent, borderRadius: "0 0 4px 4px" }} />
                )}
                <span style={{ fontSize: 24 }}>{n.icon}</span>
                <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 400 }}>{n.label}</span>
                {n.id === "heute" && todayTasks.length > 0 && (
                  <div style={{ position: "absolute", top: 10, right: "22%", width: 8, height: 8, borderRadius: "50%", background: T.accent, border: `2px solid ${T.surface}` }} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════
function Dashboard({ tasks, exams, tip, xp, streak, dailyMinutes, usedMinutesToday, setTab }) {
  const isMobile = useIsMobile();
  const doneTasks = tasks.filter(t => t.done).length;
  const totalTasks = tasks.length;
  const pct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const sortedExams = [...exams].sort((a, b) => calcPriority(b) - calcPriority(a));
  // Nur heutige Tasks zählen für den Fokus
  const todayDone = tasks.filter(t => t.done && t.doneDate === todayStr()).length;
  const todayTotal = tasks.filter(t => !t.doneDate && (!t.plannedDate || t.plannedDate <= todayStr())).length + todayDone;
  const todayPct = todayTotal ? Math.round((todayDone / todayTotal) * 100) : 0;

  return (
    <div style={{ padding: isMobile ? 16 : 32, animation: "fadeUp 0.4s ease" }}>
      <div style={{ marginBottom: isMobile ? 16 : 24 }}>
        <div style={{ fontFamily: T.font, fontSize: isMobile ? 22 : 28, fontWeight: 800, letterSpacing: -1 }}>
          {todayDone > 0 && todayDone >= todayTotal ? "Tagesplan erledigt! 🎉" : "Guten Morgen! 👋"}
        </div>
        <div style={{ color: T.muted, marginTop: 4 }}>{todayLabel()}</div>
      </div>

      {/* Heute-Fokus Box – prominent wenn Tasks vorhanden */}
      {todayTotal > 0 && (
        <div style={{ background: todayDone >= todayTotal ? `linear-gradient(135deg, ${T.green}22, ${T.card})` : `linear-gradient(135deg, ${T.accentSoft}, ${T.card})`, border: `2px solid ${todayDone >= todayTotal ? T.green : T.accent}44`, borderRadius: 16, padding: "16px 20px", marginBottom: isMobile ? 14 : 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: todayDone >= todayTotal ? T.green : T.accent, fontWeight: 600, marginBottom: 3 }}>HEUTE</div>
              <div style={{ fontFamily: T.font, fontSize: isMobile ? 20 : 24, fontWeight: 800 }}>
                {todayDone} / {todayTotal} <span style={{ fontSize: 14, color: T.muted, fontWeight: 400 }}>Aufgaben</span>
              </div>
            </div>
            <div style={{ fontFamily: T.font, fontSize: 32, fontWeight: 800, color: todayDone >= todayTotal ? T.green : T.accent }}>{todayPct}%</div>
          </div>
          <div style={{ background: T.border, borderRadius: 99, height: 8, overflow: "hidden" }}>
            <div style={{ width: `${todayPct}%`, background: todayDone >= todayTotal ? `linear-gradient(90deg, ${T.green}, #34d399)` : `linear-gradient(90deg, ${T.accent}, #a78bfa)`, height: "100%", borderRadius: 99, transition: "width 0.6s ease" }} />
          </div>
          {todayDone < todayTotal && (
            <div style={{ fontSize: 12, color: T.muted, marginTop: 8 }}>
              Noch {todayTotal - todayDone} Aufgaben für heute · {usedMinutesToday} min geplant
            </div>
          )}
        </div>
      )}

      <div style={{ background: `linear-gradient(135deg, ${T.accentSoft}, ${T.card})`, border: `1px solid ${T.accent}22`, borderRadius: 14, padding: "12px 16px", marginBottom: isMobile ? 14 : 20, display: "flex", alignItems: "flex-start", gap: 12, overflow: "hidden" }}>
        <div style={{ fontSize: 20, flexShrink: 0 }}>💡</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 10, color: T.accent, fontWeight: 600, marginBottom: 2 }}>TIPP DES TAGES</div>
          <div style={{ fontSize: 13, wordBreak: "break-word" }}>{tip}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: isMobile ? 10 : 16, marginBottom: isMobile ? 14 : 20, width: "100%" }}>
        <StatCard icon="📊" label="Gesamt" value={`${pct}%`} sub={`${doneTasks}/${totalTasks}`} color={T.green} />
        <StatCard icon="⚡" label="XP" value={xp} sub={`Level ${getLevel(xp)}`} color={T.accent} />
        <StatCard icon={getStreakInfo(streak).icon} label="Streak" value={getStreakInfo(streak).label} sub={getStreakInfo(streak).sub} color={getStreakInfo(streak).color} />
        <StatCard icon="⏱" label="Heute" value={`${Math.min(usedMinutesToday, dailyMinutes)}m`} sub={`von ${dailyMinutes} min`} color={T.orange} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.5fr 1fr", gap: isMobile ? 12 : 20, width: "100%", minWidth: 0 }}>
        <Card title="📅 Klausuren – Priorität" subtitle="Sortiert nach Dringlichkeit & Lernfortschritt">
          {sortedExams.length === 0 ? (
            <div style={{ color: T.muted, fontSize: 14, padding: "12px 0" }}>Noch keine Klausuren. Geh zu „Klausuren" um loszulegen! 🚀</div>
          ) : sortedExams.map((e) => {
            const d = daysUntil(e.date);
                        const prog = e.progress || 0;
            return (
              <div key={e.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{e.subject}</div>
                    <div style={{ fontSize: 11, color: T.muted }}>{d === 0 ? "Heute!" : `${d} Tage`}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, color: T.accent, fontWeight: 600 }}>{prog}%</div>
                    <div style={{ fontSize: 11, color: T.muted }}>Fortschritt</div>
                  </div>
                </div>
                <div style={{ background: T.border, borderRadius: 99, height: 6, overflow: "hidden" }}>
                  <div style={{ width: `${prog}%`, background: `linear-gradient(90deg, ${e.color || T.accent}, ${T.accent})`, height: "100%", borderRadius: 99, transition: "width 0.8s ease" }} />
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {(e.topics || []).slice(0, 3).map(t => (
                    <span key={t} style={{ background: (e.color || T.accent) + "22", color: e.color || T.accent, borderRadius: 6, padding: "2px 8px", fontSize: 10 }}>{t}</span>
                  ))}
                  {(e.topics || []).length > 3 && <span style={{ fontSize: 10, color: T.muted }}>+{e.topics.length - 3} mehr</span>}
                </div>
              </div>
            );
          })}
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 20 }}>
            <div style={{ fontFamily: T.font, fontWeight: 700, fontSize: 15, marginBottom: 12 }}>🎯 Heute starten</div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 16, lineHeight: 1.6 }}>
              Dein Tagesplan wartet. Die KI hat die wichtigsten Aufgaben bereits priorisiert.
            </div>
            <button onClick={() => setTab("heute")} style={{
              width: "100%", background: `linear-gradient(135deg, ${T.accent}, #9f8ffa)`,
              border: "none", borderRadius: 12, padding: "14px", color: "white",
              cursor: "pointer", fontSize: 15, fontWeight: 700, fontFamily: T.font,
            }}>
              📋 Zum Tagesplan →
            </button>
          </div>

          <Card title="🏅 Fächer-Übersicht" subtitle="">
            {exams.length === 0 ? (
              <div style={{ color: T.muted, fontSize: 13 }}>Keine Fächer eingetragen.</div>
            ) : exams.map(e => {
              const examTasks = tasks.filter(t => t.examId === e.id);
              const done = examTasks.filter(t => t.done).length;
              return (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: e.color || T.accent, flexShrink: 0 }} />
                  <div style={{ flex: 1, fontSize: 13 }}>{e.subject}</div>
                  <div style={{ fontSize: 11, color: T.muted }}>{done}/{examTasks.length}</div>
                </div>
              );
            })}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════
// HEUTE TAB
// ════════════════════════════════════════════════
function Heute({ tasks, exams, cards, setCards, addXP, dailyMinutes, setDailyMinutes, setActiveTask }) {
  const isMobile = useIsMobile();
  const [editingTime, setEditingTime] = useState(false);
  const [tempMin, setTempMin] = useState(dailyMinutes);
  const [prepTask, setPrepTask] = useState(null);
  const [prepMode, setPrepMode] = useState(null);
  const [prepCards, setPrepCards] = useState([]);
  const [showMorgen, setShowMorgen] = useState(false);

  // Tagesplan berechnen
  let timeLeft = dailyMinutes;
  const todayPlan = [];
  for (const t of tasks) {
    const dur = t.duration || 25;
    if (timeLeft >= dur) { todayPlan.push(t); timeLeft -= dur; }
    if (timeLeft < 15) break;
  }
  const totalPlanned = todayPlan.reduce((s, t) => s + (t.duration || 25), 0);
  const todayDoneCount = tasks.filter(t => t.done && t.doneDate === todayStr()).length;
  const isFlowMode = todayDoneCount >= todayPlan.length && todayPlan.length > 0;

  // Morgen-Aufgaben: geplante Tasks für morgen
  const tomorrow = (() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();
  const morgenTasks = tasks.filter(t => !t.done && t.plannedDate === tomorrow).slice(0, 5);
  const extraTasks = tasks.filter(t => !t.done && !todayPlan.includes(t) && t.plannedDate !== tomorrow).slice(0, 3);

  const existingCards = (t) => {
    const allForExam = (cards || []).filter(c => c.examId === t.examId);
    // Erst themenspezifische Karten, dann alle des Fachs als Fallback
    const topicCards = allForExam.filter(c => c.topic === t.text);
    return topicCards.length >= 3 ? topicCards : allForExam;
  };

  const openPrep = (t, exam) => {
    setPrepTask({ task: t, exam });
    setPrepMode("choose");
    setPrepCards(existingCards(t));
  };

  const generateCardsForTask = async (t, exam) => {
    setPrepMode("generating");
    const existing = (cards || []).filter(c => c.examId === t.examId);
    const existingFronts = existing.map(c => c.front).join(", ");
    const prompt = `Erstelle 8 Flashcards speziell für das Thema "${t.text}" aus dem Fach "${exam?.subject}".
Themen: ${(exam?.topics || []).join(", ") || t.text}
ADHS-gerecht: kurze prägnante Antworten, max 1 Satz pro Seite.
${existingFronts ? `Bereits vorhanden (nicht wiederholen): ${existingFronts.slice(0, 300)}` : ""}
NUR reines JSON: {"cards":[{"front":"Frage...","back":"Antwort..."}]}`;
    try {
      const raw = await callClaude([{ role: "user", content: prompt }]);
      const parsed = safeParseJSON(raw);
      const newCards = (parsed.cards || []).map(c => ({
        id: randomId(), front: c.front, back: c.back,
        examId: t.examId, examSubject: exam?.subject,
        examColor: exam?.color || T.accent,
        topic: t.text,
        score: 0, createdAt: Date.now(),
      }));
      // Karten ergänzen, nicht überschreiben
      setCards(prev => [...prev, ...newCards]);
      addXP(15);
      setPrepCards([...existing, ...newCards]);
      setPrepMode("ready");
    } catch { setPrepMode("choose"); }
  };

  const startWithCards = (sessionCards) => {
    const t = prepTask.task;
    const exam = prepTask.exam;
    // Automatische Zeitberechnung: ~2 min pro Karte, min 10 min, max task.duration
    const autoMin = sessionCards.length > 0
      ? Math.min(t.duration || 25, Math.max(10, Math.ceil(sessionCards.length * 2)))
      : (t.duration || 25);
    const taskWithDuration = { ...t, duration: autoMin };
    setPrepTask(null); setPrepMode(null); setPrepCards([]);
    setActiveTask({ task: taskWithDuration, examId: t.examId, examSubject: exam?.subject, examColor: exam?.color, sessionCards });
  };

  const startWithoutCards = () => {
    const t = prepTask.task;
    const exam = prepTask.exam;
    setPrepTask(null); setPrepMode(null); setPrepCards([]);
    setActiveTask({ task: t, examId: t.examId, examSubject: exam?.subject, examColor: exam?.color, sessionCards: [] });
  };

  // ── Vorbereitungs-Overlay ──
  if (prepTask) {
    const { task: t, exam } = prepTask;
    return (
      <div style={{ padding: "clamp(12px, 4vw, 32px)", animation: "fadeUp 0.4s ease", maxWidth: 560, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>SESSION VORBEREITUNG</div>
            <div style={{ fontFamily: T.font, fontWeight: 800, fontSize: 20 }}>{t.text}</div>
            <div style={{ fontSize: 12, color: exam?.color || T.accent, marginTop: 2 }}>{exam?.subject} · {t.duration || 25} min</div>
          </div>
          <button onClick={() => { setPrepTask(null); setPrepMode(null); }}
            style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 16px", color: T.muted, cursor: "pointer", fontSize: 13 }}>✕</button>
        </div>

        {prepMode === "generating" && (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: "48px 32px", textAlign: "center" }}>
            <div style={{ width: 40, height: 40, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
            <div style={{ fontFamily: T.font, fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Flashcards werden erstellt...</div>
            <div style={{ fontSize: 13, color: T.muted }}>Die KI erstellt 8 Lernkarten für dieses Thema</div>
          </div>
        )}

        {prepMode === "ready" && (
          <div style={{ animation: "fadeUp 0.3s ease" }}>
            <div style={{ background: T.green + "22", border: `1px solid ${T.green}44`, borderRadius: 16, padding: "16px 20px", marginBottom: 20, display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ fontSize: 28 }}>🃏</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: T.green }}>{prepCards.length} Flashcards bereit!</div>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                  Empfohlene Lernzeit: <strong style={{ color: T.text }}>{Math.min(prepTask.task.duration || 25, Math.max(10, Math.ceil(prepCards.length * 2)))} min</strong> (angepasst auf {prepCards.length} Karten)
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
              {prepCards.slice(0, 4).map(c => (
                <div key={c.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 12px", fontSize: 11, color: T.muted, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.front}
                </div>
              ))}
              {prepCards.length > 4 && <div style={{ fontSize: 11, color: T.muted, padding: "6px 0" }}>+{prepCards.length - 4} mehr...</div>}
            </div>
            <Btn onClick={() => startWithCards(prepCards)} style={{ width: "100%", padding: "14px" }}>
              ▶ Session starten mit Flashcards
            </Btn>
          </div>
        )}

        {prepMode === "choose" && (() => {
                const topicSpecific = (cards || []).filter(c => c.examId === t.examId && c.topic === t.text);
          const hasTopicCards = topicSpecific.length >= 3;
          const existing = (cards || []).filter(c => c.examId === t.examId);
          
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 20 }}>
                <div style={{ fontFamily: T.font, fontWeight: 700, fontSize: 15, marginBottom: 6 }}>🃏 Flashcards für diese Session</div>
                <div style={{ fontSize: 13, color: T.muted, marginBottom: 16, lineHeight: 1.6 }}>
                  Lerne während des Timers mit Karten und werde danach abgefragt.
                </div>

                {/* Themenspezifische Karten – beste Option */}
                {hasTopicCards && (
                  <button onClick={() => startWithCards(topicSpecific)}
                    style={{ width: "100%", background: T.green + "22", border: `1px solid ${T.green}44`, borderRadius: 12, padding: "14px 18px", color: T.text, cursor: "pointer", textAlign: "left", marginBottom: 10 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>✅ Gespeicherte Karten für dieses Thema</div>
                    <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>
                      {topicSpecific.length} Karten für „{t.text}" – keine neuen Tokens nötig
                    </div>
                  </button>
                )}

                {/* Alle Fach-Karten wenn keine themenspezifischen */}
                {!hasTopicCards && existing.length > 0 && (
                  <button onClick={() => startWithCards(existing)}
                    style={{ width: "100%", background: T.accentSoft, border: `1px solid ${T.accent}44`, borderRadius: 12, padding: "14px 18px", color: T.text, cursor: "pointer", textAlign: "left", marginBottom: 10 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>🃏 Vorhandene Karten für {exam?.subject} nutzen</div>
                    <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>
                      {existing.length} Karten aus dem Fach – kein API-Aufruf nötig
                    </div>
                  </button>
                )}

                {/* KI neue Karten generieren */}
                <button onClick={() => generateCardsForTask(t, exam)}
                  style={{ width: "100%", background: `linear-gradient(135deg, ${T.accent}22, ${T.accentSoft})`, border: `1px solid ${T.accent}55`, borderRadius: 12, padding: "14px 18px", color: T.text, cursor: "pointer", textAlign: "left", marginBottom: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    🤖 {hasTopicCards ? "Neue Karten ergänzen" : "KI erstellt Flashcards für dieses Thema"}
                  </div>
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>
                    {hasTopicCards
                      ? `${topicSpecific.length} vorhanden + 8 neue hinzufügen (+15 XP)`
                      : `8 neue Karten speziell für „${t.text}" (+15 XP)`}
                  </div>
                </button>
              </div>

              {/* Ohne Karten */}
              <button onClick={startWithoutCards}
                style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 18px", color: T.muted, cursor: "pointer", fontSize: 13, textAlign: "center" }}>
                📚 Ohne Flashcards starten – ich lerne mit eigenen Unterlagen
              </button>
            </div>
          );
        })()}
      </div>
    );
  }

  return (
    <div style={{ padding: "clamp(12px, 4vw, 32px)", animation: "fadeUp 0.4s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <PageHeader title="📋 Heute lernen" sub="Dein priorisierter Tagesplan" />
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 16px", minWidth: 180 }}>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>⏱ Verfügbare Zeit heute</div>
          {editingTime ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="number" value={tempMin} onChange={e => setTempMin(Number(e.target.value))}
                style={{ width: 70, background: T.surface, border: `1px solid ${T.accent}`, borderRadius: 8, padding: "4px 8px", color: T.text, fontSize: 14 }} />
              <span style={{ fontSize: 12, color: T.muted }}>min</span>
              <button onClick={() => { setDailyMinutes(tempMin); setEditingTime(false); }}
                style={{ background: T.accent, border: "none", borderRadius: 6, padding: "4px 10px", color: "white", cursor: "pointer", fontSize: 12 }}>✓</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: T.font, fontWeight: 700, fontSize: 20, color: T.accent }}>{dailyMinutes}</span>
              <span style={{ fontSize: 12, color: T.muted }}>min</span>
              <button onClick={() => setEditingTime(true)}
                style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", fontSize: 12, marginLeft: 4 }}>✏️</button>
            </div>
          )}
          <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>Geplant: {totalPlanned} min</div>
        </div>
      </div>

      {/* Zeitbalken */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 18px", marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: T.muted }}>Tageskapazität</span>
          <span style={{ fontSize: 12, color: totalPlanned > dailyMinutes ? T.red : T.green }}>{totalPlanned}/{dailyMinutes} min</span>
        </div>
        <div style={{ background: T.border, borderRadius: 99, height: 8, overflow: "hidden" }}>
          <div style={{ width: `${Math.min(100, (totalPlanned / dailyMinutes) * 100)}%`, background: totalPlanned > dailyMinutes ? T.red : `linear-gradient(90deg, ${T.accent}, ${T.green})`, height: "100%", borderRadius: 99, transition: "width 0.6s" }} />
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
          {exams.map(e => {
            const examTasksToday = todayPlan.filter(t => t.examId === e.id);
            if (!examTasksToday.length) return null;
            const mins = examTasksToday.reduce((s, t) => s + (t.duration || 25), 0);
            return (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: e.color || T.accent }} />
                <span style={{ fontSize: 11, color: T.muted }}>{e.subject}: {mins} min</span>
              </div>
            );
          })}
        </div>
      </div>

      {todayPlan.length === 0 ? (
        <EmptyState icon="🎉" text="Alle Aufgaben erledigt oder noch kein Lernplan erstellt! Geh zu 'Lernplan' um loszulegen." />
      ) : (
        <>
          {/* Fokus-Banner: nur heutige Aufgaben prominent zeigen */}
          <div style={{ background: T.accentSoft, border: `1px solid ${T.accent}33`, borderRadius: 14, padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: T.font, fontWeight: 700, fontSize: 15 }}>
                {todayDoneCount === 0 ? "Heute startest du mit:" : `${todayDoneCount} von ${todayPlan.length} erledigt`}
              </div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                {todayPlan.length - todayDoneCount} Aufgaben · {totalPlanned} min Lernzeit
              </div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {todayPlan.map((_, i) => (
                <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: i < todayDoneCount ? T.green : T.border, transition: "background 0.3s" }} />
              ))}
            </div>
          </div>

          {/* Aufgabenliste */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {todayPlan.map((t, idx) => {
              const exam = exams.find(e => e.id === t.examId);
              const isFirst = idx === 0 && todayDoneCount === idx;
              const prio = idx < 2 ? "🔴" : idx < 5 ? "🟡" : "🟢";
              const hasCards = (cards || []).filter(c => c.examId === t.examId).length;

              return (
                <div key={t.id} style={{
                  background: T.card, border: `1px solid ${isFirst ? T.accent : T.border}`,
                  borderRadius: 14, padding: isMobile ? "14px" : "16px 20px",
                  borderLeft: `4px solid ${exam?.color || T.accent}`,
                  animation: "fadeUp 0.3s ease",
                  boxShadow: isFirst ? `0 0 20px ${T.accent}22` : "none",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11 }}>{prio}</span>
                        <span style={{ fontSize: 11, background: (exam?.color || T.accent) + "22", color: exam?.color || T.accent, borderRadius: 6, padding: "1px 8px" }}>{exam?.subject}</span>
                        <span style={{ fontSize: 11, color: T.muted }}>⏱ {t.duration || 25} min</span>
                        {hasCards > 0 && <span style={{ fontSize: 11, color: T.green }}>🃏 {hasCards}</span>}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: isFirst ? 8 : 0 }}>{t.text}</div>
                      {isFirst && (
                        <div style={{ fontSize: 11, color: T.accent, fontWeight: 600 }}>👆 Als nächstes starten</div>
                      )}
                    </div>
                    <button onClick={() => openPrep(t, exam)}
                      style={{ background: isFirst ? `linear-gradient(135deg, ${T.accent}, #9f8ffa)` : T.surface, border: isFirst ? "none" : `1px solid ${T.border}`, borderRadius: 10, padding: isMobile ? "10px 14px" : "10px 20px", color: isFirst ? "white" : T.muted, cursor: "pointer", fontSize: 13, fontWeight: 600, flexShrink: 0, animation: isFirst ? "bounce 2s ease infinite" : "none" }}>
                      ▶
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pause-Hinweis nach jeder 2. Aufgabe */}
          {todayDoneCount > 0 && todayDoneCount % 2 === 0 && todayDoneCount < todayPlan.length && (
            <div style={{ background: T.green + "11", border: `1px solid ${T.green}33`, borderRadius: 12, padding: "12px 16px", marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 20 }}>☕</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: T.green }}>Zeit für eine kurze Pause!</div>
                <div style={{ fontSize: 11, color: T.muted }}>5-10 Minuten Pause verbessern die Konzentration.</div>
              </div>
            </div>
          )}

          {/* Flow-Modus: Tagesplan erledigt */}
          {isFlowMode && (
            <div style={{ marginTop: 20, background: `linear-gradient(135deg, ${T.green}22, ${T.accentSoft})`, border: `2px solid ${T.green}44`, borderRadius: 16, padding: "20px", textAlign: "center", animation: "glow 3s ease infinite" }}>
              <div style={{ fontSize: isMobile ? 28 : 36, marginBottom: 8 }}>🔥</div>
              <div style={{ fontFamily: T.font, fontWeight: 800, fontSize: isMobile ? 18 : 22, color: T.green, marginBottom: 6 }}>Du bist im Flow!</div>
              <div style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>Tagesplan erledigt – du bist motiviert, nutze das aus!</div>
              <button onClick={() => setShowMorgen(v => !v)}
                style={{ background: `linear-gradient(135deg, ${T.green}, ${T.accent})`, border: "none", borderRadius: 12, padding: "12px 24px", color: "white", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>
                {showMorgen ? "Einklappen ↑" : "Morgen-Aufgaben anzeigen →"}
              </button>
            </div>
          )}

          {/* Morgen-Aufgaben im Flow-Modus */}
          {((isFlowMode && showMorgen) || !isFlowMode) && morgenTasks.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, color: T.muted, fontWeight: 600, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                {isFlowMode ? "⚡ Nächste Aufgaben (eigentlich für morgen):" : "💡 Im Flow? Hier sind die nächsten Aufgaben:"}
              </div>
              {(isFlowMode ? morgenTasks : [...morgenTasks, ...extraTasks].slice(0, 3)).map(t => {
                const exam = exams.find(e => e.id === t.examId);
                return (
                  <div key={t.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 10, display: "flex", alignItems: "center", gap: 12, opacity: 0.9 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, background: (exam?.color || T.accent) + "22", color: exam?.color || T.accent, borderRadius: 6, padding: "1px 8px" }}>{exam?.subject}</span>
                        <span style={{ fontSize: 11, color: T.muted }}>⏱ {t.duration || 25} min</span>
                        {t.plannedDate === tomorrow && <span style={{ fontSize: 10, color: T.yellow, background: T.yellow + "22", borderRadius: 6, padding: "1px 6px" }}>morgen geplant</span>}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{t.text}</div>
                    </div>
                    <button onClick={() => openPrep(t, exam)}
                      style={{ background: T.accentSoft, border: `1px solid ${T.accent}44`, borderRadius: 10, padding: "8px 16px", color: T.accent, cursor: "pointer", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
                      ▶
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════
// LERNMODUS (Vollbild)
// ════════════════════════════════════════════════
function LernModus({ task, exams, cards, setCards, onComplete, onCancel, addXP }) {
  const isMobile = useIsMobile();
  const exam = exams.find(e => e.id === task.examId);
  const sessionCards = task.sessionCards || [];
  const [phase, setPhase] = useState("timer"); // timer | quiz
  const [seconds, setSeconds] = useState((task.task?.duration || 25) * 60);
  const [running, setRunning] = useState(true);
  const [quiz, setQuiz] = useState(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const intervalRef = useRef();
  // Flashcard-Sidebar im Timer
  const [fcIdx, setFcIdx] = useState(0);
  const [fcFlipped, setFcFlipped] = useState(false);
  const [fcResults, setFcResults] = useState([]);

  useEffect(() => {
    if (running && seconds > 0) {
      intervalRef.current = setInterval(() => setSeconds(s => s - 1), 1000);
    } else if (seconds === 0) {
      clearInterval(intervalRef.current);
      setRunning(false);
      startQuiz();
    }
    return () => clearInterval(intervalRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, seconds]);

  const startQuiz = async () => {
    setPhase("quiz");
    setQuizLoading(true);
    const prompt = `Erstelle 3 kurze Verständnisfragen für das Thema "${task.task?.text}" aus "${exam?.subject}".
NUR reines JSON: {"questions":[{"q":"...","options":["...","...","...","..."],"correct":0,"explanation":"..."}]}
Max 3 Fragen, 4 Optionen, correct = Index der richtigen Antwort.`;
    try {
      const raw = await callClaude([{ role: "user", content: prompt }]);
      const parsed = safeParseJSON(raw);
      setQuiz(parsed);
    } catch { setQuiz({ questions: [] }); }
    setQuizLoading(false);
  };

  const calcFeedback = () => {
    if (!quiz?.questions?.length) return "teilweise";
    const correct = quiz.questions.filter((q, i) => answers[i] === q.correct).length;
    const ratio = correct / quiz.questions.length;
    // Flashcard-Ergebnis einbeziehen wenn vorhanden
    const fcRatio = fcResults.length > 0 ? fcResults.filter(Boolean).length / fcResults.length : 0.5;
    const combined = quiz.questions.length > 0 ? (ratio * 0.7 + fcRatio * 0.3) : fcRatio;
    return combined >= 0.75 ? "verstanden" : combined >= 0.4 ? "teilweise" : "wiederholen";
  };

  const fcNext = (knew) => {
    if (setCards) {
      setCards(prev => prev.map(c => c.id === sessionCards[fcIdx]?.id
        ? { ...c, score: knew ? (c.score || 0) + 1 : Math.max(0, (c.score || 0) - 1) }
        : c
      ));
    }
    if (knew) addXP(2);
    setFcResults(r => [...r, knew]);
    setFcFlipped(false);
    setFcIdx(i => i + 1);
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const total = (task.task?.duration || 25) * 60;
  const timerProgress = (total - seconds) / total;
  const circumference = 2 * Math.PI * 60;
  // Endlos-Loop: Karten wiederholen sich, Runde zählt ab sessionCards.length
  const fcRound = sessionCards.length > 0 ? Math.floor(fcIdx / sessionCards.length) + 1 : 1;
  const fcPosInRound = sessionCards.length > 0 ? fcIdx % sessionCards.length : 0;
  const currentCard = sessionCards.length > 0 ? sessionCards[fcPosInRound] : null;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, padding: isMobile ? "70px 16px 90px" : 32, animation: "fadeUp 0.4s ease", overflowX: "hidden" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isMobile ? 16 : 28 }}>
          <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>
              {phase === "timer" ? "🎯 LERNMODUS" : "🧠 ABFRAGE"}
            </div>
            <div style={{ fontFamily: T.font, fontWeight: 800, fontSize: isMobile ? 16 : 20, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.task?.text}</div>
            <div style={{ fontSize: 12, color: exam?.color || T.accent, marginTop: 2 }}>{exam?.subject}</div>
          </div>
          <button onClick={onCancel} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 12px", color: T.muted, cursor: "pointer", fontSize: 13, flexShrink: 0 }}>✕</button>
        </div>

        {/* ── TIMER PHASE ── */}
        {phase === "timer" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Timer – immer oben */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: isMobile ? 20 : 28, textAlign: "center" }}>
              <div style={{ position: "relative", width: isMobile ? 120 : 150, height: isMobile ? 120 : 150, margin: "0 auto 16px" }}>
                <svg width={isMobile ? 120 : 150} height={isMobile ? 120 : 150} style={{ transform: "rotate(-90deg)" }}>
                  <circle cx={isMobile ? 60 : 75} cy={isMobile ? 60 : 75} r={isMobile ? 50 : 60} fill="none" stroke={T.border} strokeWidth="8" />
                  <circle cx={isMobile ? 60 : 75} cy={isMobile ? 60 : 75} r={isMobile ? 50 : 60} fill="none" stroke={exam?.color || T.accent}
                    strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - timerProgress)}
                    style={{ transition: "stroke-dashoffset 1s linear" }} />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ fontFamily: T.font, fontSize: isMobile ? 26 : 32, fontWeight: 800, color: exam?.color || T.accent }}>{mm}:{ss}</div>
                  <div style={{ fontSize: 10, color: T.muted }}>Fokuszeit</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button onClick={() => setRunning(r => !r)}
                  style={{ flex: 1, maxWidth: 200, background: running ? T.surface : `linear-gradient(135deg, ${T.accent}, #9f8ffa)`, border: running ? `1px solid ${T.border}` : "none", borderRadius: 12, padding: "12px", color: running ? T.muted : "white", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>
                  {running ? "⏸ Pause" : "▶ Weiter"}
                </button>
                <button onClick={startQuiz}
                  style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 16px", color: T.muted, cursor: "pointer", fontSize: 12 }}>
                  Abfrage →
                </button>
              </div>

              {sessionCards.length === 0 && (
                <div style={{ marginTop: 14, fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
                  📚 Du lernst mit eigenen Unterlagen. Der Timer läuft!
                </div>
              )}
            </div>

            {/* Flashcards Panel – darunter auf Mobile */}
            {sessionCards.length > 0 && (
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: isMobile ? 16 : 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontFamily: T.font, fontWeight: 700, fontSize: 15 }}>🃏 Flashcards</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {fcRound > 1 && (
                      <span style={{ fontSize: 10, background: T.accent + "33", color: T.accent, borderRadius: 99, padding: "2px 8px", fontWeight: 600 }}>
                        Runde {fcRound}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: T.muted }}>
                      {fcPosInRound + 1}/{sessionCards.length}
                      {fcResults.length > 0 && <span style={{ color: T.green, marginLeft: 6 }}>✓ {fcResults.filter(Boolean).length}</span>}
                    </span>
                  </div>
                </div>

                <div style={{ background: T.border, borderRadius: 99, height: 4, marginBottom: 16, overflow: "hidden" }}>
                  <div style={{ width: `${(fcPosInRound / sessionCards.length) * 100}%`, background: `linear-gradient(90deg, ${T.accent}, ${T.green})`, height: "100%", borderRadius: 99, transition: "width 0.3s" }} />
                </div>

                {currentCard ? (
                  <>
                    <div onClick={() => setFcFlipped(f => !f)} style={{
                      background: fcFlipped ? T.green + "11" : T.accentSoft,
                      border: `2px solid ${fcFlipped ? T.green + "55" : T.accent + "55"}`,
                      borderRadius: 16, padding: isMobile ? "20px 16px" : "28px 24px", textAlign: "center", cursor: "pointer",
                      minHeight: isMobile ? 130 : 160, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      transition: "all 0.3s", marginBottom: 14,
                    }}>
                      <div style={{ fontSize: 10, color: fcFlipped ? T.green : T.accent, fontWeight: 600, marginBottom: 10, letterSpacing: 1 }}>
                        {fcFlipped ? "✅ ANTWORT" : "❓ FRAGE"}
                      </div>
                      <div style={{ fontFamily: T.font, fontSize: isMobile ? 15 : 16, fontWeight: 700, lineHeight: 1.5, color: T.text }}>
                        {fcFlipped ? currentCard.back : currentCard.front}
                      </div>
                      {!fcFlipped && <div style={{ fontSize: 11, color: T.muted, marginTop: 10 }}>Tippe zum Umdrehen</div>}
                    </div>

                    {fcFlipped ? (
                      <div style={{ display: "flex", gap: 10 }}>
                        <button onClick={() => { fcNext(false); }}
                          style={{ flex: 1, background: T.red + "22", border: `1px solid ${T.red}44`, borderRadius: 10, padding: "12px", color: T.red, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                          ❌ Nochmal
                        </button>
                        <button onClick={() => { fcNext(true); }}
                          style={{ flex: 1, background: T.green + "22", border: `1px solid ${T.green}44`, borderRadius: 10, padding: "12px", color: T.green, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                          ✅ Gewusst!
                        </button>
                      </div>
                    ) : (
                      <div style={{ textAlign: "center" }}>
                        <button onClick={() => { setFcResults(r => [...r, false]); setFcIdx(i => i + 1); setFcFlipped(false); }}
                          style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", fontSize: 12, padding: "6px" }}>
                          Überspringen →
                        </button>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            )}
          </div>
        )}

        {/* ── QUIZ PHASE ── */}
        {phase === "quiz" && (
          <div style={{ maxWidth: 600, margin: "0 auto", background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: isMobile ? 16 : 32, width: "100%" }}>
            <div style={{ fontFamily: T.font, fontWeight: 700, fontSize: 18, marginBottom: 6 }}>🧠 Abschluss-Abfrage</div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 24 }}>
              {sessionCards.length > 0
                ? `Flashcard-Ergebnis: ${fcResults.filter(Boolean).length}/${sessionCards.length} · Jetzt noch 3 Fragen zum Thema`
                : "Beantworte 3 Fragen – dein Lernplan passt sich an!"}
            </div>

            {quizLoading && (
              <div style={{ textAlign: "center", padding: "32px 0" }}>
                <div style={{ width: 36, height: 36, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
                <div style={{ color: T.muted, fontSize: 13 }}>Fragen werden generiert...</div>
              </div>
            )}

            {!quizLoading && quiz?.questions?.map((q, qi) => (
              <div key={qi} style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{qi + 1}. {q.q}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {q.options.map((opt, oi) => {
                    const selected = answers[qi] === oi;
                    const correct = submitted && oi === q.correct;
                    const wrong = submitted && selected && oi !== q.correct;
                    return (
                      <button key={oi} onClick={() => !submitted && setAnswers(a => ({ ...a, [qi]: oi }))}
                        style={{ background: correct ? T.green + "33" : wrong ? T.red + "33" : selected ? T.accentSoft : T.surface, border: `1px solid ${correct ? T.green : wrong ? T.red : selected ? T.accent : T.border}`, borderRadius: 10, padding: "10px 14px", color: T.text, cursor: submitted ? "default" : "pointer", fontSize: 13, textAlign: "left", transition: "all 0.15s" }}>
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {submitted && q.explanation && (
                  <div style={{ marginTop: 10, fontSize: 12, color: T.muted, background: T.surface, borderRadius: 8, padding: "8px 12px" }}>
                    💡 {q.explanation}
                  </div>
                )}
              </div>
            ))}

            {!quizLoading && !submitted && quiz?.questions?.length > 0 && (
              <button onClick={() => setSubmitted(true)}
                disabled={Object.keys(answers).length < (quiz?.questions?.length || 0)}
                style={{ width: "100%", background: Object.keys(answers).length < (quiz?.questions?.length || 0) ? T.border : `linear-gradient(135deg, ${T.accent}, #9f8ffa)`, border: "none", borderRadius: 12, padding: "14px", color: "white", cursor: "pointer", fontSize: 15, fontWeight: 700, marginTop: 8 }}>
                Auswerten
              </button>
            )}

            {!quizLoading && !quiz?.questions?.length && !submitted && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 13, color: T.muted, marginBottom: 8 }}>Wie gut hast du das Thema verstanden?</div>
                {["verstanden", "teilweise", "wiederholen"].map(f => (
                  <button key={f} onClick={() => onComplete(task.task.id, f)}
                    style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 20px", color: T.text, cursor: "pointer", fontSize: 14, textAlign: "left" }}>
                    {f === "verstanden" ? "✅ Verstanden – weiter!" : f === "teilweise" ? "🔄 Teilweise – nochmal bald" : "❌ Noch nicht – dringend wiederholen"}
                  </button>
                ))}
              </div>
            )}

            {submitted && (() => {
              const feedback = calcFeedback();
              const config = {
                verstanden: { color: T.green, icon: "🎉", title: "Ausgezeichnet!", sub: "Aufgabe erledigt." },
                teilweise: { color: T.orange, icon: "🔄", title: "Gut gemacht!", sub: "Kommt mit höherer Priorität wieder." },
                wiederholen: { color: T.red, icon: "📚", title: "Nochmal drüber!", sub: "Wird dringend priorisiert." },
              }[feedback];
              const xpGain = feedback === "verstanden" ? task.task?.xpVal || 25 : feedback === "teilweise" ? Math.floor((task.task?.xpVal || 25) / 2) : 5;
              return (
                <div style={{ marginTop: 20, background: config.color + "22", border: `1px solid ${config.color}44`, borderRadius: 12, padding: "20px", textAlign: "center" }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>{config.icon}</div>
                  <div style={{ fontFamily: T.font, fontWeight: 700, fontSize: 18, color: config.color }}>{config.title}</div>
                  <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>{config.sub}</div>
                  {sessionCards.length > 0 && (
                    <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>
                      Flashcards: {fcResults.filter(Boolean).length}/{sessionCards.length} · Quiz: {quiz?.questions?.filter((q, i) => answers[i] === q.correct).length}/{quiz?.questions?.length}
                    </div>
                  )}
                  <div style={{ fontSize: 14, color: T.accent, marginTop: 6, fontWeight: 600 }}>+{xpGain} XP</div>
                  <button onClick={() => onComplete(task.task.id, feedback)}
                    style={{ marginTop: 16, background: `linear-gradient(135deg, ${T.accent}, #9f8ffa)`, border: "none", borderRadius: 12, padding: "12px 32px", color: "white", cursor: "pointer", fontSize: 15, fontWeight: 700 }}>
                    Weiter →
                  </button>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════
// KLAUSUREN
// ════════════════════════════════════════════════
function Exams({ exams, setExams }) {
  const [form, setForm] = useState({ subject: "", date: "", topics: "" });
  const colors = [T.accent, T.green, T.orange, "#f472b6", "#38bdf8"];

  const add = () => {
    if (!form.subject || !form.date) return;
    setExams(prev => [...prev, {
      id: randomId(), subject: form.subject, date: form.date,
      color: colors[prev.length % colors.length],
      topics: form.topics.split(",").map(t => t.trim()).filter(Boolean),
      plan: null, progress: 0,
    }]);
    setForm({ subject: "", date: "", topics: "" });
  };

  return (
    <div style={{ padding: "clamp(12px, 4vw, 32px)", animation: "fadeUp 0.4s ease" }}>
      <PageHeader title="📅 Klausurtermine" sub="Behalte deine Prüfungen im Blick" />
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 24, marginBottom: 28 }}>
        <div style={{ fontFamily: T.font, fontWeight: 700, marginBottom: 16 }}>+ Neue Klausur hinzufügen</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, alignItems: "end" }}>
          <Input label="Fach" value={form.subject} onChange={v => setForm({ ...form, subject: v })} placeholder="z.B. Mathe Analysis" />
          <Input label="Datum" type="date" value={form.date} onChange={v => setForm({ ...form, date: v })} />
          <Input label="Themen (kommagetrennt, optional)" value={form.topics} onChange={v => setForm({ ...form, topics: v })} placeholder="z.B. Integral, Ableitung" />
          <Btn onClick={add}>Hinzufügen</Btn>
        </div>
      </div>
      {exams.length === 0 ? <EmptyState icon="📅" text="Noch keine Klausuren. Füge deine erste Prüfung hinzu!" /> : (
        <div style={{ display: "grid", gridTemplateColumns: typeof window !== "undefined" && window.innerWidth <= 768 ? "1fr" : "1fr 1fr", gap: 16 }}>
          {[...exams].sort((a, b) => calcPriority(b) - calcPriority(a)).map(e => {
            const d = daysUntil(e.date);
          const urgency = d <= 7 ? T.red : d <= 14 ? T.orange : T.green;
                        return (
              <div key={e.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 20, borderLeft: `4px solid ${e.color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontFamily: T.font, fontWeight: 700, fontSize: 16 }}>{e.subject}</div>
                    <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{new Date(e.date).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })}</div>
                  </div>
                  <div style={{ background: urgency + "22", color: urgency, borderRadius: 99, padding: "4px 12px", fontSize: 13, fontWeight: 700 }}>
                    {d === 0 ? "Heute!" : `${d} Tage`}
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: T.muted }}>Lernfortschritt</span>
                    <span style={{ fontSize: 11, color: T.accent }}>{e.progress || 0}%</span>
                  </div>
                  <div style={{ background: T.border, borderRadius: 99, height: 4 }}>
                    <div style={{ width: `${e.progress || 0}%`, background: e.color, height: "100%", borderRadius: 99 }} />
                  </div>
                </div>
                {(e.topics || []).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                    {e.topics.map(t => <span key={t} style={{ background: e.color + "22", color: e.color, borderRadius: 6, padding: "2px 10px", fontSize: 11 }}>{t}</span>)}
                  </div>
                )}
                <button onClick={() => setExams(prev => prev.filter(ex => ex.id !== e.id))}
                  style={{ marginTop: 12, background: "transparent", border: "none", color: T.muted, cursor: "pointer", fontSize: 12 }}>🗑 Entfernen</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════
// UPLOAD
// ════════════════════════════════════════════════
function Upload({ exams, addXP, onAnalysisComplete }) {
  const [file, setFile] = useState(null);
  const [text, setText] = useState("");
  const [selectedExam, setSelectedExam] = useState("");
  const [manualTopics, setManualTopics] = useState("");
  const [mode, setMode] = useState("skript"); // skript | altklausur | manuell
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef();

  const [imageFiles, setImageFiles] = useState([]); // Fotos/Bilder der Klausur
  const imageRef = useRef();

  const getContent = async () => {
    if (text) return { type: "text", content: text };
    if (imageFiles.length > 0) return { type: "images", files: imageFiles };
    if (file) {
      if (file.type === "application/pdf") {
        const extracted = await extractPdfText(file);
        if (extracted && extracted.trim().length >= 50) return { type: "text", content: extracted };
        // PDF hat keinen auslesbaren Text → als Bild rendern
        const imgData = await pdfToImage(file);
        if (imgData) return { type: "images", files: [{ base64: imgData, type: "image/png", name: file.name }] };
        return { type: "text", content: "" };
      }
      if (file.type.startsWith("image/")) {
        const base64 = await fileToBase64(file);
        return { type: "images", files: [{ base64, type: file.type, name: file.name }] };
      }
      return { type: "text", content: await file.text() };
    }
    return null;
  };

  const fileToBase64 = (f) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(f);
  });

  const pdfToImage = async (f) => {
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      const arrayBuffer = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      return canvas.toDataURL("image/png").split(",")[1];
    } catch { return null; }
  };

  const buildMessages = async (promptText, contentData) => {
    if (!contentData || contentData.type === "text") {
      return [{ role: "user", content: promptText }];
    }
    // Bilder als Vision-Message
    const imageContents = await Promise.all(
      contentData.files.slice(0, 4).map(async (imgFile) => {
        const base64 = imgFile.base64 || await fileToBase64(imgFile);
        return { type: "image", source: { type: "base64", media_type: imgFile.type || "image/jpeg", data: base64 } };
      })
    );
    return [{
      role: "user",
      content: [
        ...imageContents,
        { type: "text", text: promptText }
      ]
    }];
  };

  const analyze = async () => {
    const contentData = await getContent();
    if (!contentData && !manualTopics) return;
    const hasContent = contentData?.type === "images"
      ? contentData.files.length > 0
      : contentData?.content && contentData.content.trim().length >= 50;
    if (mode !== "manuell" && !hasContent) {
      setResult({ error: true, errorMsg: "Die Datei konnte nicht ausgelesen werden. Lade ein Foto der Klausur hoch (JPG/PNG) oder füge den Text direkt ein." });
      return;
    }
    setLoading(true); setResult(null);
    const exam = exams.find(e => e.id === selectedExam);
    const textContent = contentData?.type === "text" ? (contentData.content || "").slice(0, 2500) : "[Bild wird direkt analysiert]";
    const isImage = contentData?.type === "images";

    const prompts = {
      skript: `Du bist ein ADHS-Lernexperte. Analysiere ${isImage ? "dieses Lernmaterial" : "folgenden Lerninhalt"} und extrahiere 5 Schwerpunkte.
NUR reines JSON ohne Markdown:
{"topics":[{"name":"...","minutes":20,"difficulty":3,"tip":"..."}],"summary":"...","adhsTip":"..."}
Fach: ${exam?.subject || "Unbekannt"}
${!isImage ? `Inhalt: ${textContent}` : ""}`,
      altklausur: `Du bist ein ADHS-Lernexperte. Analysiere ${isImage ? "diese Altklausur/Aufgabenblätter" : "folgende Altklausur"}.
Erkenne: Aufgabentypen, Häufigkeiten, Punkteverteilung, typische Fragestellungen. Auch handschriftliche Notizen beachten.
NUR reines JSON ohne Markdown:
{"topics":[{"name":"...","minutes":20,"difficulty":3,"tip":"...","frequency":"häufig","points":"ca. X Pkt"}],"summary":"...","adhsTip":"...","examPattern":"...","topPriority":"..."}
Fach: ${exam?.subject || "Unbekannt"}
${!isImage ? `Inhalt: ${textContent}` : ""}`,
      manuell: `ADHS-Lernplan für Themen. NUR reines JSON ohne Markdown:
{"topics":[{"name":"...","minutes":20,"difficulty":3,"tip":"..."}],"summary":"...","adhsTip":"..."}
Themen: ${manualTopics}`,
    };

    try {
      const messages = await buildMessages(prompts[mode], contentData);
      const raw = await callClaude(messages);
      const parsed = safeParseJSON(raw);
      setResult({ ...parsed, mode });
      addXP(mode === "altklausur" ? 40 : 30);
      if (onAnalysisComplete && selectedExam && parsed.topics && mode !== "altklausur") {
        onAnalysisComplete(selectedExam, parsed.topics.map(t => t.name));
      }
    } catch (err) {
      console.error("Analyse Fehler:", err);
      setResult({ error: true });
    }
    setLoading(false);
  };

  const canAnalyze = mode === "manuell" ? !!manualTopics : (!!text || !!file || imageFiles.length > 0);

  return (
    <div style={{ padding: "clamp(12px, 4vw, 32px)", animation: "fadeUp 0.4s ease" }}>
      <PageHeader title="📄 Unterlagen analysieren" sub="Skripte, Altklausuren oder Aufgaben – die KI erkennt die Schwerpunkte" />

      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        {[
          { id: "skript", icon: "📖", label: "Skript / Mitschrift", sub: "Lernmaterial analysieren" },
          { id: "altklausur", icon: "📝", label: "Altklausur / Aufgaben", sub: "Prüfungsmuster erkennen" },
          { id: "manuell", icon: "✏️", label: "Manuell eingeben", sub: "Eigene Schwerpunkte" },
        ].map(m => (
          <button key={m.id} onClick={() => { setMode(m.id); setResult(null); }}
            style={{ flex: 1, background: mode === m.id ? T.accentSoft : T.card, border: `1px solid ${mode === m.id ? T.accent : T.border}`, borderRadius: 12, padding: "14px 16px", cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{m.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: mode === m.id ? T.text : T.muted }}>{m.label}</div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{m.sub}</div>
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 24 }}>
          {mode !== "manuell" && (
            <>
              {/* Tabs: Datei oder Foto */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <ToggleBtn active={imageFiles.length === 0} onClick={() => setImageFiles([])}>📄 PDF / Text</ToggleBtn>
                <ToggleBtn active={imageFiles.length > 0} onClick={() => imageRef.current?.click()}>📷 Foto / Bild</ToggleBtn>
                <input ref={imageRef} type="file" accept="image/*" multiple style={{ display: "none" }}
                  onChange={e => { setImageFiles(Array.from(e.target.files)); setFile(null); setText(""); }} />
              </div>

              {imageFiles.length > 0 ? (
                // Bilder-Vorschau
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    {imageFiles.map((img, i) => (
                      <div key={i} style={{ position: "relative" }}>
                        <img src={URL.createObjectURL(img)} alt={img.name}
                          style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: `1px solid ${T.border}` }} />
                        <button onClick={() => setImageFiles(prev => prev.filter((_, j) => j !== i))}
                          style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: T.red, border: "none", color: "white", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                      </div>
                    ))}
                    <div onClick={() => imageRef.current?.click()} style={{ width: 80, height: 80, border: `2px dashed ${T.border}`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: T.muted, fontSize: 22 }}>+</div>
                  </div>
                  <div style={{ fontSize: 11, color: T.muted }}>📷 {imageFiles.length} Bild{imageFiles.length > 1 ? "er" : ""} – Claude liest auch beschriftete und handgeschriebene Klausuren</div>
                </div>
              ) : (
                // PDF/Text Upload
                <>
                  <div onClick={() => fileRef.current?.click()} style={{ border: `2px dashed ${mode === "altklausur" ? T.orange + "77" : T.accent + "55"}`, borderRadius: 12, padding: "24px 20px", textAlign: "center", cursor: "pointer", marginBottom: 12, background: file ? (mode === "altklausur" ? T.orange + "11" : T.accentSoft) : "transparent" }}>
                    <input ref={fileRef} type="file" accept=".txt,.pdf,.md,image/*" style={{ display: "none" }} onChange={e => { setFile(e.target.files[0]); setText(""); setImageFiles([]); }} />
                    <div style={{ fontSize: 28, marginBottom: 6 }}>{file ? "📎" : mode === "altklausur" ? "📝" : "⬆️"}</div>
                    <div style={{ fontSize: 13, color: file ? T.text : T.muted }}>{file ? file.name : "PDF, Bild oder Text hochladen"}</div>
                  </div>
                  <textarea value={text} onChange={e => { setText(e.target.value); setFile(null); }}
                    placeholder={mode === "altklausur" ? "Oder Aufgabentext direkt einfügen..." : "Oder Text direkt einfügen..."}
                    style={{ width: "100%", height: 90, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, color: T.text, fontSize: 13, resize: "vertical", fontFamily: T.body, marginBottom: 14 }} />
                </>
              )}
            </>
          )}
          {mode === "manuell" && (
            <div style={{ marginBottom: 14 }}>
              <Input label="Schwerpunkte eingeben (kommagetrennt)" value={manualTopics} onChange={v => setManualTopics(v)} placeholder="z.B. Integralrechnung, Bilanzierung" />
              <div style={{ fontSize: 11, color: T.muted, marginTop: 8 }}>Die KI erstellt daraus deinen optimierten Lernplan.</div>
            </div>
          )}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>Klausur zuordnen (optional):</div>
            <select value={selectedExam} onChange={e => setSelectedExam(e.target.value)}
              style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 12px", color: T.text, fontSize: 13 }}>
              <option value="">– Keine Auswahl –</option>
              {exams.map(e => <option key={e.id} value={e.id}>{e.subject}</option>)}
            </select>
          </div>
          {mode === "altklausur" && (
            <div style={{ background: T.orange + "11", border: `1px solid ${T.orange}33`, borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: T.orange, fontWeight: 600, marginBottom: 3 }}>📝 Altklausur-Modus</div>
              <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.6 }}>Die KI erkennt Aufgabentypen, Häufigkeit, Punkteverteilung und priorisiert deine Lernthemen.</div>
            </div>
          )}
          <Btn onClick={analyze} disabled={loading || !canAnalyze} style={{ width: "100%" }}>
            {loading ? "⏳ Analysiere..." : mode === "altklausur" ? "🔍 Klausur analysieren (+40 XP)" : "🔍 Analyse starten (+30 XP)"}
          </Btn>
        </div>

        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 24 }}>
          <div style={{ fontFamily: T.font, fontWeight: 700, marginBottom: 16 }}>{result?.mode === "altklausur" ? "📝 Klausuranalyse" : "Analyse-Ergebnis"}</div>
          {loading && (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ width: 36, height: 36, border: `3px solid ${T.border}`, borderTopColor: mode === "altklausur" ? T.orange : T.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
              <div style={{ color: T.muted, fontSize: 13 }}>{mode === "altklausur" ? "Analysiere Klausurstruktur..." : "Analysiere..."}</div>
            </div>
          )}
          {result?.error && (
            <div style={{ animation: "fadeUp 0.3s ease" }}>
              <div style={{ color: T.red, fontSize: 14, marginBottom: 12 }}>⚠️ Analyse fehlgeschlagen</div>
              <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.7, marginBottom: 16 }}>
                {result.errorMsg || "Ein Fehler ist aufgetreten. Bitte erneut versuchen."}
              </div>
              {result.errorMsg && (
                <div style={{ background: T.accentSoft, border: `1px solid ${T.accent}44`, borderRadius: 10, padding: "12px 14px", fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
                  💡 <strong style={{ color: T.text }}>Tipp:</strong> Öffne die PDF, markiere alles (<strong>Cmd+A</strong>), kopiere (<strong>Cmd+C</strong>) und füge den Text ins Textfeld links ein.
                </div>
              )}
            </div>
          )}
          {result && !result.error && (
            <div style={{ animation: "fadeUp 0.4s ease" }}>
              {result.mode === "altklausur" && result.examPattern && (
                <div style={{ background: T.orange + "11", border: `1px solid ${T.orange}33`, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: T.orange, fontWeight: 600, marginBottom: 4 }}>📋 KLAUSURAUFBAU</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6 }}>{result.examPattern}</div>
                </div>
              )}
              {result.mode === "altklausur" && result.topPriority && (
                <div style={{ background: T.red + "11", border: `1px solid ${T.red}33`, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: T.red, fontWeight: 600, marginBottom: 4 }}>🎯 TOP-PRIORITÄT</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{result.topPriority}</div>
                </div>
              )}
              <div style={{ fontSize: 13, color: T.muted, marginBottom: 14, lineHeight: 1.6 }}>{result.summary}</div>
              {result.topics?.map(t => (
                <div key={t.name} style={{ background: T.surface, borderRadius: 10, padding: "12px 14px", marginBottom: 10, borderLeft: `3px solid ${result.mode === "altklausur" ? (t.frequency === "häufig" ? T.red : t.frequency === "mittel" ? T.orange : T.green) : T.accent}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{t.name}</div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {result.mode === "altklausur" && t.frequency && (
                        <span style={{ fontSize: 10, borderRadius: 6, padding: "2px 7px", fontWeight: 600, background: t.frequency === "häufig" ? T.red + "22" : t.frequency === "mittel" ? T.orange + "22" : T.green + "22", color: t.frequency === "häufig" ? T.red : t.frequency === "mittel" ? T.orange : T.green }}>{t.frequency}</span>
                      )}
                      {result.mode === "altklausur" && t.points && (
                        <span style={{ fontSize: 10, color: T.muted, background: T.border, borderRadius: 6, padding: "2px 7px" }}>{t.points}</span>
                      )}
                      <span style={{ fontSize: 11, color: T.muted }}>⏱ {t.minutes} min</span>
                      <span style={{ fontSize: 11, color: getDiffColor(t.difficulty) }}>{"★".repeat(t.difficulty)}{"☆".repeat(5 - t.difficulty)}</span>
                    </div>
                  </div>
                  {t.tip && <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>💡 {t.tip}</div>}
                </div>
              ))}
              {result.adhsTip && <div style={{ marginTop: 10, background: T.accentSoft, borderRadius: 10, padding: "12px 14px", fontSize: 13, color: T.accent }}>💡 {result.adhsTip}</div>}
              {result.mode === "altklausur" && selectedExam && onAnalysisComplete && (
                <button onClick={() => onAnalysisComplete(selectedExam, result.topics.map(t => t.name))}
                  style={{ width: "100%", marginTop: 16, background: `linear-gradient(135deg, ${T.accent}, #9f8ffa)`, border: "none", borderRadius: 12, padding: "13px", color: "white", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>
                  🗓️ Schwerpunkte in Lernplan übernehmen →
                </button>
              )}
            </div>
          )}
          {!result && !loading && (
            <div style={{ color: T.muted, fontSize: 13, textAlign: "center", padding: "40px 20px" }}>
              {mode === "altklausur" ? "Lade eine Altklausur hoch – die KI erkennt Aufgabenmuster und Schwerpunkte." : mode === "manuell" ? "Gib deine Themen ein und lass die KI einen Lernplan erstellen." : "Lade Unterlagen hoch um die Analyse zu starten."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
const getDiffColor = d => d <= 2 ? T.green : d <= 3 ? T.orange : T.red;

// ════════════════════════════════════════════════
// LERNPLAN
// ════════════════════════════════════════════════
function Plan({ exams, setExams, tasks, setTasks, dailyMinutes }) {
  const [selectedExam, setSelectedExam] = useState(exams[0]?.id || "");
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    const exam = exams.find(e => e.id === selectedExam);
    if (!exam) return;
    setLoading(true);
    const d = daysUntil(exam.date);

    // Alle Fächer für Kontext
    const otherExams = exams.filter(e => e.id !== selectedExam)
      .map(e => `${e.subject} (${daysUntil(e.date)} Tage, ${e.progress || 0}% Fortschritt)`)
      .join(", ");

    // Tage sinnvoll begrenzen: alle Tage bis Klausur, max 14 für den JSON-Output
    const planDays = Math.min(d, 14);
    // Pro Tag verfügbare Minuten für dieses Fach
    const minPerDay = Math.floor(dailyMinutes / Math.max(1, exams.length));
    // Tasks pro Tag basierend auf verfügbarer Zeit (ca. 20min pro Task)
    const tasksPerDay = Math.max(2, Math.min(5, Math.floor(minPerDay / 20)));

    const prompt = `ADHS-Lerncoach. Lernplan erstellen.
Fach: ${exam.subject}
Tage bis Klausur: ${d}, Fortschritt: ${exam.progress || 0}%
Themen: ${exam.topics?.join(", ") || "allgemeine Vorbereitung"}
Täglich verfügbar für dieses Fach: ${minPerDay} min
Andere Fächer: ${otherExams || "keine"}

Dauer pro Aufgabe anpassen:
- Einfach (Definitionen, Begriffe): 10-15 min
- Mittel (Konzepte verstehen): 20-25 min
- Komplex (Rechnen, Analyse): 30-40 min

Plane ALLE ${planDays} Tage bis zur Klausur. Pro Tag max ${tasksPerDay} tasks, Gesamtdauer max ${minPerDay} min.
Verteile die Themen sinnvoll: erst Grundlagen, dann Vertiefung, letzte 2 Tage Wiederholung.
NUR reines JSON:
{"overview":"max 20 Wörter","adhsStrategy":"max 15 Wörter","days":[{"day":1,"label":"Mo","focus":"max 5 Wörter","tasks":[{"time":"09:00","duration":15,"task":"max 8 Wörter","type":"lernen"}]}]}`;

    try {
      const raw = await callClaudeLarge([{ role: "user", content: prompt }]);
      const plan = safeParseJSON(raw);
      setExams(prev => prev.map(e => e.id === selectedExam ? { ...e, plan } : e));
      // Alte Tasks dieses Fachs entfernen (außer erledigte)
      const filtered = tasks.filter(t => t.examId !== selectedExam || t.done);
      const newTasks = (plan.days || []).flatMap(day =>
        (day.tasks || []).map(t => ({
          id: randomId(), text: t.task, done: false, examId: selectedExam,
          xpVal: t.duration || 25, duration: t.duration || 25, priority: 1,
          type: t.type || "lernen",
          plannedDate: null, // kein Datum = wird vom Semesterplan überschrieben
        }))
      );
      setTasks([...filtered, ...newTasks]);
    } catch (err) { console.error("Plan failed", err); }
    setLoading(false);
  };

  const exam = exams.find(e => e.id === selectedExam);
  const plan = exam?.plan;
  const typeColor = { lernen: T.accent, wiederholen: T.green, üben: T.orange };
  const typeIcon = { lernen: "📖", wiederholen: "🔄", üben: "✏️" };

  return (
    <div style={{ padding: "clamp(12px, 4vw, 32px)", animation: "fadeUp 0.4s ease" }}>
      <PageHeader title="🗓️ Lernplan Generator" sub="KI erstellt deinen personalisierten Lernplan für alle Fächer" />

      {exam?.topics?.length > 0 && (
        <div style={{ background: T.accentSoft, border: `1px solid ${T.accent}44`, borderRadius: 12, padding: "12px 20px", marginBottom: 20, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: T.accent, fontWeight: 600 }}>📊 Schwerpunkte:</span>
          {exam.topics.map(t => <span key={t} style={{ background: (exam.color || T.accent) + "22", color: exam.color || T.accent, borderRadius: 6, padding: "2px 10px", fontSize: 12 }}>{t}</span>)}
        </div>
      )}

      {exams.length === 0 ? <EmptyState icon="📅" text="Erstelle zuerst eine Klausur." /> : (
        <>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 24 }}>
            <select value={selectedExam} onChange={e => setSelectedExam(e.target.value)}
              style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 16px", color: T.text, fontSize: 14, minWidth: 200 }}>
              {exams.map(e => <option key={e.id} value={e.id}>{e.subject} ({daysUntil(e.date)}d – {e.progress || 0}%)</option>)}
            </select>
            <Btn onClick={generate} disabled={loading || !selectedExam}>
              {loading ? "⏳ Generiere..." : "🤖 Lernplan erstellen"}
            </Btn>
            <div style={{ fontSize: 12, color: T.muted }}>⏱ {dailyMinutes} min/Tag verfügbar</div>
          </div>

          {loading && <LoadingCard text="KI erstellt deinen persönlichen Lernplan..." />}

          {plan && !loading && (
            <div style={{ animation: "fadeUp 0.4s ease" }}>
              <div style={{ background: T.accentSoft, border: `1px solid ${T.accent}44`, borderRadius: 16, padding: "16px 20px", marginBottom: 20 }}>
                <div style={{ fontFamily: T.font, fontWeight: 700, color: T.accent, marginBottom: 6 }}>📋 Lernstrategie</div>
                <div style={{ fontSize: 14, lineHeight: 1.7 }}>{plan.overview}</div>
                {plan.adhsStrategy && <div style={{ marginTop: 8, fontSize: 13, color: T.muted }}>💡 {plan.adhsStrategy}</div>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
                {plan.days?.map(day => (
                  <div key={day.day} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 20 }}>
                    <div style={{ fontFamily: T.font, fontWeight: 700, marginBottom: 4 }}>Tag {day.day} – {day.label}</div>
                    <div style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>🎯 {day.focus}</div>
                    {day.tasks?.map((t, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: (typeColor[t.type] || T.accent) + "33", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                          {typeIcon[t.type] || "📖"}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13 }}>{t.task}</div>
                          <div style={{ fontSize: 11, color: T.muted }}>{t.time} · {t.duration} min</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
          {!plan && !loading && <EmptyState icon="🗓️" text="Wähle eine Klausur und erstelle deinen Lernplan." />}
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════
// KALENDER
// ════════════════════════════════════════════════
function Kalender({ exams, tasks, setTasks, dailyMinutes, addXP, semesterPlan, setSemesterPlan, generating, setGenerating }) {
  const isMobile = useIsMobile();
  const [view, setView] = useState("month"); // month | week
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);

  // Alle geplanten Lerntage aus tasks + semesterPlan zusammenführen
  const getDayEntries = (dateStr) => {
    // Nur Tasks mit explizitem plannedDate – semesterPlan.days ist nur für die Generierung
    return tasks
      .filter(t => t.plannedDate === dateStr && !t.done)
      .map(t => {
        const exam = exams.find(e => e.id === t.examId);
        return { ...t, examColor: exam?.color || T.accent, examSubject: exam?.subject };
      });
  };

  const generateSemesterPlan = async () => {
    if (!exams.length) return;
    setGenerating(true);

    const today = new Date();
    const examList = exams.map(e => {
      const examTasks = tasks.filter(t => t.examId === e.id && !t.done);
      return {
        id: e.id,
        subject: e.subject,
        date: e.date,
        daysLeft: daysUntil(e.date),
        topics: (e.topics || []).join(", ") || "allgemeine Vorbereitung",
        progress: e.progress || 0,
        pendingTasks: examTasks.map(t => t.text).slice(0, 8),
      };
    });

    // Prompt kompakt halten damit JSON nicht abgeschnitten wird
    // Max 14 Tage auf einmal planen, dann kannst du neu generieren
    const maxDays = Math.min(
      Math.max(...examList.map(e => e.daysLeft), 0),
      30
    );

    const todayFormatted = today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');

    const prompt = `ADHS-Lerncoach. Semesterlernplan für ${examList.length} Klausuren.

Fächer: ${examList.map(e => `${e.subject}(id=${e.id},klausur=${e.date},tage=${e.daysLeft},themen=${e.topics.slice(0,50)})`).join(" | ")}
Heute: ${todayFormatted}, Täglich: ${dailyMinutes}min, Planung: nächste ${maxDays} Tage

Regeln: Dringendste Fächer priorisieren. Letzte 3 Tage vor Klausur = Wiederholung. Fächer täglich wechseln. Max 2-3 Einheiten/Tag.

NUR reines JSON ohne Markdown:
{"overview":"1 Satz Strategie","days":{"${todayFormatted}":[{"task":"max 6 Wörter","duration":20,"type":"lernen","examId":"id","priority":"normal"}]}}

Fülle days für alle ${maxDays} Tage. Halte tasks kurz (max 6 Wörter). examIds exakt: ${examList.map(e => `${e.subject}=${e.id}`).join(",")}`;

    try {
      const raw = await callClaudeLarge([{ role: "user", content: prompt }]);
      const parsed = safeParseJSON(raw);
      const newTasks = [];
      Object.entries(parsed.days || {}).forEach(([dateStr, entries]) => {
        entries.forEach(entry => {
          if (entry.examId) {
            newTasks.push({
              id: randomId(),
              text: entry.task,
              done: false,
              examId: entry.examId,
              xpVal: entry.duration || 25,
              duration: entry.duration || 25,
              priority: entry.priority === "hoch" ? 2 : 1,
              type: entry.type || "lernen",
              plannedDate: dateStr,
            });
          }
        });
      });
      // Erledigte Tasks behalten, alle anderen (geplant und ungeplant) ersetzen
      setTasks(prev => [...prev.filter(t => t.done), ...newTasks]);
      const now = new Date();
      const nowStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
      setSemesterPlan({ overview: parsed.overview, days: parsed.days, generatedAt: nowStr });
      addXP(50);
    } catch (err) { console.error("Semesterplan Fehler:", err); }
    setGenerating(false);
  };

  // Kalender-Hilfsfunktionen
  const getMonthDays = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = (firstDay.getDay() + 6) % 7; // Montag = 0
    const days = [];
    for (let i = 0; i < startPad; i++) {
      const d = new Date(year, month, -startPad + i + 1);
      days.push({ date: d, thisMonth: false });
    }
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({ date: new Date(year, month, i), thisMonth: true });
    }
    while (days.length % 7 !== 0) {
      const last = days[days.length - 1].date;
      days.push({ date: new Date(last.getTime() + 86400000), thisMonth: false });
    }
    return days;
  };

  const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const isToday = (d) => formatDate(d) === todayStr();
  const isExamDay = (d) => exams.find(e => e.date === formatDate(d));
  const monthDays = getMonthDays(currentDate);
  const monthLabel = currentDate.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  const weekDays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  // Wochenansicht: 7 Tage ab Montag der aktuellen Woche
  const getWeekDays = () => {
    const d = new Date(currentDate);
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    return Array.from({ length: 7 }, (_, i) => {
      const wd = new Date(d);
      wd.setDate(d.getDate() + i);
      return wd;
    });
  };
  const weekDates = getWeekDays();

  const prevPeriod = () => {
    const d = new Date(currentDate);
    view === "month" ? d.setMonth(d.getMonth() - 1) : d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  };
  const nextPeriod = () => {
    const d = new Date(currentDate);
    view === "month" ? d.setMonth(d.getMonth() + 1) : d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  };

  return (
    <div style={{ padding: isMobile ? 12 : 32, animation: "fadeUp 0.4s ease", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 10, flexWrap: isMobile ? "wrap" : "nowrap" }}>
        <PageHeader title="📆 Semesterkalender" sub={isMobile ? "" : "Dein kompletter Lernplan bis zur letzten Klausur"} />
        <Btn onClick={generateSemesterPlan} disabled={generating || !exams.length} style={{ fontSize: isMobile ? 12 : 14, padding: isMobile ? "8px 12px" : "10px 20px", whiteSpace: "nowrap" }}>
          {generating ? "⏳ Lädt..." : isMobile ? "🤖 Plan erstellen" : "🤖 Semesterplan erstellen (+50 XP)"}
        </Btn>
      </div>

      {semesterPlan && (
        <div style={{ background: T.accentSoft, border: `1px solid ${T.accent}44`, borderRadius: 12, padding: "12px 18px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>📋 {semesterPlan.overview}</div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
              Erstellt: {new Date(semesterPlan.generatedAt).toLocaleDateString("de-DE")} · Passt sich durch Quiz-Feedback an
            </div>
          </div>
          <button onClick={generateSemesterPlan} style={{ background: "transparent", border: `1px solid ${T.accent}44`, borderRadius: 8, padding: "6px 12px", color: T.accent, cursor: "pointer", fontSize: 12 }}>
            🔄 Neu planen
          </button>
        </div>
      )}

      {!semesterPlan && !generating && exams.length > 0 && (
        <div style={{ background: T.card, border: `2px dashed ${T.accent}44`, borderRadius: 16, padding: "32px", textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📆</div>
          <div style={{ fontFamily: T.font, fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Semesterplan erstellen</div>
          <div style={{ fontSize: 13, color: T.muted, marginBottom: 16, maxWidth: 400, margin: "0 auto 16px" }}>
            Die KI plant alle deine Klausuren von heute bis zum Ende – priorisiert und realistisch.
          </div>
          <Btn onClick={generateSemesterPlan}>🤖 Jetzt planen</Btn>
        </div>
      )}

      {generating && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: "40px", textAlign: "center", marginBottom: 24 }}>
          <div style={{ width: 40, height: 40, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <div style={{ fontFamily: T.font, fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Plane dein Semester...</div>
          <div style={{ fontSize: 13, color: T.muted }}>Die KI verteilt alle Themen intelligent bis zur letzten Klausur</div>
        </div>
      )}

      {/* Kalender-Navigation */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: isMobile ? "10px 12px" : "16px 20px", borderBottom: `1px solid ${T.border}`, gap: 8 }}>
          <button onClick={prevPeriod} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 12px", color: T.text, cursor: "pointer", fontSize: 14, flexShrink: 0 }}>←</button>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 16, flexWrap: "wrap", justifyContent: "center" }}>
            <div style={{ fontFamily: T.font, fontWeight: 700, fontSize: isMobile ? 13 : 16 }}>{monthLabel}</div>
            <div style={{ display: "flex", gap: 4 }}>
              <ToggleBtn active={view === "month"} onClick={() => setView("month")}>Monat</ToggleBtn>
              <ToggleBtn active={view === "week"} onClick={() => setView("week")}>Woche</ToggleBtn>
            </div>
            <button onClick={() => setCurrentDate(new Date())} style={{ background: T.accentSoft, border: `1px solid ${T.accent}44`, borderRadius: 8, padding: "4px 10px", color: T.accent, cursor: "pointer", fontSize: 11 }}>Heute</button>
          </div>
          <button onClick={nextPeriod} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 12px", color: T.text, cursor: "pointer", fontSize: 14, flexShrink: 0 }}>→</button>
        </div>

        {/* Wochentag-Header */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: `1px solid ${T.border}` }}>
          {weekDays.map(d => (
            <div key={d} style={{ padding: "6px 0", textAlign: "center", fontSize: isMobile ? 10 : 11, color: T.muted, fontWeight: 600 }}>{d}</div>
          ))}
        </div>

        {/* Monatsansicht */}
        {view === "month" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {monthDays.map(({ date, thisMonth }, i) => {
              const ds = formatDate(date);
              const entries = getDayEntries(ds);
              const exam = isExamDay(date);
              const today = isToday(date);
              const isPast = date < new Date() && !today;
              return (
                <div key={i} onClick={() => setSelectedDay(selectedDay === ds ? null : ds)}
                  style={{
                    minHeight: isMobile ? 48 : 80, padding: isMobile ? "4px 3px" : "6px 8px", borderRight: `1px solid ${T.border}`,
                    borderBottom: `1px solid ${T.border}`, cursor: "pointer",
                    background: today ? T.accentSoft : selectedDay === ds ? T.surface : "transparent",
                    opacity: !thisMonth ? 0.35 : isPast ? 0.6 : 1,
                    transition: "background 0.15s",
                  }}>
                  <div style={{
                    fontSize: 12, fontWeight: today ? 700 : 400,
                    color: today ? T.accent : exam ? T.red : T.text,
                    marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <span>{date.getDate()}</span>
                    {exam && !isMobile && <span style={{ fontSize: 9, background: T.red + "33", color: T.red, borderRadius: 4, padding: "1px 4px" }}>📝</span>}
                  </div>
                  {/* Klausur-Punkt auf Mobile, Balken auf Desktop */}
                  {exam && (
                    isMobile ? (
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: exam.color || T.red, margin: "0 auto 2px" }} />
                    ) : (
                      <div style={{ fontSize: 9, background: (exam.color || T.red) + "44", color: exam.color || T.red, borderRadius: 4, padding: "2px 5px", marginBottom: 3, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        📝 {exam.subject}
                      </div>
                    )
                  )}
                  {!isMobile && entries.slice(0, exam ? 1 : 2).map((e, j) => (
                    <div key={j} style={{
                      fontSize: 9, background: (e.examColor || T.accent) + "33",
                      color: e.examColor || T.accent, borderRadius: 4,
                      padding: "1px 4px", marginBottom: 2, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{e.text || e.task}</div>
                  ))}
                  {isMobile && entries.length > 0 && (
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: (entries[0].examColor || T.accent), margin: "0 auto" }} />
                  )}
                  {!isMobile && entries.length > (exam ? 1 : 2) && <div style={{ fontSize: 9, color: T.muted }}>+{entries.length - (exam ? 1 : 2)}</div>}
                </div>
              );
            })}
          </div>
        )}

        {/* Wochenansicht */}
        {view === "week" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {weekDates.map((date, i) => {
              const ds = formatDate(date);
              const entries = getDayEntries(ds);
              const exam = isExamDay(date);
              const today = isToday(date);
              return (
                <div key={i} style={{
                  minHeight: isMobile ? 120 : 300, padding: isMobile ? "6px 4px" : "10px 8px",
                  borderRight: i < 6 ? `1px solid ${T.border}` : "none",
                  background: today ? T.accentSoft : "transparent",
                }}>
                  <div style={{ fontSize: 13, fontWeight: today ? 700 : 500, color: today ? T.accent : T.text, marginBottom: 10, textAlign: "center" }}>
                    {weekDays[i]} {date.getDate()}
                    {exam && <div style={{ fontSize: 9, color: exam.color || T.red, background: (exam.color || T.red) + "22", borderRadius: 4, padding: "2px 6px", marginTop: 3 }}>📝 {exam.subject}</div>}
                  </div>
                  {entries.map((e, j) => (
                    <div key={j} style={{
                      background: (e.examColor || T.accent) + "22",
                      border: `1px solid ${(e.examColor || T.accent)}44`,
                      borderRadius: 6, padding: "6px 8px", marginBottom: 6,
                    }}>
                      <div style={{ fontSize: 11, color: e.examColor || T.accent, fontWeight: 600, marginBottom: 2 }}>
                        {e.examSubject || e.subject}
                      </div>
                      <div style={{ fontSize: 11, color: T.text, lineHeight: 1.4 }}>{e.text || e.task}</div>
                      <div style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>⏱ {e.duration || 25} min</div>
                    </div>
                  ))}
                  {entries.length === 0 && (
                    <div style={{ fontSize: 10, color: T.border, textAlign: "center", marginTop: 20 }}>–</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tagesdetail bei Klick */}
      {selectedDay && view === "month" && (() => {
        const entries = getDayEntries(selectedDay);
        const exam = exams.find(e => e.date === selectedDay);
        const dateObj = new Date(selectedDay + "T12:00:00");
        return (
          <div style={{ marginTop: 16, background: T.card, border: `1px solid ${T.accent}44`, borderRadius: 16, padding: 20, animation: "fadeUp 0.2s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontFamily: T.font, fontWeight: 700, fontSize: 15 }}>
                {dateObj.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}
              </div>
              <button onClick={() => setSelectedDay(null)} style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
            {exam && (
              <div style={{ background: T.red + "22", border: `1px solid ${T.red}44`, borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: T.red, fontWeight: 600 }}>📝 Klausurtag: {exam.subject}</div>
              </div>
            )}
            {entries.length === 0 ? (
              <div style={{ fontSize: 13, color: T.muted }}>Kein Lernplan für diesen Tag.</div>
            ) : entries.map((e, i) => {
              const examForEntry = exams.find(ex => ex.id === e.examId);
              return (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: i < entries.length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: e.examColor || T.accent, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{e.text || e.task}</div>
                    <div style={{ fontSize: 11, color: T.muted }}>{examForEntry?.subject || e.subject} · {e.duration || 25} min</div>
                  </div>
                  <span style={{ fontSize: 10, color: e.priority === "hoch" || e.priority === 2 ? T.red : T.muted, background: (e.priority === "hoch" || e.priority === 2) ? T.red + "22" : T.border, borderRadius: 6, padding: "2px 7px" }}>
                    {e.priority === "hoch" || e.priority === 2 ? "🔴 Hoch" : "🟢 Normal"}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Klausur-Legende */}
      {exams.length > 0 && (
        <div style={{ display: "flex", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
          {exams.map(e => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: e.color || T.accent }} />
              <span style={{ fontSize: 11, color: T.muted }}>{e.subject}</span>
              <span style={{ fontSize: 11, color: daysUntil(e.date) <= 7 ? T.red : T.muted }}>({daysUntil(e.date)}d)</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, background: T.red + "33", color: T.red, borderRadius: 4, padding: "1px 6px" }}>📝</span>
            <span style={{ fontSize: 11, color: T.muted }}>Klausurtag</span>
          </div>
        </div>
      )}
    </div>
  );
}


// ════════════════════════════════════════════════
// FOKUS TIMER
// ════════════════════════════════════════════════
// ════════════════════════════════════════════════
// FLASHCARDS
// ════════════════════════════════════════════════
function Flashcards({ exams, cards, setCards, addXP }) {
  const [view, setView] = useState("overview"); // overview | learn | add | generate
  const [selectedExam, setSelectedExam] = useState(exams[0]?.id || "");
  const [filterExam, setFilterExam] = useState("all");
  const [genLoading, setGenLoading] = useState(false);
  const [genCount, setGenCount] = useState(10);
  const [manualForm, setManualForm] = useState({ front: "", back: "", examId: "" });
  // Lernmodus
  const [learnIdx, setLearnIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [learnCards, setLearnCards] = useState([]);


  const filteredCards = filterExam === "all" ? cards : cards.filter(c => c.examId === filterExam);
  const exam = exams.find(e => e.id === selectedExam);

  // KI-Karten generieren
  const generateCards = async () => {
    if (!exam) return;
    setGenLoading(true);
    const prompt = `Erstelle ${genCount} Flashcards für das Fach "${exam.subject}".
Themen: ${(exam.topics || []).join(", ") || "allgemeine Prüfungsvorbereitung"}
ADHS-gerecht: kurze, prägnante Antworten, keine langen Texte.
NUR reines JSON: {"cards":[{"front":"Frage...","back":"Antwort..."}]}`;
    try {
      const raw = await callClaude([{ role: "user", content: prompt }]);
      const parsed = safeParseJSON(raw);
      const newCards = (parsed.cards || []).map(c => ({
        id: randomId(), front: c.front, back: c.back,
        examId: selectedExam, examSubject: exam.subject, examColor: exam.color || T.accent,
        score: 0, createdAt: Date.now(),
      }));
      setCards(prev => [...prev, ...newCards]);
      addXP(20);
      setView("overview");
    } catch (err) { console.error("Karten-Generierung fehlgeschlagen", err); }
    setGenLoading(false);
  };

  // Manuelle Karte hinzufügen
  const addManual = () => {
    if (!manualForm.front || !manualForm.back) return;
    const ex = exams.find(e => e.id === manualForm.examId);
    setCards(prev => [...prev, {
      id: randomId(), front: manualForm.front, back: manualForm.back,
      examId: manualForm.examId || null,
      examSubject: ex?.subject || "Kein Fach",
      examColor: ex?.color || T.muted,
      score: 0, createdAt: Date.now(),
    }]);
    setManualForm({ front: "", back: "", examId: "" });
    addXP(5);
  };

  const deleteCard = (id) => setCards(prev => prev.filter(c => c.id !== id));

  // Lernmodus starten
  const startLearn = () => {
    const toLearn = [...filteredCards].sort((a, b) => (a.score || 0) - (b.score || 0));
    setLearnCards(toLearn);
    setLearnIdx(0);
    setFlipped(false);
    setView("learn");
  };

  // Feedback im Lernmodus
  const learnFeedback = (knew) => {
    const card = learnCards[learnIdx];
    setCards(prev => prev.map(c => c.id === card.id
      ? { ...c, score: knew ? (c.score || 0) + 1 : Math.max(0, (c.score || 0) - 1) }
      : c
    ));
    if (knew) addXP(3);
    setFlipped(false);
    if (learnIdx + 1 >= learnCards.length) setView("learnDone");
    else setLearnIdx(i => i + 1);
  };

  // PDF Export – komplett im Browser via HTML/CSS Print
  const exportPDF = () => {
    const toExport = filteredCards;
    if (!toExport.length) return;

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Flashcards Export</title>
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: white; }
  h1 { font-size: 20px; margin-bottom: 24px; color: #333; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .card { border: 2px solid #e2e8f0; border-radius: 10px; overflow: hidden; page-break-inside: avoid; }
  .front { background: #7c6af711; padding: 16px; border-bottom: 2px solid #7c6af733; }
  .front-label { font-size: 9px; color: #7c6af7; font-weight: bold; text-transform: uppercase; margin-bottom: 6px; }
  .front-text { font-size: 14px; font-weight: 600; color: #1a202c; line-height: 1.4; }
  .back { background: #f8fafc; padding: 16px; }
  .back-label { font-size: 9px; color: #64748b; font-weight: bold; text-transform: uppercase; margin-bottom: 6px; }
  .back-text { font-size: 13px; color: #374151; line-height: 1.5; }
  .subject { display: inline-block; font-size: 10px; padding: 2px 8px; border-radius: 4px; background: #e2e8f0; color: #64748b; margin-top: 8px; }
  @media print { body { padding: 10px; } }
</style>
</head>
<body>
<h1>📚 Flashcards Export – fokusflow</h1>
<div class="grid">
${toExport.map(c => `
  <div class="card">
    <div class="front">
      <div class="front-label">❓ Frage</div>
      <div class="front-text">${c.front}</div>
      ${c.examSubject ? `<div class="subject">${c.examSubject}</div>` : ""}
    </div>
    <div class="back">
      <div class="back-label">✅ Antwort</div>
      <div class="back-text">${c.back}</div>
    </div>
  </div>`).join("")}
</div>
</body>
</html>`;

    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  };

  // ── LERNMODUS VIEW ──
  if (view === "learn" && learnCards.length > 0) {
    const card = learnCards[learnIdx];
    const progress = (learnIdx / learnCards.length) * 100;
    return (
      <div style={{ padding: "clamp(12px, 4vw, 32px)", animation: "fadeUp 0.4s ease", maxWidth: 600, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ fontFamily: T.font, fontWeight: 800, fontSize: 18 }}>🃏 Karten lernen</div>
          <button onClick={() => setView("overview")} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 16px", color: T.muted, cursor: "pointer", fontSize: 13 }}>✕ Beenden</button>
        </div>
        <div style={{ background: T.border, borderRadius: 99, height: 6, marginBottom: 8 }}>
          <div style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${T.accent}, ${T.green})`, height: "100%", borderRadius: 99, transition: "width 0.4s" }} />
        </div>
        <div style={{ fontSize: 12, color: T.muted, marginBottom: 28 }}>{learnIdx + 1} / {learnCards.length}</div>

        {/* Karte */}
        <div onClick={() => setFlipped(f => !f)} style={{
          background: T.card, border: `2px solid ${flipped ? T.green + "88" : T.accent + "88"}`,
          borderRadius: 20, padding: "40px 32px", textAlign: "center", cursor: "pointer",
          minHeight: 220, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          transition: "border-color 0.3s", animation: "fadeUp 0.3s ease",
          boxShadow: flipped ? `0 0 30px ${T.green}22` : `0 0 30px ${T.accent}22`,
        }}>
          <div style={{ fontSize: 11, color: flipped ? T.green : T.accent, fontWeight: 600, marginBottom: 16, letterSpacing: 1 }}>
            {flipped ? "✅ ANTWORT" : "❓ FRAGE"}
          </div>
          <div style={{ fontFamily: T.font, fontSize: 20, fontWeight: 700, lineHeight: 1.5 }}>
            {flipped ? card.back : card.front}
          </div>
          {!flipped && <div style={{ marginTop: 20, fontSize: 12, color: T.muted }}>Tippe zum Umdrehen</div>}
          {card.examSubject && <div style={{ marginTop: 16, fontSize: 11, color: card.examColor, background: card.examColor + "22", borderRadius: 6, padding: "2px 10px" }}>{card.examSubject}</div>}
        </div>

        {flipped && (
          <div style={{ display: "flex", gap: 12, marginTop: 24, animation: "fadeUp 0.2s ease" }}>
            <button onClick={() => learnFeedback(false)} style={{ flex: 1, background: T.red + "22", border: `1px solid ${T.red}44`, borderRadius: 12, padding: "14px", color: T.red, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
              ❌ Nochmal
            </button>
            <button onClick={() => learnFeedback(true)} style={{ flex: 1, background: T.green + "22", border: `1px solid ${T.green}44`, borderRadius: 12, padding: "14px", color: T.green, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
              ✅ Gewusst! +3 XP
            </button>
          </div>
        )}
        {!flipped && (
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <button onClick={() => learnFeedback(false)} style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", fontSize: 12 }}>Überspringen →</button>
          </div>
        )}
      </div>
    );
  }

  if (view === "learnDone") {
    const known = learnCards.filter(c => (cards.find(cc => cc.id === c.id)?.score || 0) > 0).length;
    return (
      <div style={{ padding: 32, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", animation: "fadeUp 0.4s ease" }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
        <div style={{ fontFamily: T.font, fontWeight: 800, fontSize: 24, marginBottom: 8 }}>Runde abgeschlossen!</div>
        <div style={{ color: T.muted, fontSize: 14, marginBottom: 24 }}>{known} von {learnCards.length} Karten gewusst</div>
        <div style={{ display: "flex", gap: 12 }}>
          <Btn onClick={startLearn}>🔄 Nochmal</Btn>
          <button onClick={() => setView("overview")} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 20px", color: T.muted, cursor: "pointer", fontSize: 14 }}>Zur Übersicht</button>
        </div>
      </div>
    );
  }

  // ── OVERVIEW / ADD / GENERATE ──
  return (
    <div style={{ padding: "clamp(12px, 4vw, 32px)", animation: "fadeUp 0.4s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <PageHeader title="🃏 Flashcards" sub="Lernkarten erstellen, lernen und exportieren" />
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={exportPDF} disabled={!filteredCards.length} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 16px", color: filteredCards.length ? T.text : T.muted, cursor: filteredCards.length ? "pointer" : "not-allowed", fontSize: 13 }}>
            🖨️ Drucken / PDF
          </button>
          {filteredCards.length > 0 && (
            <Btn onClick={startLearn}>▶ Lernen starten</Btn>
          )}
        </div>
      </div>

      {/* Filter + Aktionen */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
        <select value={filterExam} onChange={e => setFilterExam(e.target.value)}
          style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 14px", color: T.text, fontSize: 13 }}>
          <option value="all">Alle Fächer ({cards.length})</option>
          {exams.map(e => <option key={e.id} value={e.id}>{e.subject} ({cards.filter(c => c.examId === e.id).length})</option>)}
        </select>
        <ToggleBtn active={view === "generate"} onClick={() => setView(view === "generate" ? "overview" : "generate")}>🤖 KI generieren</ToggleBtn>
        <ToggleBtn active={view === "add"} onClick={() => setView(view === "add" ? "overview" : "add")}>✏️ Manuell hinzufügen</ToggleBtn>
      </div>

      {/* KI Generieren Panel */}
      {view === "generate" && (
        <div style={{ background: T.card, border: `1px solid ${T.accent}44`, borderRadius: 16, padding: 24, marginBottom: 24, animation: "fadeUp 0.3s ease" }}>
          <div style={{ fontFamily: T.font, fontWeight: 700, marginBottom: 16 }}>🤖 KI-Flashcards generieren</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 12, alignItems: "end" }}>
            <div>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>Fach</div>
              <select value={selectedExam} onChange={e => setSelectedExam(e.target.value)}
                style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 12px", color: T.text, fontSize: 13 }}>
                {exams.map(e => <option key={e.id} value={e.id}>{e.subject}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>Anzahl Karten</div>
              <select value={genCount} onChange={e => setGenCount(Number(e.target.value))}
                style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 12px", color: T.text, fontSize: 13 }}>
                {[5, 10, 15, 20].map(n => <option key={n} value={n}>{n} Karten</option>)}
              </select>
            </div>
            <Btn onClick={generateCards} disabled={genLoading || !exam}>
              {genLoading ? "⏳ Generiere..." : `✨ Erstellen (+20 XP)`}
            </Btn>
          </div>
          {exam?.topics?.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: T.muted }}>Basierend auf:</span>
              {exam.topics.map(t => <span key={t} style={{ fontSize: 11, background: (exam.color || T.accent) + "22", color: exam.color || T.accent, borderRadius: 6, padding: "2px 8px" }}>{t}</span>)}
            </div>
          )}
        </div>
      )}

      {/* Manuell hinzufügen Panel */}
      {view === "add" && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 24, marginBottom: 24, animation: "fadeUp 0.3s ease" }}>
          <div style={{ fontFamily: T.font, fontWeight: 700, marginBottom: 16 }}>✏️ Karte manuell erstellen</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>❓ Vorderseite (Frage)</div>
              <textarea value={manualForm.front} onChange={e => setManualForm(f => ({ ...f, front: e.target.value }))}
                placeholder="Was ist eine Bilanz?"
                style={{ width: "100%", height: 90, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, color: T.text, fontSize: 13, resize: "none", fontFamily: T.body }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>✅ Rückseite (Antwort)</div>
              <textarea value={manualForm.back} onChange={e => setManualForm(f => ({ ...f, back: e.target.value }))}
                placeholder="Eine Bilanz ist eine Gegenüberstellung von Aktiva und Passiva..."
                style={{ width: "100%", height: 90, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, color: T.text, fontSize: 13, resize: "none", fontFamily: T.body }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "end" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>Fach zuordnen (optional)</div>
              <select value={manualForm.examId} onChange={e => setManualForm(f => ({ ...f, examId: e.target.value }))}
                style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 12px", color: T.text, fontSize: 13 }}>
                <option value="">– Kein Fach –</option>
                {exams.map(e => <option key={e.id} value={e.id}>{e.subject}</option>)}
              </select>
            </div>
            <Btn onClick={addManual} disabled={!manualForm.front || !manualForm.back}>
              + Karte hinzufügen (+5 XP)
            </Btn>
          </div>
        </div>
      )}

      {/* Karten Grid */}
      {filteredCards.length === 0 ? (
        <EmptyState icon="🃏" text="Noch keine Karten. Lass die KI welche generieren oder füge eigene hinzu!" />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {filteredCards.map(card => (
            <FlashCard key={card.id} card={card} onDelete={() => deleteCard(card.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function FlashCard({ card, onDelete }) {
  const [flipped, setFlipped] = useState(false);
  const score = card.score || 0;
  const scoreColor = score >= 3 ? T.green : score >= 1 ? T.orange : T.muted;

  return (
    <div style={{ perspective: 1000 }}>
      <div onClick={() => setFlipped(f => !f)} style={{
        background: T.card, border: `1px solid ${flipped ? T.green + "55" : T.border}`,
        borderRadius: 14, overflow: "hidden", cursor: "pointer", transition: "border-color 0.3s",
        minHeight: 160,
      }}>
        <div style={{ background: (card.examColor || T.accent) + "15", padding: "12px 14px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 10, color: flipped ? T.green : card.examColor || T.accent, fontWeight: 600 }}>
              {flipped ? "✅ ANTWORT" : "❓ FRAGE"}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, color: scoreColor }}>★ {score}</span>
              <button onClick={e => { e.stopPropagation(); onDelete(); }}
                style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", fontSize: 12, padding: "2px 4px" }}>✕</button>
            </div>
          </div>
        </div>
        <div style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: T.text }}>
            {flipped ? card.back : card.front}
          </div>
          {card.examSubject && (
            <div style={{ marginTop: 10, fontSize: 10, color: card.examColor || T.accent, background: (card.examColor || T.accent) + "22", borderRadius: 4, padding: "2px 8px", display: "inline-block" }}>
              {card.examSubject}
            </div>
          )}
        </div>
        <div style={{ padding: "6px 14px 10px", fontSize: 10, color: T.muted }}>Tippe zum Umdrehen</div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════
// BADGES TAB
// ════════════════════════════════════════════════
function BadgesTab({ badges, xp, streak, tasks, onImport }) {
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState(null);
  const importRef = useRef();

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true); setImportMsg(null);
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const result = await onImport(raw);
      setImportMsg({ type: "ok", text: `✅ ${result} importiert!` });
    } catch (err) {
      setImportMsg({ type: "err", text: "Fehler beim Import: " + err.message });
    }
    setImporting(false);
    e.target.value = "";
  };
  const level = getLevel(xp);
  const doneTasks = tasks.filter(t => t.done).length;

  const isUnlocked = (id) => badges.includes(id);

  // Fortschritt pro Badge berechnen
  const getProgress = (badge) => {
    switch (badge.id) {
      case "first_session": return { current: doneTasks > 0 ? 1 : 0, max: 1 };
      case "streak_3":  return { current: Math.min(streak, 3), max: 3 };
      case "streak_7":  return { current: Math.min(streak, 7), max: 7 };
      case "streak_14": return { current: Math.min(streak, 14), max: 14 };
      case "level_5":  return { current: Math.min(level, 5), max: 5 };
      case "level_10": return { current: Math.min(level, 10), max: 10 };
      case "level_20": return { current: Math.min(level, 20), max: 20 };
      case "cards_50": return { current: Math.min(doneTasks, 50), max: 50 };
      case "perfect_quiz": return { current: isUnlocked("perfect_quiz") ? 1 : 0, max: 1 };
      case "all_done": return { current: isUnlocked("all_done") ? 1 : 0, max: 1 };
      case "planner":  return { current: isUnlocked("planner") ? 1 : 0, max: 1 };
      case "early_bird": return { current: isUnlocked("early_bird") ? 1 : 0, max: 1 };
      default: return { current: 0, max: 1 };
    }
  };

  const unlockedCount = BADGES.filter(b => isUnlocked(b.id)).length;

  return (
    <div style={{ padding: "clamp(12px, 4vw, 32px)", animation: "fadeUp 0.4s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <div style={{ fontFamily: T.font, fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>🏅 Badges & Erfolge</div>
          <div style={{ color: T.muted, marginTop: 4, fontSize: 14 }}>Deine Lernleistungen auf einen Blick</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImport} />
          <button onClick={() => importRef.current?.click()} disabled={importing}
            style={{ background: importing ? T.border : `linear-gradient(135deg, ${T.accent}, #9f8ffa)`, border: "none", borderRadius: 10, padding: "10px 18px", color: "white", cursor: importing ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600 }}>
            {importing ? "⏳ Importiere..." : "📥 Daten importieren"}
          </button>
          {importMsg && (
            <div style={{ fontSize: 12, color: importMsg.type === "ok" ? T.green : T.red, maxWidth: 200, textAlign: "right" }}>
              {importMsg.text}
            </div>
          )}
        </div>
      </div>

      {/* Level-Übersicht */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 28 }}>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 20 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⭐</div>
          <div style={{ fontFamily: T.font, fontSize: 28, fontWeight: 800, color: T.accent }}>Level {level}</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{xp} XP gesamt</div>
          <div style={{ background: T.border, borderRadius: 99, height: 6, marginTop: 10, overflow: "hidden" }}>
            <div style={{ width: `${getXPProgress(xp)}%`, background: `linear-gradient(90deg, ${T.accent}, #a78bfa)`, height: "100%", borderRadius: 99 }} />
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{100 - getXPProgress(xp)} XP bis Level {level + 1}</div>
        </div>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 20 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🏅</div>
          <div style={{ fontFamily: T.font, fontSize: 28, fontWeight: 800, color: T.yellow }}>{unlockedCount}/{BADGES.length}</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>Badges freigeschaltet</div>
          <div style={{ background: T.border, borderRadius: 99, height: 6, marginTop: 10, overflow: "hidden" }}>
            <div style={{ width: `${(unlockedCount / BADGES.length) * 100}%`, background: `linear-gradient(90deg, ${T.yellow}, ${T.orange})`, height: "100%", borderRadius: 99 }} />
          </div>
        </div>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 20 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{getStreakInfo(streak).icon}</div>
          <div style={{ fontFamily: T.font, fontSize: 28, fontWeight: 800, color: getStreakInfo(streak).color }}>{getStreakInfo(streak).label}</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>Aktueller Streak</div>
          <div style={{ fontSize: 11, color: getStreakInfo(streak).color, marginTop: 8, fontWeight: 600 }}>
            {getStreakInfo(streak).sub}
          </div>
        </div>
      </div>

      {/* Level-Roadmap */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 20, marginBottom: 24 }}>
        <div style={{ fontFamily: T.font, fontWeight: 700, marginBottom: 16 }}>🗺️ Level-Roadmap</div>
        <div style={{ display: "flex", gap: 0, position: "relative" }}>
          <div style={{ position: "absolute", top: 16, left: 0, right: 0, height: 2, background: T.border }} />
          {[1, 5, 10, 15, 20, 25].map(lvl => {
            const reached = level >= lvl;
            const reward = getLevelReward(lvl);
            return (
              <div key={lvl} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", zIndex: 1 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%", marginBottom: 8,
                  background: reached ? `linear-gradient(135deg, ${T.accent}, #a78bfa)` : T.surface,
                  border: `2px solid ${reached ? T.accent : T.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14,
                }}>
                  {reached ? (reward?.icon || "✓") : lvl}
                </div>
                <div style={{ fontSize: 10, color: reached ? T.accent : T.muted, fontWeight: reached ? 600 : 400, textAlign: "center" }}>
                  Lvl {lvl}
                </div>
                {reward && <div style={{ fontSize: 9, color: T.muted, textAlign: "center", maxWidth: 60, marginTop: 2, lineHeight: 1.3 }}>
                  {reward.text.split("!")[0].replace("freigeschaltet:", "").trim()}
                </div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Badges Grid */}
      <div style={{ fontFamily: T.font, fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Alle Badges</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        {BADGES.map(badge => {
          const unlocked = isUnlocked(badge.id);
          const prog = getProgress(badge);
          const pct = Math.min(100, (prog.current / prog.max) * 100);
          return (
            <div key={badge.id} style={{
              background: unlocked ? T.accentSoft : T.card,
              border: `1px solid ${unlocked ? T.accent + "66" : T.border}`,
              borderRadius: 14, padding: "16px",
              opacity: unlocked ? 1 : 0.7,
              transition: "all 0.2s",
            }}>
              <div style={{ fontSize: 32, marginBottom: 8, filter: unlocked ? "none" : "grayscale(1)" }}>{badge.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: unlocked ? T.text : T.muted }}>{badge.name}</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 3, lineHeight: 1.5 }}>{badge.desc}</div>
              {unlocked ? (
                <div style={{ fontSize: 11, color: T.green, marginTop: 8, fontWeight: 600 }}>✅ Freigeschaltet · +{badge.xpBonus} XP</div>
              ) : (
                <>
                  <div style={{ background: T.border, borderRadius: 99, height: 4, marginTop: 10, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, background: T.accent, height: "100%", borderRadius: 99, transition: "width 0.5s" }} />
                  </div>
                  <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>{prog.current}/{prog.max}</div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ════════════════════════════════════════════════
// LOGIN SCREEN
// ════════════════════════════════════════════════
function LoginScreen() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const handle = async () => {
    setLoading(true); setMessage(null);
    try {
      if (mode === "magic") {
        await signInMagicLink(email);
        setMessage({ type: "ok", text: "Magic Link gesendet! Prüfe deine E-Mails." });
      } else if (mode === "register") {
        const { error } = await signUp(email, password);
        if (error) throw error;
        setMessage({ type: "ok", text: "Registriert! Prüfe deine E-Mails zur Bestätigung." });
      } else {
        const { error } = await signIn(email, password);
        if (error) throw error;
      }
    } catch (err) {
      setMessage({ type: "err", text: err.message || "Fehler beim Anmelden." });
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontFamily: T.font, fontSize: 36, fontWeight: 800 }}>
            <span style={{ color: T.accent }}>fokus</span>flow
          </div>
          <div style={{ fontSize: 14, color: T.muted, marginTop: 6 }}>Smarter lernen.</div>
        </div>

        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: 32 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
            {[["login","Anmelden"],["register","Registrieren"],["magic","Magic Link"]].map(([m, l]) => (
              <button key={m} onClick={() => { setMode(m); setMessage(null); }} style={{
                flex: 1, background: mode === m ? T.accentSoft : T.surface,
                border: `1px solid ${mode === m ? T.accent : T.border}`,
                borderRadius: 10, padding: "8px 4px", color: mode === m ? T.accent : T.muted,
                cursor: "pointer", fontSize: 11, fontWeight: mode === m ? 600 : 400,
              }}>{l}</button>
            ))}
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>E-Mail</div>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handle()}
              placeholder="deine@email.de"
              style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", color: T.text, fontSize: 14, fontFamily: T.body }} />
          </div>

          {mode !== "magic" && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>Passwort</div>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handle()}
                placeholder="••••••••"
                style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", color: T.text, fontSize: 14, fontFamily: T.body }} />
            </div>
          )}

          {message && (
            <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, background: message.type === "ok" ? T.green + "22" : T.red + "22", color: message.type === "ok" ? T.green : T.red, fontSize: 13 }}>
              {message.text}
            </div>
          )}

          <button onClick={handle} disabled={loading || !email}
            style={{ width: "100%", background: loading || !email ? T.border : `linear-gradient(135deg, ${T.accent}, #9f8ffa)`, border: "none", borderRadius: 12, padding: "14px", color: "white", cursor: loading || !email ? "not-allowed" : "pointer", fontSize: 15, fontWeight: 700, fontFamily: T.font }}>
            {loading ? "⏳ Bitte warten..." : mode === "login" ? "Anmelden →" : mode === "register" ? "Registrieren →" : "Magic Link senden →"}
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: T.muted }}>
          Deine Daten werden sicher in der EU gespeichert.
        </div>
      </div>
    </div>
  );
}

function Focus({ addXP, markStudiedToday }) {
  const isMobile = useIsMobile();
  const DURATIONS = [{ label: "15 min", min: 15 }, { label: "25 min", min: 25 }, { label: "45 min", min: 45 }];
  const [selected, setSelected] = useState(DURATIONS[1]);
  const [running, setRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(DURATIONS[1].min * 60);
  const [sessions, setSessions] = useState(0);
  const [phase, setPhase] = useState("focus");
  const intervalRef = useRef();

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft(s => {
          if (s <= 1) {
            clearInterval(intervalRef.current);
            setRunning(false);
            if (phase === "focus") { setSessions(n => n + 1); addXP(selected.min); markStudiedToday(); setPhase("break"); return 5 * 60; }
            else { setPhase("focus"); return selected.min * 60; }
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [running, phase, selected, addXP, markStudiedToday]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const total = phase === "focus" ? selected.min * 60 : 5 * 60;
  const r = isMobile ? 70 : 80;
  const size = r * 2 + 40;
  const circumference = 2 * Math.PI * r;

  return (
    <div style={{ padding: isMobile ? 16 : 32, animation: "fadeUp 0.4s ease" }}>
      <PageHeader title="🎯 Fokus Timer" sub="Fokussiert & strukturiert lernen" />
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: isMobile ? "100%" : 500, margin: "0 auto" }}>

        {/* Timer Card */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: isMobile ? 24 : 36, display: "flex", flexDirection: "column", alignItems: "center", gap: isMobile ? 16 : 20 }}>
          <div style={{ display: "flex", gap: 10 }}>
            {DURATIONS.map(d => (
              <ToggleBtn key={d.label} active={selected.label === d.label} onClick={() => { setSelected(d); setSecondsLeft(d.min * 60); setRunning(false); }}>
                {d.label}
              </ToggleBtn>
            ))}
          </div>

          <div style={{ position: "relative", width: size, height: size }}>
            <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
              <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={T.border} strokeWidth="8" />
              <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={phase === "focus" ? T.accent : T.green}
                strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - (total - secondsLeft) / total)}
                style={{ transition: "stroke-dashoffset 0.5s ease" }} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>{phase === "focus" ? "FOKUS" : "PAUSE ☕"}</div>
              <div style={{ fontFamily: T.font, fontSize: isMobile ? 38 : 42, fontWeight: 800, color: phase === "focus" ? T.accent : T.green }}>{mm}:{ss}</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>+{selected.min} XP</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, width: "100%", maxWidth: 280 }}>
            <Btn onClick={() => setRunning(r => !r)} style={{ flex: 1, padding: "14px" }}>
              {running ? "⏸ Pause" : "▶ Start"}
            </Btn>
            <button onClick={() => { setRunning(false); setSecondsLeft(selected.min * 60); setPhase("focus"); }}
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 20px", color: T.muted, cursor: "pointer", fontSize: 16 }}>↺</button>
          </div>

          <div style={{ fontSize: 13, color: T.muted }}>🏅 Sessions: <strong style={{ color: T.text }}>{sessions}</strong></div>
        </div>

        {/* Tipps Card – auf Mobile kompakt horizontal */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: isMobile ? 16 : 20 }}>
          <div style={{ fontFamily: T.font, fontWeight: 700, marginBottom: 12, fontSize: 14 }}>🧠 Fokus Tipps</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr", gap: 10 }}>
            {[
              { icon: "🎵", title: "Lo-Fi Musik", desc: "Instrumentale Musik hilft beim Fokussieren" },
              { icon: "📵", title: "Handy weg", desc: "Aus den Augen, aus dem Sinn" },
              { icon: "💧", title: "Trinken", desc: "Wasser vor dem Start bereitstellen" },
              { icon: "✍️", title: "Aktiv notieren", desc: "Mitschreiben verankert Wissen" },
            ].map(t => (
              <div key={t.title} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: T.surface, borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: isMobile ? 18 : 22, flexShrink: 0 }}>{t.icon}</div>
                <div>
                  <div style={{ fontSize: isMobile ? 12 : 13, fontWeight: 600 }}>{t.title}</div>
                  {!isMobile && <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{t.desc}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════
// KI CHAT
// ════════════════════════════════════════════════
function Chat({ exams, tasks }) {
  const [messages, setMessages] = useState([{ role: "assistant", content: "Hey! 👋 Ich bin dein Lerncoach. Wie kann ich dir heute helfen?" }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef();

  const examContext = exams.map(e => `${e.subject}: ${daysUntil(e.date)} Tage, ${e.progress || 0}% Fortschritt`).join("; ");
  const pendingTasks = tasks.filter(t => !t.done).length;

  const send = async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    const newMessages = [...messages, { role: "user", content: msg }];
    setMessages(newMessages);
    setLoading(true);
    const system = `Du bist ein einfühlsamer ADHS-Lerncoach. Kurz, prägnant, motivierend. Auf Deutsch.
Klausuren: ${examContext || "keine"}
Offene Aufgaben: ${pendingTasks}`;
    const reply = await callClaude(newMessages.map(m => ({ role: m.role, content: m.content })), system);
    setMessages([...newMessages, { role: "assistant", content: reply }]);
    setLoading(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  return (
    <div style={{ padding: 32, height: "100vh", display: "flex", flexDirection: "column", animation: "fadeUp 0.4s ease" }}>
      <PageHeader title="🤖 KI-Lerncoach" sub="Dein persönlicher Lerncoach" />
      <div style={{ flex: 1, overflow: "auto", background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 20, marginBottom: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "75%", background: m.role === "user" ? T.accent : T.surface, borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", padding: "12px 16px", fontSize: 14, lineHeight: 1.7, color: m.role === "user" ? "white" : T.text }}>
              {m.content.split("\n").map((line, j) => <span key={j}>{line}{j < m.content.split("\n").length - 1 && <br />}</span>)}
            </div>
          </div>
        ))}
        {loading && <div style={{ display: "flex", gap: 6, padding: "8px 14px" }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: T.accent, animation: `pulse 1s ease ${i * 0.2}s infinite` }} />)}</div>}
        <div ref={bottomRef} />
      </div>
      {messages.length <= 2 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {["Ich kann mich nicht konzentrieren – was tun?", "Priorisiere meine Klausuren", "Erkläre mir Spaced Repetition", "Motiviere mich!"].map(s => (
            <button key={s} onClick={() => setInput(s)} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 99, padding: "6px 14px", color: T.muted, cursor: "pointer", fontSize: 12 }}>{s}</button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Frag deinen Coach..."
          style={{ flex: 1, background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 16px", color: T.text, fontSize: 14, fontFamily: T.body }} />
        <Btn onClick={send} disabled={loading || !input.trim()}>Senden ↑</Btn>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════
// SHARED
// ════════════════════════════════════════════════
function PageHeader({ title, sub }) {
  const isMobile = useIsMobile();
  return (
    <div style={{ marginBottom: isMobile ? 16 : 28 }}>
      <div style={{ fontFamily: T.font, fontSize: isMobile ? 20 : 26, fontWeight: 800, letterSpacing: -0.5 }}>{title}</div>
      {sub && <div style={{ color: T.muted, marginTop: 4, fontSize: isMobile ? 12 : 14 }}>{sub}</div>}
    </div>
  );
}
function StatCard({ icon, label, value, sub, color }) {
  const isMobile = useIsMobile();
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: isMobile ? "14px 12px" : "20px", position: "relative", overflow: "hidden" }}>
      <div style={{ fontSize: isMobile ? 18 : 24, marginBottom: isMobile ? 6 : 10 }}>{icon}</div>
      <div style={{ fontSize: isMobile ? 10 : 11, color: T.muted, marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: T.font, fontSize: isMobile ? 18 : 26, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: isMobile ? 10 : 11, color: T.muted, marginTop: 2 }}>{sub}</div>
    </div>
  );
}
function Card({ title, subtitle, children }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: "20px" }}>
      <div style={{ fontFamily: T.font, fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: T.muted, marginBottom: 16 }}>{subtitle}</div>}
      {children}
    </div>
  );
}
function Btn({ children, onClick, disabled, style = {} }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ background: disabled ? T.border : `linear-gradient(135deg, ${T.accent}, #9f8ffa)`, border: "none", borderRadius: 10, padding: "10px 20px", color: disabled ? T.muted : "white", cursor: disabled ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600, fontFamily: T.body, transition: "all 0.15s", ...style }}>
      {children}
    </button>
  );
}
function ToggleBtn({ children, active, onClick }) {
  return (
    <button onClick={onClick} style={{ background: active ? T.accentSoft : T.surface, border: `1px solid ${active ? T.accent : T.border}`, borderRadius: 8, padding: "6px 14px", color: active ? T.accent : T.muted, cursor: "pointer", fontSize: 12, fontWeight: active ? 600 : 400, transition: "all 0.15s" }}>
      {children}
    </button>
  );
}
function Input({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div>
      {label && <div style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>{label}</div>}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 12px", color: T.text, fontSize: 13, fontFamily: T.body }} />
    </div>
  );
}
function LoadingCard({ text }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: "48px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      <div style={{ width: 40, height: 40, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <div style={{ color: T.muted, fontSize: 14 }}>{text}</div>
    </div>
  );
}
function EmptyState({ icon, text }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 0", color: T.muted }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 14, maxWidth: 360, margin: "0 auto" }}>{text}</div>
    </div>
  );
}