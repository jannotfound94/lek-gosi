"use strict";
/* LEK Gosi – aplikacja do nauki z bazy pytań CEM. Działa w całości w przeglądarce, bez serwera. */

const NAME = "Gosia";
const VOC = "Gosiu";
const DEFAULT_EXAM = "2027-02-20";
const SMK_DEADLINE = "2026-11-30";
const STORE_KEY = "lek-gosia-v1";
const L = ["A", "B", "C", "D", "E"];

let FIELDS = [], Q = [], BYID = {}, KEYS = {};
let S = { view: "home" };
let store = { ans: {}, bm: [], days: {}, exams: [], examDate: DEFAULT_EXAM };
let canStore = true;

/* ---------- pomocnicze ---------- */
const $ = (sel) => document.querySelector(sel);
function h(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
}
function esc(s) { return s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
const BOOK = "Bręborowicz = „Położnictwo i ginekologia”, red. G.H. Bręborowicz, PZWL 2020 (t. 1 Położnictwo, t. 2 Ginekologia) – podręcznik z wykazu CEM. Szukaj tematu w spisie treści.";
function unsureBox(key) {
  return h("div", { class: "unsure" },
    h("span", { class: "h", text: "Dlaczego klucz jest niepewny" }), h("p", { text: key[3] }),
    h("span", { class: "h", text: "Gdzie sprawdzić" }), h("p", { text: key[4] }),
    /Bręborowicz/.test(key[4]) ? h("p", { class: "small", text: BOOK }) : null);
}

function rich(s) {
  // tekst z bazy: dopuszczamy wyłącznie <sup>, nowe linie zamieniamy na podział
  return esc(s).replace(/&lt;sup&gt;(.*?)&lt;\/sup&gt;/g, "<sup>$1</sup>").replace(/\n/g, "<br>");
}
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function pct(a, b) { return b ? Math.round(100 * a / b) : 0; }
function today() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function daysUntil(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(y, m - 1, d); const n = new Date(); n.setHours(0, 0, 0, 0);
  return Math.round((t - n) / 86400000);
}
function plDays(n) { const a = Math.abs(n); if (a === 1) return "dzień"; return "dni"; }
function plQ(n) { const a = Math.abs(n) % 100, b = a % 10; if (a === 1) return "pytanie"; if (b >= 2 && b <= 4 && (a < 12 || a > 14)) return "pytania"; return "pytań"; }
function fmtDate(iso) { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" }); }
function fieldOf(id) { return id.split("-")[0]; }

/* ---------- zapis postępu ---------- */
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { const p = JSON.parse(raw); store = Object.assign(store, p); }
  } catch (e) { canStore = false; }
}
function save() {
  if (!canStore) return;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { canStore = false; }
}
function record(id, ok) {
  const r = store.ans[id] || { n: 0, ok: 0 };
  r.n++; if (ok) r.ok++; r.last = ok ? 1 : 0; r.ts = Date.now();
  store.ans[id] = r;
  const t = today(); store.days[t] = (store.days[t] || 0) + 1;
  save();
}
function streak() {
  let n = 0; const d = new Date();
  if (!store.days[today()]) d.setDate(d.getDate() - 1);
  for (;;) {
    const k = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    if (store.days[k]) { n++; d.setDate(d.getDate() - 1); } else break;
  }
  return n;
}
function fieldStats(fid) {
  let seen = 0, n = 0, ok = 0, wrong = 0;
  for (const q of Q) {
    if (q.f !== fid) continue;
    const r = store.ans[q.id];
    if (r) { seen++; n += r.n; ok += r.ok; if (r.last === 0) wrong++; }
  }
  return { seen, n, ok, wrong };
}

/* ---------- dane ---------- */
async function boot() {
  load();
  try {
    const [qd, kd] = await Promise.all([
      fetch("data/questions.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch("data/keys.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    ]);
    FIELDS = qd.fields; KEYS = kd;
    Q = qd.q.map(([id, q, a]) => ({ id, q, a, f: fieldOf(id) }));
    for (const q of Q) BYID[q.id] = q;
  } catch (e) {
    $("#app").replaceChildren(h("div", { class: "loading" }, h("p", { text: "Nie udało się wczytać bazy pytań. Odśwież stronę albo sprawdź połączenie z internetem." })));
    return;
  }
  document.addEventListener("keydown", onKey);
  render();
}
const keyed = (id) => KEYS[id] && KEYS[id][0] != null;

/* ---------- widoki ---------- */
function render() {
  const app = $("#app");
  let v;
  if (S.view === "home") v = viewHome();
  else if (S.view === "field") v = viewField();
  else if (S.view === "quiz") v = viewQuiz();
  else if (S.view === "result") v = viewResult();
  v.classList.add("view");
  app.replaceChildren(v);
}
function go(view, extra) { S = Object.assign({ view }, extra || {}); render(); window.scrollTo(0, 0); }

function topBar(left) {
  return h("div", { class: "top" }, left || h("span", { class: "brand", text: "LEK · baza CEM" }),
    h("button", { class: "icon-btn", type: "button", onclick: openSettings, text: "Ustawienia" }));
}

function greeting() {
  const hr = new Date().getHours();
  if (hr < 5) return "Dobranoc, " + VOC;
  if (hr < 12) return "Dzień dobry, " + VOC;
  if (hr < 18) return "Cześć, " + VOC;
  return "Dobry wieczór, " + VOC;
}
function motto(days) {
  if (days < 0) return "Egzamin za Tobą. Trzymamy kciuki za wynik!";
  if (days === 0) return "To dziś. Powodzenia – umiesz więcej, niż Ci się wydaje.";
  if (days <= 14) return "Ostatnia prosta: powtórki i mini-egzaminy.";
  if (days <= 45) return "Dobry moment, żeby nadrabiać błędne pytania.";
  return "Krok po kroku, dziedzina po dziedzinie.";
}

function viewHome() {
  const days = daysUntil(store.examDate);
  const all = Object.values(store.ans);
  const n = all.reduce((s, r) => s + r.n, 0), ok = all.reduce((s, r) => s + r.ok, 0);
  const todayN = store.days[today()] || 0;
  const hero = h("section", { class: "hero", "aria-label": "Odliczanie do egzaminu" },
    h("div", { class: "ring", "aria-hidden": "true" }),
    h("div", null, h("h1", { text: greeting() }), h("p", { class: "sub", text: motto(days) })),
    h("div", { class: "count" },
      h("span", { class: "num", text: String(Math.max(days, 0)) }),
      h("span", { class: "lbl", text: (days >= 0 ? plDays(days) + " do LEK" : "dni po LEK") + " · " + fmtDate(store.examDate) })),
    h("div", { class: "hero-stats" },
      h("div", { class: "hero-stat" }, h("b", { text: String(todayN) }), h("span", { text: "dziś" })),
      h("div", { class: "hero-stat" }, h("b", { text: n ? pct(ok, n) + "%" : "–" }), h("span", { text: "poprawnych" })),
      h("div", { class: "hero-stat" }, h("b", { text: String(streak()) }), h("span", { text: "dni z rzędu" }))));

  const parts = [topBar(), hero];
  if (store.examDate === DEFAULT_EXAM && daysUntil(SMK_DEADLINE) >= 0) {
    parts.push(h("p", { class: "note" }, h("b", { text: "Przypomnienie: " }),
      "zgłoszenie na LEK 20 lutego 2027 składa się w SMK do " + fmtDate(SMK_DEADLINE) + " (zostało " + daysUntil(SMK_DEADLINE) + " " + plDays(daysUntil(SMK_DEADLINE)) + ")."));
  }
  const totalKeyed = FIELDS.reduce((s, f) => s + f.keyed, 0);
  parts.push(h("div", { class: "section-head" }, h("h2", { text: "Dziedziny" }),
    h("span", { class: "muted", text: Q.length + " pytań z bazy CEM · " + totalKeyed + " z kluczem" })));
  parts.push(h("div", { class: "tiles" }, FIELDS.map(tile)));
  const wrongAll = Q.filter(q => keyed(q.id) && store.ans[q.id] && store.ans[q.id].last === 0);
  parts.push(h("div", { class: "row" },
    h("button", { class: "btn accent", type: "button", disabled: wrongAll.length === 0, onclick: () => startQuiz("repeat", null), text: "Powtórz błędne (" + wrongAll.length + ")" }),
    h("button", { class: "btn ghost", type: "button", disabled: store.bm.length === 0, onclick: () => startQuiz("saved", null), text: "Zapisane (" + store.bm.length + ")" })));
  parts.push(foot());
  return h("div", { style: "display:grid;gap:22px" }, parts);
}

function tile(f) {
  const st = fieldStats(f.id);
  const ready = f.keyed > 0;
  const acc = pct(st.ok, st.n);
  return h("button", { class: "tile" + (ready ? "" : " locked"), type: "button", onclick: () => go("field", { field: f.id }) },
    h("span", { class: "name", text: f.name }),
    h("span", { class: "meta" },
      h("span", { class: "chip", text: f.lek + " pyt. na LEK" }),
      ready ? h("span", { class: "chip " + (f.keyed === f.total ? "ok" : "warn"), text: f.keyed === f.total ? "klucz gotowy" : "klucz: " + f.keyed + "/" + f.total })
            : h("span", { class: "chip", text: "klucz w przygotowaniu" })),
    h("div", { class: "bar", role: "img", "aria-label": "Rozwiązane " + st.seen + " z " + f.total },
      h("i", { class: st.n ? (acc >= 56 ? "good" : "bad") : "", style: "width:" + pct(st.seen, f.total) + "%" })),
    h("span", { class: "meta", text: st.seen + "/" + f.total + " rozwiązanych" + (st.n ? " · " + acc + "% poprawnych" : "") }));
}

function viewField() {
  const f = FIELDS.find(x => x.id === S.field);
  const st = fieldStats(f.id);
  const keyedQs = Q.filter(q => q.f === f.id && keyed(q.id));
  const fresh = keyedQs.filter(q => !store.ans[q.id]).length;
  const saved = store.bm.filter(id => fieldOf(id) === f.id).length;
  const parts = [topBar(h("button", { class: "back", type: "button", onclick: () => go("home"), text: "‹ Wszystkie dziedziny" })),
    h("div", { style: "display:grid;gap:6px" }, h("h1", { text: f.name, style: "font-size:clamp(1.6rem,4vw,2.1rem)" }),
      h("p", { class: "small", text: f.total + " pytań w bazie CEM · na LEK: " + f.lek + " pytań" }))];
  parts.push(h("section", { class: "panel kpis" },
    kpi(st.seen + "/" + f.total, "rozwiązanych"),
    kpi(st.n ? pct(st.ok, st.n) + "%" : "–", "poprawnych (próg LEK 56%)"),
    kpi(String(st.wrong), "do powtórki"),
    kpi(String(f.keyed), "z kluczem")));
  if (!f.keyed) {
    parts.push(h("p", { class: "note" }, h("b", { text: "Klucz w przygotowaniu. " }),
      "Baza CEM nie zawiera poprawnych odpowiedzi. Do czasu dodania klucza możesz przeglądać pytania – odpowiedzi nie będą sprawdzane."));
  } else if (f.keyed < f.total) {
    parts.push(h("p", { class: "note" }, h("b", { text: "Klucz częściowy: " }),
      f.keyed + " z " + f.total + " pytań ma już klucz z wyjaśnieniem. Pozostałe dojdą w kolejnych aktualizacjach."));
  }
  parts.push(h("div", { class: "modes" },
    mode("Ucz się", fresh ? fresh + " nowych, potem błędne" : "wszystkie przerobione – mieszamy", !f.keyed, () => startQuiz("learn", f.id)),
    mode("Powtórki", st.wrong + " " + plQ(st.wrong) + " z błędem", st.wrong === 0, () => startQuiz("repeat", f.id)),
    mode("Mini-egzamin", f.lek + " pytań jak na LEK, wynik na końcu", keyedQs.length < f.lek, () => startExam(f.id)),
    mode("Zapisane", saved + " oznaczonych gwiazdką", saved === 0, () => startQuiz("saved", f.id)),
    mode("Przeglądaj", "po kolei, bez sprawdzania", false, () => startQuiz("browse", f.id))));
  const box = h("div", { class: "results" });
  const inp = h("input", { class: "search", type: "search", id: "search", placeholder: "Szukaj w pytaniach tej dziedziny…", "aria-label": "Szukaj w pytaniach" });
  inp.addEventListener("input", () => {
    const t = inp.value.trim().toLowerCase();
    if (t.length < 3) { box.replaceChildren(); return; }
    const hits = Q.filter(q => q.f === f.id && (q.q + " " + q.a.join(" ")).toLowerCase().includes(t)).slice(0, 30);
    box.replaceChildren(...(hits.length ? hits.map(q => h("button", { class: "result", type: "button", onclick: () => startQuiz("single", f.id, q.id), text: q.q.slice(0, 160) + (q.q.length > 160 ? "…" : "") }))
      : [h("p", { class: "small", text: "Brak pytań z tym słowem." })]));
  });
  parts.push(h("section", { style: "display:grid;gap:10px" }, h("h2", { text: "Szukaj", style: "font-size:1.15rem" }), inp, box));
  parts.push(foot());
  return h("div", { style: "display:grid;gap:20px" }, parts);
}
function kpi(v, l) { return h("div", { class: "kpi" }, h("b", { text: v }), h("span", { text: l })); }
function mode(t, s, dis, fn) { return h("button", { class: "mode", type: "button", disabled: dis, onclick: fn }, h("b", { text: t }), h("span", { text: s })); }

/* ---------- sesje pytań ---------- */
function startQuiz(kind, fid, singleId) {
  let pool = Q.filter(q => !fid || q.f === fid);
  let list;
  if (kind === "learn") {
    pool = pool.filter(q => keyed(q.id));
    const fresh = shuffle(pool.filter(q => !store.ans[q.id]));
    const wrong = shuffle(pool.filter(q => store.ans[q.id] && store.ans[q.id].last === 0));
    const rest = shuffle(pool.filter(q => store.ans[q.id] && store.ans[q.id].last === 1));
    list = fresh.concat(wrong, rest);
  } else if (kind === "repeat") {
    list = shuffle(pool.filter(q => keyed(q.id) && store.ans[q.id] && store.ans[q.id].last === 0));
  } else if (kind === "saved") {
    list = pool.filter(q => store.bm.includes(q.id));
  } else if (kind === "browse") {
    list = pool.slice().sort((a, b) => a.id.localeCompare(b.id, "pl", { numeric: true }));
  } else if (kind === "single") {
    list = [BYID[singleId]];
  }
  if (!list.length) return;
  go("quiz", { kind, field: fid, list: list.map(q => q.id), i: 0, order: [0, 1, 2, 3, 4], picked: null, exam: null });
}
function startExam(fid) {
  const f = FIELDS.find(x => x.id === fid);
  const pool = shuffle(Q.filter(q => q.f === fid && keyed(q.id))).slice(0, f.lek);
  go("quiz", { kind: "exam", field: fid, list: pool.map(q => q.id), i: 0, order: [0, 1, 2, 3, 4], picked: null,
    exam: { answers: [], orders: [], start: Date.now() } });
}

function viewQuiz() {
  const id = S.list[S.i], q = BYID[id], key = KEYS[id];
  const isExam = S.kind === "exam";
  const graded = keyed(id);
  const backTo = () => S.field ? go("field", { field: S.field }) : go("home");
  const fName = FIELDS.find(x => x.id === q.f).name;
  const head = h("div", { class: "quiz-top" },
    h("button", { class: "back", type: "button", onclick: (e) => {
      if (!isExam || S.leaveArmed || S.exam.answers.length === 0) return backTo();
      S.leaveArmed = true; e.currentTarget.textContent = "‹ Na pewno? Kliknij jeszcze raz";
      setTimeout(() => { S.leaveArmed = false; }, 3000);
    }, text: "‹ " + (isExam ? "Przerwij egzamin" : "Zakończ") }),
    h("span", { class: "progress", text: (S.i + 1) + " / " + S.list.length }));
  const bar = h("div", { class: "bar", "aria-hidden": "true" }, h("i", { style: "width:" + pct(S.i, S.list.length) + "%" }));

  const card = h("article", { class: "qcard" });
  const meta = h("div", { class: "qmeta" }, h("span", { class: "chip accent", text: fName }),
    h("span", { class: "chip", text: "CEM cz. " + id.split("-")[1] + ", nr " + id.split("-")[2] }));
  if (!graded && !isExam) meta.append(h("span", { class: "chip warn", text: key ? "klucz niepewny" : "bez klucza" }));
  card.append(meta, h("div", { class: "qtext", html: rich(q.q) }));

  const reveal = S.picked != null && !isExam;
  const opts = h("div", { class: "opts", role: "group", "aria-label": "Odpowiedzi" });
  S.order.forEach((orig, pos) => {
    const b = h("button", { class: "opt", type: "button", id: "opt-" + pos },
      h("span", { class: "l", text: L[pos] }), h("span", { class: "t", html: rich(q.a[orig]) }));
    if (S.picked != null && !isExam) {
      b.disabled = true;
      if (graded && orig === key[0]) b.classList.add("right");
      else if (graded && orig === S.picked) b.classList.add("wrong");
      else if (!graded && orig === S.picked) b.classList.add("picked");
    } else {
      b.addEventListener("click", () => pick(orig));
    }
    opts.append(b);
  });
  card.append(opts);

  if (reveal) {
    if (graded) {
      const ok = S.picked === key[0];
      card.prepend(h("p", { class: "verdict " + (ok ? "good" : "bad"), text: ok ? "Dobrze!" : "Nie tym razem. Prawidłowa: " + L[S.order.indexOf(key[0])] + "." }));
    }
    if (key && key[2]) {
      card.append(h("div", { class: "explain" },
        h("span", { class: "h", text: "Wyjaśnienie" }), h("p", { text: key[2] }),
        h("p", { class: "small", text: key[1] ? "Klucz opracowany przez AI (Claude) – nie jest to oficjalny klucz CEM." : "Klucz opracowany przez AI (Claude) – nie jest to oficjalny klucz CEM." })));
      if (!key[1] && key[3]) card.append(unsureBox(key));
    } else if (!graded) {
      card.append(h("p", { class: "small", text: "Klucz do tego pytania jest w przygotowaniu." }));
    }
  }

  const starred = store.bm.includes(id);
  const actions = h("div", { class: "actions" },
    h("button", { class: "star", type: "button", "aria-pressed": String(starred), onclick: () => toggleStar(id), text: starred ? "★ Zapisane" : "☆ Zapisz" }));
  if (reveal) {
    actions.append(h("button", { class: "btn", type: "button", id: "next", onclick: next, text: S.i + 1 < S.list.length ? "Dalej" : (isExam ? "Zobacz wynik" : "Koniec") }));
  } else if (S.kind === "browse") {
    actions.append(h("button", { class: "btn ghost", type: "button", onclick: next, text: "Pomiń" }));
  }
  const hint = h("p", { class: "kbd", text: "Na klawiaturze: A–E lub 1–5 wybiera odpowiedź, Enter – dalej." });
  return h("div", { style: "display:grid;gap:16px" }, topBar(), head, bar, card, actions, hint);
}
function pick(orig) {
  const id = S.list[S.i];
  if (S.kind === "exam") {
    S.exam.answers.push({ id, picked: orig, order: S.order });
    if (keyed(id)) record(id, orig === KEYS[id][0]);
    next();
    return;
  }
  S.picked = orig;
  if (keyed(id)) record(id, orig === KEYS[id][0]);
  render();
  const n = $("#next"); if (n) n.focus({ preventScroll: true });
}
function next() {
  if (S.i + 1 >= S.list.length) {
    if (S.kind === "exam") {
      const ok = S.exam.answers.filter(a => a.picked === KEYS[a.id][0]).length;
      store.exams.push({ f: S.field, n: S.exam.answers.length, ok, ts: Date.now() }); store.exams = store.exams.slice(-30); save();
      go("result", { field: S.field, exam: S.exam });
    } else if (S.field) go("field", { field: S.field });
    else go("home");
    return;
  }
  S.i++; S.picked = null; S.order = [0, 1, 2, 3, 4];
  render(); window.scrollTo(0, 0);
}
function toggleStar(id) {
  const i = store.bm.indexOf(id);
  if (i >= 0) store.bm.splice(i, 1); else store.bm.push(id);
  save(); render();
}

function viewResult() {
  const ans = S.exam.answers;
  const ok = ans.filter(a => a.picked === KEYS[a.id][0]).length, n = ans.length, p = pct(ok, n);
  const mins = Math.round((Date.now() - S.exam.start) / 60000);
  const f = FIELDS.find(x => x.id === S.field);
  const parts = [topBar(h("button", { class: "back", type: "button", onclick: () => go("field", { field: S.field }), text: "‹ " + f.name })),
    h("section", { class: "panel" },
      h("h1", { text: p >= 56 ? "Zaliczone, " + VOC + "!" : "Jeszcze trochę, " + VOC, style: "font-size:1.6rem" }),
      h("div", { class: "row", style: "align-items:baseline;gap:14px" }, h("span", { class: "big", text: p + "%" }),
        h("span", { class: "small", text: ok + " z " + n + " · próg LEK 56% · " + mins + " min" })),
      h("div", { class: "bar" }, h("i", { class: p >= 56 ? "good" : "bad", style: "width:" + p + "%" }), h("span", { class: "th" })),
      h("div", { class: "row" },
        h("button", { class: "btn", type: "button", onclick: () => startExam(S.field), text: "Nowy mini-egzamin" }),
        h("button", { class: "btn ghost", type: "button", onclick: () => startQuiz("repeat", S.field), text: "Powtórz błędne" })))];
  parts.push(h("h2", { text: "Omówienie", style: "font-size:1.2rem" }));
  ans.forEach((a, i) => {
    const q = BYID[a.id], key = KEYS[a.id], good = a.picked === key[0];
    const d = h("details", { class: "rev" }, h("summary", { text: (i + 1) + ". " + (good ? "✓ " : "✗ ") + q.q.slice(0, 90) + (q.q.length > 90 ? "…" : "") }));
    const body = h("div", { style: "display:grid;gap:10px" }, h("div", { class: "qtext", html: rich(q.q) }));
    const opts = h("div", { class: "opts" });
    a.order.forEach((orig, pos) => {
      const b = h("div", { class: "opt" + (orig === key[0] ? " right" : orig === a.picked ? " wrong" : "") },
        h("span", { class: "l", text: L[pos] }), h("span", { class: "t", html: rich(q.a[orig]) }));
      opts.append(b);
    });
    body.append(opts, h("div", { class: "explain" }, h("span", { class: "h", text: "Wyjaśnienie" }), h("p", { text: key[2] })));
    if (!key[1] && key[3]) body.append(unsureBox(key));
    d.append(body);
    parts.push(d);
  });
  return h("div", { style: "display:grid;gap:16px" }, parts);
}

function onKey(e) {
  if (S.view !== "quiz" || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.activeElement && document.activeElement.tagName === "INPUT") return;
  const k = e.key.toUpperCase();
  let pos = L.indexOf(k); if (pos < 0 && /^[1-5]$/.test(k)) pos = Number(k) - 1;
  if (pos >= 0 && (S.picked == null || S.kind === "exam")) { const b = $("#opt-" + pos); if (b && !b.disabled) { e.preventDefault(); b.click(); } }
  else if (e.key === "Enter") { const n = $("#next"); if (n) { e.preventDefault(); n.click(); } }
}

/* ---------- ustawienia ---------- */
function openSettings() {
  const sheet = $("#sheet"), bd = $("#sheet-backdrop");
  const date = h("input", { type: "date", id: "exam-date", value: store.examDate });
  const code = h("textarea", { id: "backup", readonly: true });
  const restore = h("textarea", { id: "restore", placeholder: "Wklej tu kod z innego urządzenia" });
  const msg = h("p", { class: "small", role: "status" });
  const close = () => { sheet.classList.add("hidden"); bd.classList.add("hidden"); render(); };
  sheet.replaceChildren(
    h("h2", { id: "sheet-title", text: "Ustawienia" }),
    h("label", { class: "field", for: "exam-date" }, "Data egzaminu (do odliczania)", date),
    h("div", { class: "field" }, h("span", { text: "Przenieś postęp na inne urządzenie" }),
      h("p", { class: "small", text: "Postęp zapisuje się tylko w tej przeglądarce. Skopiuj kod i wklej go na iPadzie lub telefonie." }),
      h("div", { class: "row" },
        h("button", { class: "btn ghost", type: "button", onclick: async () => {
          code.value = btoa(unescape(encodeURIComponent(JSON.stringify(store))));
          try { await navigator.clipboard.writeText(code.value); msg.textContent = "Kod skopiowany do schowka."; }
          catch (e) { code.select(); msg.textContent = "Zaznacz kod poniżej i skopiuj go ręcznie."; }
        }, text: "Utwórz kod" })), code,
      restore,
      h("div", { class: "row" }, h("button", { class: "btn ghost", type: "button", onclick: () => {
        try {
          const p = JSON.parse(decodeURIComponent(escape(atob(restore.value.trim()))));
          if (!p || typeof p.ans !== "object") throw new Error();
          store = Object.assign({ ans: {}, bm: [], days: {}, exams: [], examDate: DEFAULT_EXAM }, p); save();
          msg.textContent = "Postęp wczytany.";
        } catch (e) { msg.textContent = "To nie wygląda na poprawny kod. Skopiuj go jeszcze raz w całości."; }
      }, text: "Wczytaj kod" })), msg),
    h("div", { class: "row" },
      h("button", { class: "btn", type: "button", onclick: () => { if (date.value) { store.examDate = date.value; save(); } close(); }, text: "Zapisz i zamknij" }),
      h("button", { class: "btn ghost", type: "button", onclick: close, text: "Anuluj" })),
    h("p", { class: "small", text: canStore ? "" : "Ta przeglądarka nie pozwala zapisywać postępu (np. tryb prywatny)." }));
  sheet.classList.remove("hidden"); bd.classList.remove("hidden");
  bd.onclick = close;
  date.focus();
}

function foot() {
  return h("footer", { class: "foot" },
    h("p", { text: "Pytania pochodzą z oficjalnej bazy pytań LEK Centrum Egzaminów Medycznych (cem.edu.pl). Baza CEM nie zawiera poprawnych odpowiedzi – klucz i wyjaśnienia opracował Claude (AI) i nie są oficjalnym kluczem CEM. Przy wątpliwościach sprawdzaj w podręczniku z wykazu literatury CEM." }),
    h("p", { text: "Postęp zapisuje się w tej przeglądarce. Zrobione z myślą o Gosi ♥" }));
}

boot();
