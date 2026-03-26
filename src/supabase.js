import { createClient } from '@supabase/supabase-js';

const URL = process.env.REACT_APP_SUPABASE_URL;
const KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = createClient(URL, KEY);

// ── AUTH ──
export const signUp = (email, password) =>
  supabase.auth.signUp({ email, password });

export const signIn = (email, password) =>
  supabase.auth.signInWithPassword({ email, password });

export const signInMagicLink = (email) =>
  supabase.auth.signInWithOtp({ email });

export const signOut = () => supabase.auth.signOut();

export const getUser = () => supabase.auth.getUser();

// ── PROFILE ──
export const loadProfile = async (userId) => {
  const { data } = await supabase
    .from('profiles').select('*').eq('id', userId).single();
  return data;
};

export const saveProfile = async (userId, updates) => {
  await supabase.from('profiles').upsert({ id: userId, ...updates });
};

// ── EXAMS ──
export const loadExams = async (userId) => {
  const { data } = await supabase
    .from('exams').select('*').eq('user_id', userId).order('date');
  return data || [];
};

export const saveExam = async (userId, exam) => {
  await supabase.from('exams').upsert({
    id: exam.id, user_id: userId, subject: exam.subject,
    date: exam.date, color: exam.color, topics: exam.topics || [],
    progress: exam.progress || 0, plan: exam.plan || null,
  });
};

export const deleteExam = async (id) => {
  await supabase.from('exams').delete().eq('id', id);
};

// ── TASKS ──
export const loadTasks = async (userId) => {
  const { data } = await supabase
    .from('tasks').select('*').eq('user_id', userId);
  return data || [];
};

export const saveTask = async (userId, task) => {
  await supabase.from('tasks').upsert({
    id: task.id, user_id: userId, text: task.text,
    done: task.done || false, exam_id: task.examId || null,
    xp_val: task.xpVal || 25, duration: task.duration || 25,
    priority: task.priority || 1, type: task.type || 'lernen',
    planned_date: task.plannedDate || null,
    feedback: task.feedback || null, done_date: task.doneDate || null,
  });
};

export const saveTasks = async (userId, tasks) => {
  if (!tasks.length) return;
  await supabase.from('tasks').upsert(
    tasks.map(task => ({
      id: task.id, user_id: userId, text: task.text,
      done: task.done || false, exam_id: task.examId || null,
      xp_val: task.xpVal || 25, duration: task.duration || 25,
      priority: task.priority || 1, type: task.type || 'lernen',
      planned_date: task.plannedDate || null,
      feedback: task.feedback || null, done_date: task.doneDate || null,
    }))
  );
};

export const deleteTask = async (id) => {
  await supabase.from('tasks').delete().eq('id', id);
};

export const deleteTasks = async (userId) => {
  await supabase.from('tasks').delete().eq('user_id', userId).eq('done', false);
};

// ── CARDS ──
export const loadCards = async (userId) => {
  const { data } = await supabase
    .from('cards').select('*').eq('user_id', userId);
  return data || [];
};

export const saveCards = async (userId, cards) => {
  if (!cards.length) return;
  await supabase.from('cards').upsert(
    cards.map(c => ({
      id: c.id, user_id: userId, front: c.front, back: c.back,
      exam_id: c.examId || null, exam_subject: c.examSubject || null,
      exam_color: c.examColor || null, topic: c.topic || null,
      score: c.score || 0,
    }))
  );
};

export const deleteCard = async (id) => {
  await supabase.from('cards').delete().eq('id', id);
};

// ── SEMESTER PLAN ──
export const loadSemesterPlan = async (userId) => {
  const { data } = await supabase
    .from('semester_plans').select('*').eq('user_id', userId).single();
  return data ? { overview: data.overview, days: data.days, generatedAt: data.generated_at } : null;
};

export const saveSemesterPlan = async (userId, plan) => {
  await supabase.from('semester_plans').upsert({
    user_id: userId, overview: plan.overview,
    days: plan.days, generated_at: plan.generatedAt,
  }, {
    onConflict: 'user_id'
  });
};

// ── DATEN KONVERTIEREN (Supabase → App Format) ──
export const convertExam = (e) => ({
  id: e.id, subject: e.subject, date: e.date,
  color: e.color, topics: e.topics || [],
  progress: e.progress || 0, plan: e.plan || null,
});

export const convertTask = (t) => ({
  id: t.id, text: t.text, done: t.done,
  examId: t.exam_id, xpVal: t.xp_val,
  duration: t.duration, priority: t.priority,
  type: t.type, plannedDate: t.planned_date,
  feedback: t.feedback, doneDate: t.done_date,
});

export const convertCard = (c) => ({
  id: c.id, front: c.front, back: c.back,
  examId: c.exam_id, examSubject: c.exam_subject,
  examColor: c.exam_color, topic: c.topic, score: c.score,
  createdAt: c.created_at,
});