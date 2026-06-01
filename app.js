"use strict";

/* ============================================================
   保護者懇談会 日程調整 — モック
   - 保護者: 希望枠を○でタップ → 送信(localStorage保存)
   - 教員: 提出一覧 / 最大マッチングで重複なし自動割り当て / デモ投入
   ============================================================ */

const STORAGE_KEY = "kondankai_mock_v1";

const DEFAULT_CONFIG = {
  school: "名古屋市立富田高等学校",
  className: "３年４組",
  teacher: "青松 政宏",
  deadline: "６月１５日（月）",
  dates: ["7月10日(金)", "7月13日(月)", "7月14日(火)", "7月15日(水)", "7月16日(木)"],
  times: ["13:00","13:25","13:50","14:15","14:40","15:05","15:30","15:55","16:20","16:45","17:10"],
};

/* ---------- 状態管理 ---------- */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      s.config = Object.assign({}, DEFAULT_CONFIG, s.config || {});
      s.submissions = s.submissions || [];
      return s;
    }
  } catch (e) { /* ignore corrupt data */ }
  return { config: structuredClone(DEFAULT_CONFIG), submissions: [], assignment: null };
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

let state = loadState();

// 保護者画面で編集中の選択 (Set of "d_t")
let draftSel = new Set();
let editingId = null; // 既存提出を編集中のID

const $ = (id) => document.getElementById(id);
const slotKey = (d, t) => `${d}_${t}`;

/* ============================================================
   ビュー切替
   ============================================================ */
$("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("is-active", b === btn));
  const view = btn.dataset.view;
  $("view-parent").classList.toggle("is-active", view === "parent");
  $("view-teacher").classList.toggle("is-active", view === "teacher");
  if (view === "teacher") renderTeacher();
});

/* ============================================================
   保護者画面
   ============================================================ */
function renderParentHeader() {
  const c = state.config;
  $("barSchool").textContent = c.school;
  $("p-title").textContent = `${c.className} 保護者懇談会 日程希望調査`;
  $("p-deadline").textContent = `提出期限：${c.deadline} まで`;
}

function buildSlotGrid(tableEl, { interactive }) {
  const c = state.config;
  let html = "<thead><tr><th class='corner'></th>";
  c.times.forEach(t => { html += `<th>${t}</th>`; });
  html += "</tr></thead><tbody>";
  c.dates.forEach((d, di) => {
    html += `<tr><th class="daycell" data-day="${di}">${d}</th>`;
    c.times.forEach((t, ti) => {
      const key = slotKey(di, ti);
      const on = interactive && draftSel.has(key) ? " on" : "";
      html += `<td class="slot${on}" data-key="${key}"></td>`;
    });
    html += "</tr>";
  });
  html += "</tbody>";
  tableEl.innerHTML = html;
}

function renderParentGrid() {
  buildSlotGrid($("p-grid"), { interactive: true });
  updateCount();
}

function updateCount() { $("p-count").textContent = `選択中: ${draftSel.size} 枠`; }

$("p-grid").addEventListener("click", (e) => {
  const cell = e.target.closest("td.slot");
  if (cell) {
    const key = cell.dataset.key;
    if (draftSel.has(key)) { draftSel.delete(key); cell.classList.remove("on"); }
    else { draftSel.add(key); cell.classList.add("on"); }
    updateCount();
    return;
  }
  const day = e.target.closest(".daycell");
  if (day) {
    const di = Number(day.dataset.day);
    const keys = state.config.times.map((_, ti) => slotKey(di, ti));
    const allOn = keys.every(k => draftSel.has(k));
    keys.forEach(k => { allOn ? draftSel.delete(k) : draftSel.add(k); });
    renderParentGrid();
  }
});

$("p-submit").addEventListener("click", () => {
  const number = $("f-number").value.trim();
  const student = $("f-student").value.trim();
  const parent = $("f-parent").value.trim();
  const msg = $("p-msg");

  if (!number || !student) {
    msg.textContent = "出席番号と生徒氏名を入力してください。";
    msg.className = "submit-msg err"; return;
  }
  if (draftSel.size === 0) {
    msg.textContent = "希望枠を1つ以上選択してください。";
    msg.className = "submit-msg err"; return;
  }

  const availability = [...draftSel];
  if (editingId) {
    const sub = state.submissions.find(s => s.id === editingId);
    Object.assign(sub, { number, student, parent, availability, updatedAt: Date.now() });
  } else {
    // 同じ出席番号があれば上書き
    const existing = state.submissions.find(s => s.number === number);
    if (existing) {
      Object.assign(existing, { student, parent, availability, updatedAt: Date.now() });
      editingId = existing.id;
    } else {
      state.submissions.push({
        id: "p" + Date.now() + Math.random().toString(36).slice(2, 6),
        number, student, parent, availability, submittedAt: Date.now(),
      });
    }
  }
  state.assignment = null; // 提出が変わったら割り当てはリセット
  saveState();
  msg.textContent = `「${student}」さんの希望（${availability.length}枠）を受け付けました。ありがとうございました。`;
  msg.className = "submit-msg ok";
});

$("p-load").addEventListener("click", () => {
  const number = $("f-number").value.trim();
  const msg = $("p-msg");
  if (!number) { msg.textContent = "出席番号を入力してから呼び出してください。"; msg.className = "submit-msg err"; return; }
  const sub = state.submissions.find(s => s.number === number);
  if (!sub) { msg.textContent = "その出席番号の提出データはありません。"; msg.className = "submit-msg err"; return; }
  editingId = sub.id;
  $("f-student").value = sub.student;
  $("f-parent").value = sub.parent || "";
  draftSel = new Set(sub.availability);
  renderParentGrid();
  msg.textContent = `「${sub.student}」さんの入力済みデータを読み込みました。修正して再送信できます。`;
  msg.className = "submit-msg ok";
});

/* ============================================================
   教員画面
   ============================================================ */
function renderTeacher() {
  renderTeacherList();
  renderSettings();
  renderResult();
}

function renderTeacherList() {
  const subs = state.submissions;
  $("t-stats").innerHTML = `
    <div class="stat"><div class="num">${subs.length}</div><div class="lbl">提出家庭数</div></div>
    <div class="stat"><div class="num">${state.config.dates.length * state.config.times.length}</div><div class="lbl">総枠数</div></div>
    <div class="stat"><div class="num">${avgChoices(subs)}</div><div class="lbl">平均○数 / 家庭</div></div>`;

  const tbl = $("t-list");
  if (subs.length === 0) {
    tbl.innerHTML = `<tbody><tr><td class="empty">提出データがありません。「デモデータ投入」または保護者入力画面からデータを追加してください。</td></tr></tbody>`;
    return;
  }
  const sorted = [...subs].sort((a, b) => Number(a.number) - Number(b.number));
  let html = `<thead><tr><th class="col-num">番号</th><th>生徒氏名</th><th>保護者氏名</th><th class="col-num">○数</th><th></th></tr></thead><tbody>`;
  sorted.forEach(s => {
    html += `<tr>
      <td class="col-num">${escapeHtml(s.number)}</td>
      <td>${escapeHtml(s.student)}</td>
      <td>${escapeHtml(s.parent || "—")}</td>
      <td class="col-num">${s.availability.length}</td>
      <td><span class="row-del" data-id="${s.id}">削除</span></td>
    </tr>`;
  });
  html += "</tbody>";
  tbl.innerHTML = html;
}

function avgChoices(subs) {
  if (!subs.length) return "0";
  return (subs.reduce((a, s) => a + s.availability.length, 0) / subs.length).toFixed(1);
}

$("t-list").addEventListener("click", (e) => {
  const del = e.target.closest(".row-del");
  if (!del) return;
  state.submissions = state.submissions.filter(s => s.id !== del.dataset.id);
  state.assignment = null;
  saveState();
  renderTeacher();
});

$("t-clear").addEventListener("click", () => {
  if (!state.submissions.length) return;
  if (!confirm("提出データをすべて削除します。よろしいですか？")) return;
  state.submissions = [];
  state.assignment = null;
  saveState();
  renderTeacher();
});

/* ---------- 自動割り当て（最大二部マッチング: Kuhn法） ---------- */
function computeAssignment() {
  const subs = state.submissions;
  // 制約の厳しい家庭（○が少ない）から処理 → 実用上の充足率が安定
  const order = [...subs].sort((a, b) => a.availability.length - b.availability.length);

  const slotToFamily = new Map(); // slotKey -> familyId

  function tryAssign(fam, visited) {
    for (const key of fam.availability) {
      if (visited.has(key)) continue;
      visited.add(key);
      const occupant = slotToFamily.get(key);
      if (occupant === undefined || tryAssign(famById(occupant), visited)) {
        slotToFamily.set(key, fam.id);
        return true;
      }
    }
    return false;
  }
  const byId = new Map(subs.map(s => [s.id, s]));
  function famById(id) { return byId.get(id); }

  order.forEach(fam => tryAssign(fam, new Set()));

  // familyId -> slotKey に反転
  const familyToSlot = {};
  for (const [key, fid] of slotToFamily) familyToSlot[fid] = key;
  return familyToSlot;
}

$("t-assign").addEventListener("click", () => {
  if (!state.submissions.length) { alert("提出データがありません。"); return; }
  state.assignment = computeAssignment();
  saveState();
  renderResult();
});

function renderResult() {
  const summary = $("t-assign-summary");
  const grid = $("t-result");
  const unassignedBox = $("t-unassigned");
  const assignment = state.assignment;

  if (!assignment) {
    summary.innerHTML = "";
    grid.innerHTML = `<tbody><tr><td class="empty">「重複なしで自動割り当て」を押すと結果がここに表示されます。</td></tr></tbody>`;
    unassignedBox.innerHTML = "";
    return;
  }

  const c = state.config;
  const byId = new Map(state.submissions.map(s => [s.id, s]));
  const assignedIds = new Set(Object.keys(assignment));
  const total = state.submissions.length;
  const assignedCount = assignedIds.size;
  const unassigned = state.submissions.filter(s => !assignedIds.has(s.id))
    .sort((a, b) => Number(a.number) - Number(b.number));

  summary.innerHTML = `
    <span class="pill">提出 <b>${total}</b> 家庭</span>
    <span class="pill">割当成功 <b>${assignedCount}</b> 家庭</span>
    <span class="pill">未割当 <b>${unassigned.length}</b> 家庭</span>`;

  // slotKey -> family
  const slotMap = {};
  for (const [fid, key] of Object.entries(assignment)) slotMap[key] = byId.get(fid);

  let html = "<thead><tr><th class='corner'></th>";
  c.times.forEach(t => { html += `<th>${t}</th>`; });
  html += "</tr></thead><tbody>";
  c.dates.forEach((d, di) => {
    html += `<tr><th class="daycell" style="cursor:default">${d}</th>`;
    c.times.forEach((_, ti) => {
      const fam = slotMap[slotKey(di, ti)];
      if (fam) {
        html += `<td class="cell filled"><div>${escapeHtml(fam.student)}</div><div class="who-no">No.${escapeHtml(fam.number)}</div></td>`;
      } else {
        html += `<td class="cell"></td>`;
      }
    });
    html += "</tr>";
  });
  html += "</tbody>";
  grid.innerHTML = html;

  if (unassigned.length) {
    unassignedBox.innerHTML = `<div class="unassigned-box">
      <h3>未割当の家庭（希望枠が他家庭と競合）</h3>
      <ul>${unassigned.map(s => `<li>No.${escapeHtml(s.number)} ${escapeHtml(s.student)}（○ ${s.availability.length}枠）</li>`).join("")}</ul>
    </div>`;
  } else {
    unassignedBox.innerHTML = `<div class="unassigned-box" style="background:#f0fdf4;border-color:#bbf7d0;">
      <h3 style="color:#15803d;">全家庭の割り当てに成功しました 🎉</h3></div>`;
  }
}

/* ============================================================
   設定
   ============================================================ */
$("t-settings-toggle").addEventListener("click", () => {
  const body = $("t-settings-body");
  const card = body.closest(".collapsible");
  const willOpen = body.hidden;
  body.hidden = !willOpen;
  card.classList.toggle("open", willOpen);
});

function renderSettings() {
  const c = state.config;
  $("s-school").value = c.school;
  $("s-class").value = c.className;
  $("s-teacher").value = c.teacher;
  $("s-deadline").value = c.deadline;
  $("s-dates").value = c.dates.join("\n");
  $("s-times").value = c.times.join("\n");
}

$("s-save").addEventListener("click", () => {
  const dates = $("s-dates").value.split("\n").map(x => x.trim()).filter(Boolean);
  const times = $("s-times").value.split("\n").map(x => x.trim()).filter(Boolean);
  if (!dates.length || !times.length) { alert("日付・時間枠を1つ以上入力してください。"); return; }
  state.config = {
    school: $("s-school").value.trim() || DEFAULT_CONFIG.school,
    className: $("s-class").value.trim() || DEFAULT_CONFIG.className,
    teacher: $("s-teacher").value.trim() || DEFAULT_CONFIG.teacher,
    deadline: $("s-deadline").value.trim() || DEFAULT_CONFIG.deadline,
    dates, times,
  };
  state.assignment = null;
  saveState();
  renderParentHeader();
  renderTeacher();
  alert("設定を保存しました。");
});

$("s-reset").addEventListener("click", () => {
  if (!confirm("枠の設定を既定値に戻します。よろしいですか？")) return;
  state.config = structuredClone(DEFAULT_CONFIG);
  state.assignment = null;
  saveState();
  renderParentHeader();
  renderTeacher();
});

/* ============================================================
   デモデータ投入（40家庭・各家庭が複数○）
   ============================================================ */
const DEMO_SURNAMES = ["佐藤","鈴木","高橋","田中","伊藤","渡辺","山本","中村","小林","加藤","吉田","山田","佐々木","山口","松本","井上","木村","林","清水","斎藤","森","池田","橋本","石川","前田","藤田","小川","岡田","後藤","長谷川","村上","近藤","坂本","遠藤","青木","西村","福田","太田","三浦","岡本"];
const DEMO_GIVEN = ["大翔","蓮","陽斗","湊","樹","悠真","結菜","陽菜","葵","凛","結衣","莉子","美咲","颯太","健太","彩花","奈々","拓海","海斗","千尋"];

function randInt(n) { return Math.floor(Math.random() * n); }
function pick(arr) { return arr[randInt(arr.length)]; }

function generateDemo() {
  const c = state.config;
  const D = c.dates.length, T = c.times.length;
  const subs = [];
  const usedSurname = new Set();

  for (let i = 0; i < 40; i++) {
    const sel = new Set();
    const pattern = Math.random();

    if (pattern < 0.35) {
      // 「この日は全部○」タイプ: 1〜2日まるごと + 端数
      const dayCount = 1 + randInt(2);
      const days = shuffle([...Array(D).keys()]).slice(0, dayCount);
      days.forEach(d => { for (let t = 0; t < T; t++) sel.add(slotKey(d, t)); });
    } else if (pattern < 0.7) {
      // 午前 or 午後など連続ブロックを複数日
      const dayCount = 1 + randInt(3);
      const days = shuffle([...Array(D).keys()]).slice(0, dayCount);
      days.forEach(d => {
        const start = randInt(Math.max(1, T - 4));
        const len = 3 + randInt(4);
        for (let t = start; t < Math.min(T, start + len); t++) sel.add(slotKey(d, t));
      });
    } else {
      // 散発的にあちこち○（5〜12枠）
      const count = 5 + randInt(8);
      while (sel.size < count) sel.add(slotKey(randInt(D), randInt(T)));
    }
    if (sel.size === 0) sel.add(slotKey(randInt(D), randInt(T)));

    let surname = pick(DEMO_SURNAMES);
    let guard = 0;
    while (usedSurname.has(surname) && guard++ < 50) surname = pick(DEMO_SURNAMES);
    usedSurname.add(surname);

    subs.push({
      id: "demo" + i + Math.random().toString(36).slice(2, 6),
      number: String(i + 1),
      student: `${surname} ${pick(DEMO_GIVEN)}`,
      parent: `${surname} ${pick(DEMO_GIVEN)}`,
      availability: [...sel],
      submittedAt: Date.now() - randInt(86400000),
    });
  }
  return subs;
}

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

$("t-demo").addEventListener("click", () => {
  if (state.submissions.length && !confirm("既存の提出データを置き換えて、デモ用の40家庭分を生成します。よろしいですか？")) return;
  state.submissions = generateDemo();
  state.assignment = null;
  saveState();
  renderTeacher();
});

/* ============================================================
   ユーティリティ / 初期化
   ============================================================ */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

renderParentHeader();
renderParentGrid();
