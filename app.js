'use strict';

/* =========================================================
 * 塾講師アシスタント（重複ゼロ・ToDo片付け・月間目標・単元カスタマイズ完全対応版）
 *  1. 月間目標を1箇所に統合（期間枠の自由な追加・編集・削除・今月指定に対応）
 *  2. 「次にやること（ToDo）」の片付け機能（完了分をカルテへ自動転記して片付け ／ 一括削除）
 *  3. 単元マップの1タップ理解度ピッカー（5回連打不要・今日の日付へ自動更新・マップから直接ToDo追加）
 *  4. 次回授業日時と「次にやること（ToDo）」の完全連動（Googleカレンダー登録・＋1週間送り）
 *  5. 学年（中1〜高3）・教科・単元の自由な追加・削除対応
 * ========================================================= */

const STORE_KEY = 'juku_assist_v1';

const BASE_CURRICULUM = {
  '中1': {
    数学: ['正負の数', '文字と式', '一次方程式', '比例と反比例', '平面図形', '空間図形', 'データの活用'],
    英語: ['be動詞', '一般動詞', '複数形', '代名詞', '疑問詞', '現在進行形', '助動詞can', '過去形'],
    理科: ['植物の分類', '身のまわりの物質', '光・音・力', '大地の変化'],
    社会: ['世界地理', '日本地理', '古代〜中世']
  },
  '中2': {
    数学: ['式の計算', '連立方程式', '一次関数', '平行と合同', '三角形と四角形', '確率', '箱ひげ図'],
    英語: ['過去進行形', '未来表現', '助動詞', '不定詞', '動名詞', '接続詞', '比較', '受け身'],
    理科: ['化学変化と原子・分子', '生物のからだ', '電流と磁界', '天気の変化'],
    社会: ['近世', '近代', '日本地理（地方別）']
  },
  '中3': {
    数学: ['式の展開', '因数分解', '平方根', '二次方程式', '関数y=ax²', '相似な図形', '円周角', '三平方の定理', '標本調査'],
    英語: ['副詞・形容詞（頻度・程度・様態）', '前置詞（at/on/in/for/during）', '現在完了', '現在完了進行形', '後置修飾', '関係代名詞', '間接疑問', '仮定法'],
    理科: ['化学変化とイオン', '生命の連続性', '運動とエネルギー', '地球と宇宙'],
    社会: ['現代史', '公民（政治）', '公民（経済）']
  },
  '高1': {
    数学I: ['数と式', '集合と命題', '2次関数', '図形と計量（三角比）', 'データの分析'],
    数学A: ['場合の数と確率', '図形の性質', '整数の性質'],
    英語: ['文型・時制', '助動詞・態', '不定詞・動名詞', '分詞', '関係詞', '比較・仮定法']
  },
  '高2': {
    数学II: ['式と証明', '複素数と方程式', '図形と方程式', '三角関数', '指数関数・対数関数', '微分法', '積分法'],
    数学B: ['数列', '統計的な推測'],
    英語: ['時制', '助動詞', '仮定法', '関係詞', '分詞構文', '比較', '長文読解'],
    化学: ['物質の状態', '化学平衡', '無機物質', '有機化合物']
  },
  '高3': {
    数学III・C: ['ベクトル', '複素数平面', '式と曲線', '極限', '微分法（数III）', '積分法（数III）'],
    英語: ['長文精読・速読', '英作文・和文英訳', 'リスニング・共通テスト対策', '過去問演習'],
    共通テスト・過去問: ['数学I・A実戦', '数学II・B・C実戦', '英語リーディング実戦', '理科・社会実戦']
  }
};

const MIDDLE = ['中1', '中2', '中3'];
const HIGH = ['高1', '高2', '高3'];
const LEVEL_LABEL = ['未', '×', '△', '○', '◎'];
const LEVEL_DESC = ['未習', '× 要復習', '△ もう少し', '○ 定着', '◎ 完璧'];

/* ---------------- 汎用ヘルパー ---------------- */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgoStr(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysToDateStr(dateStr, addDays) {
  const base = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
  if (isNaN(base.getTime())) return today();
  base.setDate(base.getDate() + addDays);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
}

function toast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ---------------- 状態管理 ---------------- */
function freshState() {
  return {
    initialized: false,
    students: [],
    progress: {},
    manualReviews: {},
    schedules: [],
    driveDocs: {},
    examPlans: {},
    customUnits: [],
    deletedUnitKeys: [],
    privacyMode: false,
    updatedAt: 0
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.students)) {
        const stObj = { ...freshState(), ...s, initialized: true };
        delete stObj.nextTodos;
        delete stObj.nextLessons;
        delete stObj.logs;
        if (!stObj.manualReviews) stObj.manualReviews = {};
        if (!Array.isArray(stObj.schedules)) stObj.schedules = [];
        if (!stObj.driveDocs) stObj.driveDocs = {};
        if (!stObj.examPlans) stObj.examPlans = {};
        if (!Array.isArray(stObj.customUnits)) stObj.customUnits = [];
        if (!Array.isArray(stObj.deletedUnitKeys)) stObj.deletedUnitKeys = [];
        return stObj;
      }
    }
  } catch (e) { /* ignore */ }
  return freshState();
}

let state = load();
let currentUnitFilter = 'current';
let currentSubjFilter = 'all';
let activeDocTabByStudent = {};
let selectedPickerUnitKey = null;

// カレンダーページ用の表示・編集状態
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calSelectedDate = today();
let calStudentFilter = 'active'; // 'active' | 'all'
let editingScheduleId = null;

// カレンダー予定追加フォームの入力保持 ＆ 授業時間配分ビルダー状態
let calDraftForm = {
  time: '17:00',
  duration: 100,
  unit: '',
  memo: ''
};
let calTimeBlocks = [
  { id: 'tb_1', minutes: 15, label: '宿題確認・8日経過単元の復習' },
  { id: 'tb_2', minutes: 45, label: 'メイン単元の解説・基本例題' },
  { id: 'tb_3', minutes: 30, label: '問題演習・類題チェック' },
  { id: 'tb_4', minutes: 10, label: 'まとめ・次回宿題指定' }
];

function save() {
  state.initialized = true;
  state.updatedAt = Date.now();
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) { /* ignore */ }
}

const getStudent = (id) => state.students.find((s) => s.id === id);

/* ---------------- カリキュラム＆カスタム単元構築 ---------------- */
function getMergedCurriculum() {
  const merged = JSON.parse(JSON.stringify(BASE_CURRICULUM));
  const deletedSet = new Set(state.deletedUnitKeys || []);

  // カスタム追加単元を反映
  (state.customUnits || []).forEach(({ grade, subject, unit }) => {
    if (!grade || !subject || !unit) return;
    merged[grade] ||= {};
    merged[grade][subject] ||= [];
    if (!merged[grade][subject].includes(unit)) {
      merged[grade][subject].push(unit);
    }
  });

  // 削除済み単元を除外
  Object.keys(merged).forEach((g) => {
    Object.keys(merged[g]).forEach((subj) => {
      merged[g][subj] = merged[g][subj].filter((u) => !deletedSet.has(`${g}|${subj}|${u}`));
      if (merged[g][subj].length === 0) {
        delete merged[g][subj];
      }
    });
  });

  return merged;
}

function gradesFor(grade) {
  const mIdx = MIDDLE.indexOf(grade);
  if (mIdx >= 0) return MIDDLE.slice(0, mIdx + 1);
  const hIdx = HIGH.indexOf(grade);
  if (hIdx >= 0) return HIGH.slice(0, hIdx + 1);
  return [grade];
}

function unitsFor(grade, includeAllGrades = false) {
  const merged = getMergedCurriculum();
  const targetGrades = includeAllGrades ? Object.keys(merged) : gradesFor(grade);
  const out = [];
  targetGrades.forEach((g) => {
    Object.entries(merged[g] || {}).forEach(([subject, units]) => {
      units.forEach((unit) => out.push({ grade: g, subject, unit, key: `${g}|${subject}|${unit}` }));
    });
  });
  return out;
}

function getProg(sid, key) {
  return state.progress[sid]?.[key] || { level: 0, lastDate: null };
}

// 理解度変更時は常に最終学習日（lastDate）も最新日に更新する（未習に戻したときのみ日付クリア）
function setLevel(sid, key, level, customDate) {
  state.progress[sid] ||= {};
  state.progress[sid][key] = {
    level,
    lastDate: level === 0 ? null : (customDate || today())
  };
}

function getUnitLastDate(sid, key) {
  return getProg(sid, key).lastDate || null;
}

function getDaysElapsed(sid, key) {
  const last = getUnitLastDate(sid, key);
  if (!last) return null;
  const t0 = new Date(`${last}T00:00:00`);
  const t1 = new Date(`${today()}T00:00:00`);
  return Math.max(0, Math.round((t1 - t0) / 86400000));
}

function isUnitSpacedDue(sid, key) {
  const lv = getProg(sid, key).level;
  if (lv === 0) return false;
  const days = getDaysElapsed(sid, key);
  return (days === null ? 10 : days) >= 8;
}

/* ---------------- カルテ専用タブ名（振り返り記録・次回計画・目標＆やること） ---------------- */
const TAB_REFLECTION = '✍️ 振り返り記録';
const TAB_NEXT_PLAN = '📅 次回計画';
const TAB_GOAL_TODO = '🎯 目標・やること';

/* ---------------- 生徒ごとの普遍的（汎用）カルテ初期テンプレート ---------------- */
function defaultCarteForStudent(st) {
  const name = st?.name || '生徒';
  const grade = st?.grade || '中3';
  const textbook = st?.memo || (HIGH.includes(grade) ? '学校教材・標準問題集' : '標準ワーク・必修テキスト');
  return {
    ownerStudentId: st?.id || '',
    docTitle: `${name}（${grade}）専用カルテ`,
    textbook,
    tabs: {
      [TAB_REFLECTION]: `【${name}（${grade}）振り返り記録】\n・授業で扱った単元、理解度、指導上の気づきをここに記録します。`,
      [TAB_NEXT_PLAN]: `【${name}（${grade}）次回計画】\n・前半：8日以上経過単元の復習＆宿題確認\n・メイン：単元の基本手順・演習\n・後半：次回までの宿題指定`
    }
  };
}

/* ---------------- 学年別の普遍的「目標・やること」テンプレート（A×Cハイブリッド統合版） ---------------- */
function defaultExamPlanForStudent(st) {
  if (!st) return null;
  const g = st.grade || '中3';
  const presets = {
    '高3': {
      goalTitle: '共通テスト・一般入試本番',
      goalDate: '2027-01-16',
      todos: [
        '単元マップの「×・△」単元の基本例題を解き直す',
        '過去問・模試の時間配分と目標得点ラインを確認する'
      ]
    },
    '高1': {
      goalTitle: '高1 定期テスト目標達成',
      goalDate: '2027-03-01',
      todos: [
        'テスト範囲の基本ワーク・例題を1周仕上げる',
        '単元マップの「×・△」単元を解き直して「○」にする'
      ]
    },
    '中1': {
      goalTitle: `${g} 定期テスト目標達成`,
      goalDate: '2027-02-25',
      todos: [
        'テスト範囲の学校ワーク・必修テキストを仕上げる',
        '単元マップの「×・△」単元を総復習して「○」にする'
      ]
    },
    '中3': {
      goalTitle: '高校入試本番（第一志望合格）',
      goalDate: '2027-03-03',
      todos: [
        '単元マップの「×・△」単元を一掃して「○」以上に引き上げる',
        '頻出分野（関数・図形・重要文法）の実戦演習を固める'
      ]
    }
  };
  const cfg = presets[g] || (g === '高2' ? { ...presets['高1'], goalTitle: '高2 定期テスト ＆ 受験基礎固め' } : presets['中1']);
  return {
    goalTitle: cfg.goalTitle,
    goalDate: cfg.goalDate,
    weeklySessions: 1,
    todos: cfg.todos.map((t) => ({ id: uid(), text: t, done: false }))
  };
}

function displayStudentName(name) {
  if (!state.privacyMode || !name) return name;
  const clean = name.replace(/（.*）/, '').trim();
  const parts = clean.split(/\s+/);
  return parts.length >= 2 ? `${parts[0].charAt(0)}.${parts[1].charAt(0)}.（匿名）` : `${clean.charAt(0)}.（匿名）`;
}

function ensureStandardCarteTabs(st, info) {
  if (!info || !st) return info;
  const defaults = defaultCarteForStudent(st);
  info.ownerStudentId = st.id;
  info.docTitle = `${st.name}（${st.grade}）専用カルテ`;
  info.textbook = st.memo || info.textbook || defaults.textbook;
  st.memo = info.textbook;
  delete info.weakSummary;
  info.tabs ||= {};

  if (info.tabs[TAB_REFLECTION] === undefined) info.tabs[TAB_REFLECTION] = defaults.tabs[TAB_REFLECTION];
  if (info.tabs[TAB_NEXT_PLAN] === undefined) info.tabs[TAB_NEXT_PLAN] = defaults.tabs[TAB_NEXT_PLAN];

  const ordered = {
    [TAB_REFLECTION]: info.tabs[TAB_REFLECTION],
    [TAB_NEXT_PLAN]: info.tabs[TAB_NEXT_PLAN]
  };
  Object.keys(info.tabs).forEach((k) => {
    if (k !== TAB_GOAL_TODO && ordered[k] === undefined) ordered[k] = info.tabs[k];
  });
  info.tabs = ordered;
  return info;
}

/* ---------------- Googleドライブ5生徒の実カルテデータ（初期搭載） ---------------- */
const DRIVE_DOCS_SNAPSHOT = {
  '土岐 芽生': {
    textbook: '新編数学II ／ Study-Upノート ／ 白チャート（または入門問題精講）',
    tabs: {
      [TAB_REFLECTION]: `【振り返り・弱点整理】
・例題の解答の「途中の計算」にピンポイントで焦点を当てる。
・1次関数・2次関数において、xに数字を入れたらyが出てくる対応表（グラフの基礎）の理解。
・連立3元1次方程式の計算（3点を通る円の方程式で必須）。
・i² を「-1を掛ける」ではなく「引き算」と認識してしまう癖に注意。
・「＝」を天秤（左辺と右辺が釣り合う）として意識する。`,
      [TAB_NEXT_PLAN]: `【次回計画】
・テストまで残り5回！雑談を減らし、授業冒頭に「白チャート改題の計算プリント2枚」を実施。
・三角関数をサクッと終わらせて、最後の3回で「加法定理」と「合成」を仕上げる。`,
      'テスト対策': `【テスト対策と振り返り】
目標：50点 ➔ 結果：48点達成！
■ テスト範囲の3段階仕分け（図形と方程式）
・基本問題（9割死守）：練習 1, 3, 4, 5, 6, 8, 9, 10, 12, 13, 14, 15, 17, 19, 20, 21, 26
・ちょい普通：練習 22, 23, 24, 25
・捨てる問題：練習 16, 27, 39, 研究問題`
    }
  },
  '藤田 湊空': {
    textbook: '入試必修Study（100分授業：小テスト15分＋メイン60分＋対策20分）',
    tabs: {
      [TAB_REFLECTION]: `【10/19 英語（100分授業）振り返り】
■ Plan（計画）
・小テスト：15分 ／ 入試必修Study 7「副詞・形容詞」：60分 ／ テスト対策：20分
  - 頻度の副詞（usually, often, sometimes, never, always）
  - 程度の副詞（very, really, extremely）
  - 様態の副詞（fast, well, quickly）
■ Check（反省・気づき）
・100分の時間の使い方を意識する（前半50分で一区切り）。
・to不定詞のコアイメージがまだ曖昧。
・先週やったことを今週やっても短期記憶で解けてしまうため、8日以上経過した単元を復習・宿題に出す。`,
      [TAB_NEXT_PLAN]: `【次回計画】
・冒頭15分：先週分を除外した8日以上経過単元の復習チェック
・メイン60分：「前置詞（at, on, in, for, during, before）」と「接続詞」のコアイメージ指導
・後半20分：定期テスト・入試対策演習`,
      '数学': `【数学】
・入試必修Study 数学の基礎計算と関数・図形の並行演習。
・大問1の計算ミス防止と、時間差での解き直し。`
    }
  },
  '遠藤 快音': {
    textbook: '入試必修Study（100分授業：小テスト15分＋メイン60分＋対策20分）',
    tabs: {
      [TAB_REFLECTION]: `【10/19 英語（100分授業）振り返り】
・頻度(usually/often/sometimes/never/always)、程度(very/really/extremely)、様態(fast/well/quickly)を指導。
・先週やったことを今週テストしても短期記憶で解けてしまうため、期間が空いた単元を復習ピックアップする。`,
      [TAB_NEXT_PLAN]: `【次回計画】
・冒頭15分：8日以上経過した英語・数学単元の復習
・メイン60分：前置詞（at, on, in, for, during, before）と接続詞のコアイメージ
・後半20分：二次方程式・関数 y=ax² の基本パターン定着`
    }
  },
  '藤田 渚岬': {
    textbook: '英語・数学（標準ワーク・なぎさくんカルテ）',
    tabs: {
      [TAB_REFLECTION]: `【なぎさくん（藤田渚岬）振り返り記録】
・英語（不定詞・接続詞）と数学（一次関数・連立方程式）の期間経過後の定着を確認。`,
      [TAB_NEXT_PLAN]: `【次回計画】
・前半15分：8日以上経過した英語・数学の基本復習
・メイン：学校の進度に合わせた一次関数・不定詞の演習`
    }
  },
  '保科 篤輝': {
    textbook: '英語・数学（標準ワーク・あつきくんカルテ）',
    tabs: {
      [TAB_REFLECTION]: `【あつきくん（保科篤輝）振り返り記録】
・英語（不定詞・動名詞・接続詞）の語順整理と、数学の連立方程式・一次関数の途中計算を重点確認。`,
      [TAB_NEXT_PLAN]: `【次回計画】
・前半15分：8日以上経過した単元の復習チェック
・メイン：苦手単元のピンポイント演習と宿題確認`
    }
  }
};

function getDriveInfoForStudent(st) {
  if (!st) return null;
  state.driveDocs ||= {};
  const existing = state.driveDocs[st.id];
  if (existing && existing.ownerStudentId === st.id) {
    return ensureStandardCarteTabs(st, existing);
  }
  const snapKey = Object.keys(DRIVE_DOCS_SNAPSHOT).find((k) => st.name && st.name.includes(k));
  if (snapKey) {
    const snap = DRIVE_DOCS_SNAPSHOT[snapKey];
    const doc = {
      ownerStudentId: st.id,
      docTitle: `${st.name}（${st.grade}）専用カルテ`,
      textbook: snap.textbook || st.memo,
      tabs: JSON.parse(JSON.stringify(snap.tabs))
    };
    state.driveDocs[st.id] = ensureStandardCarteTabs(st, doc);
    save();
    return state.driveDocs[st.id];
  }
  state.driveDocs[st.id] = ensureStandardCarteTabs(st, defaultCarteForStudent(st));
  save();
  return state.driveDocs[st.id];
}

function getExamPlanForStudent(st) {
  if (!st) return null;
  state.examPlans ||= {};
  let plan = state.examPlans[st.id];
  if (!plan) {
    plan = defaultExamPlanForStudent(st);
    state.examPlans[st.id] = plan;
    save();
    return plan;
  }
  if (!Array.isArray(plan.todos)) {
    if (Array.isArray(plan.phases)) {
      const curPhase = plan.phases.find((p) => p.isCurrent) || plan.phases[0];
      plan.todos = Array.isArray(curPhase?.tasks)
        ? curPhase.tasks.map((t) => ({ id: t.id || uid(), text: t.text, done: Boolean(t.done) }))
        : [];
      delete plan.phases;
    } else {
      plan.todos = defaultExamPlanForStudent(st).todos;
    }
    save();
  }
  return plan;
}

// もし汎用サンプル（st_sample_1 / st_sample_2）のみが入っている場合は5生徒の実データへ自動アップグレード
function upgradeSampleStudentsIfNeeded() {
  if (!Array.isArray(state.students) || state.students.length === 0) return false;
  const onlyGenericSample = state.students.every((s) => s.id === 'st_sample_1' || s.id === 'st_sample_2');
  if (onlyGenericSample) {
    loadDefaultGenericStudents(true);
    return true;
  }
  return false;
}

/* ---------------- 初期生徒データ（5名の担当生徒カルテ・進捗・予定） ---------------- */
function loadDefaultGenericStudents(silent = false) {
  state.students = [];
  state.progress = {};
  state.manualReviews = {};
  state.schedules = [];
  state.driveDocs = {};
  state.examPlans = {};

  const sToki = { id: 'st_toki', name: '土岐 芽生', grade: '高2', memo: '新編数学II ／ Study-Upノート ／ 白チャート' };
  const sSora = { id: 'st_sora', name: '藤田 湊空', grade: '中3', memo: '入試必修Study（英語・数学）' };
  const sKaine = { id: 'st_kaine', name: '遠藤 快音', grade: '中3', memo: '入試必修Study（英語・数学）' };
  const sNagisa = { id: 'st_nagisa', name: '藤田 渚岬', grade: '中2', memo: '英語・数学（標準ワーク）' };
  const sAtsuki = { id: 'st_atsuki', name: '保科 篤輝', grade: '中2', memo: '英語・数学（標準ワーク）' };

  state.students.push(sToki, sSora, sKaine, sNagisa, sAtsuki);
  state.currentStudentId = sToki.id;

  // 土岐 芽生 さん（高2・数学II）
  setLevel(sToki.id, '高2|数学II|式と証明', 3, daysAgoStr(28));
  setLevel(sToki.id, '高2|数学II|複素数と方程式', 2, daysAgoStr(20));
  setLevel(sToki.id, '高2|数学II|図形と方程式', 2, daysAgoStr(14));
  setLevel(sToki.id, '高2|数学II|三角関数', 1, daysAgoStr(9));

  // 藤田 湊空 くん & 遠藤 快音 くん（中3）
  [sSora, sKaine].forEach((st) => {
    setLevel(st.id, '中3|英語|現在完了', 2, daysAgoStr(12));
    setLevel(st.id, '中3|英語|後置修飾', 1, daysAgoStr(15));
    setLevel(st.id, '中3|英語|関係代名詞', 1, daysAgoStr(9));
    setLevel(st.id, '中2|英語|不定詞', 2, daysAgoStr(21));
    setLevel(st.id, '中2|英語|接続詞', 2, daysAgoStr(16));
    setLevel(st.id, '中3|数学|因数分解', 3, daysAgoStr(20));
    setLevel(st.id, '中3|数学|平方根', 2, daysAgoStr(15));
    setLevel(st.id, '中3|数学|二次方程式', 2, daysAgoStr(10));
    setLevel(st.id, '中3|数学|関数y=ax²', 1, daysAgoStr(6));
  });

  // 藤田 渚岬 くん & 保科 篤輝 くん（中2）
  [sNagisa, sAtsuki].forEach((st) => {
    setLevel(st.id, '中2|英語|不定詞', 2, daysAgoStr(14));
    setLevel(st.id, '中2|英語|動名詞', 2, daysAgoStr(10));
    setLevel(st.id, '中2|英語|接続詞', 1, daysAgoStr(16));
    setLevel(st.id, '中2|数学|連立方程式', 3, daysAgoStr(18));
    setLevel(st.id, '中2|数学|一次関数', 2, daysAgoStr(9));
  });

  state.schedules = [
    {
      id: 'sched_init_1',
      studentId: sToki.id,
      date: addDaysToDateStr(today(), 1),
      time: '18:00',
      duration: 100,
      unitKey: '高2|数学II|三角関数',
      memo: '・18:00〜18:15（15分）：白チャート改題の計算プリント2枚\n・18:15〜19:00（45分）：三角関数の基本公式・加法定理\n・19:00〜19:30（30分）：問題演習\n・19:30〜19:40（10分）：まとめ・宿題指定',
      done: false
    },
    {
      id: 'sched_init_2',
      studentId: sSora.id,
      date: addDaysToDateStr(today(), 2),
      time: '17:00',
      duration: 100,
      unitKey: '中3|英語|前置詞（at/on/in/for/during）',
      memo: '・17:00〜17:15（15分）：8日以上経過単元の小テスト\n・17:15〜18:15（60分）：前置詞・接続詞のコアイメージ指導\n・18:15〜18:40（25分）：テスト対策演習',
      done: false
    },
    {
      id: 'sched_init_3',
      studentId: sNagisa.id,
      date: addDaysToDateStr(today(), 3),
      time: '19:00',
      duration: 100,
      unitKey: '中2|数学|一次関数',
      memo: '・19:00〜19:15（15分）：8日経過単元の復習\n・19:15〜20:30（75分）：一次関数のグラフと変域\n・20:30〜20:40（10分）：次回宿題確認',
      done: false
    }
  ];

  state.initialized = true;
  state.students.forEach((st) => {
    getDriveInfoForStudent(st);
    getExamPlanForStudent(st);
  });
  save();
  refreshSelects();
  renderAll();
  if (!silent) toast('📥 5生徒（土岐・藤田湊空・遠藤・藤田渚岬・保科）のカルテデータを読み込みました！');
}

/* ---------------- 画面切り替え＆全体描画 ---------------- */
function getActiveStudent() {
  return getStudent(state.currentStudentId) || getStudent($('#global-student')?.value) || state.students[0] || null;
}

function switchActiveStudent(newStudentId) {
  if (!newStudentId || newStudentId === state.currentStudentId) return;
  saveInlineDocEdits(state.currentStudentId);
  state.currentStudentId = newStudentId;
  if ($('#global-student')) $('#global-student').value = newStudentId;
  selectedPickerUnitKey = null;
  save();
  renderAll();
}

function refreshSelects() {
  const sel = $('#global-student');
  if (!sel) return;
  const prev = state.currentStudentId || sel.value;
  sel.innerHTML = state.students.length
    ? state.students.map((s) => `<option value="${s.id}">${esc(displayStudentName(s.name))}（${s.grade}）</option>`).join('')
    : '<option value="">（生徒未登録）</option>';
  if (state.students.some((s) => s.id === prev)) {
    sel.value = prev;
    state.currentStudentId = prev;
  } else if (state.students[0]) {
    sel.value = state.students[0].id;
    state.currentStudentId = state.students[0].id;
  }

  // スマホ用：上部1タップ生徒切り替えピルバーの描画
  const mPills = $('#mobile-student-pills');
  if (mPills) {
    mPills.innerHTML = state.students.map((s) => {
      const isAct = s.id === state.currentStudentId;
      return `<button type="button" class="m-st-pill ${isAct ? 'active' : ''}" data-mst-id="${esc(s.id)}">👤 ${esc(displayStudentName(s.name))}<span style="font-size:11px;opacity:0.85;">(${esc(s.grade)})</span></button>`;
    }).join('') + `<button type="button" class="m-st-pill add-pill" id="btn-mobile-add-student">＋生徒追加</button>`;
  }
}

function showView(name) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  if (name === 'home') renderHome();
  if (name === 'calendar') renderCalendar();
  if (name === 'drive') renderDriveSettings();
}

function renderAll() {
  refreshSelects();
  renderHome();
  renderCalendar();
  renderDriveSettings();
}

/* ---------------- 入試・目標日までの残り日数＆残り授業回数計算 ---------------- */
function calcExamCountdown(plan) {
  const goalDateStr = plan?.goalDate || '2027-03-03';
  const weekly = Math.max(1, Number(plan?.weeklySessions) || 1);
  const t0 = new Date(`${today()}T00:00:00`);
  const t1 = new Date(`${goalDateStr}T00:00:00`);
  const diffDays = Math.max(0, Math.round((t1 - t0) / 86400000));
  const estSessions = Math.max(0, Math.round((diffDays / 7) * weekly));
  return { goalDateStr, weekly, diffDays, estSessions };
}

/* ---------------- 単元文字列（カリキュラム単元キー or 自由記入）ヘルパー ---------------- */
function isCurriculumUnitKey(val) {
  return typeof val === 'string' && val.split('|').length === 3;
}

function formatScheduleUnitDisplay(unitVal, mode = 'full') {
  if (!unitVal) return '';
  if (!isCurriculumUnitKey(unitVal)) return unitVal;
  const [g, subj, u] = unitVal.split('|');
  if (mode === 'chip') return u;
  if (mode === 'short') return `${subj}：${u}`;
  return `${g}｜${subj}：${u}`;
}

function resolveScheduleUnitInput(st, rawInput) {
  const text = (rawInput || '').trim();
  if (!text) return '';
  const allUnits = unitsFor(st?.grade || '中3', true);
  // 1. 「中3｜英語：関係代名詞」や「中3|英語|関係代名詞」形式の完全一致
  const exactFull = allUnits.find(
    (u) => `${u.grade}｜${u.subject}：${u.unit}` === text || u.key === text
  );
  if (exactFull) return exactFull.key;
  // 2. 生徒の現在学年以下の単元で「英語：関係代名詞」または単元名「関係代名詞」が完全一致すれば連動キーに変換
  const scopeUnits = st ? unitsFor(st.grade, false) : allUnits;
  const exactScope = scopeUnits.find(
    (u) => `${u.subject}：${u.unit}` === text || u.unit === text
  );
  if (exactScope) return exactScope.key;
  // 3. それ以外は自由記入テキストとしてそのまま保持
  return text;
}

function buildUnitDatalistOptionsHtml(st) {
  if (!st) return '';
  const allUnits = unitsFor(st.grade, true).sort((a, b) => {
    const inScopeA = a.grade === st.grade ? 0 : 1;
    const inScopeB = b.grade === st.grade ? 0 : 1;
    if (inScopeA !== inScopeB) return inScopeA - inScopeB;
    const dueA = isUnitSpacedDue(st.id, a.key) ? 0 : 1;
    const dueB = isUnitSpacedDue(st.id, b.key) ? 0 : 1;
    if (dueA !== dueB) return dueA - dueB;
    const lvA = getProg(st.id, a.key).level;
    const lvB = getProg(st.id, b.key).level;
    const rank = (lv) => (lv === 1 ? 0 : lv === 2 ? 1 : lv === 0 ? 2 : lv === 3 ? 3 : 4);
    return rank(lvA) - rank(lvB);
  });

  return allUnits.map((u) => {
    const lv = getProg(st.id, u.key).level;
    const isDue = isUnitSpacedDue(st.id, u.key);
    const val = `${u.grade}｜${u.subject}：${u.unit}`;
    const desc = `現在:${LEVEL_LABEL[lv]}${isDue ? ' ⏰8日以上経過' : ''}`;
    return `<option value="${esc(val)}" label="${esc(desc)}"></option>`;
  }).join('');
}

/* ---------------- Googleカレンダー連携ヘルパー ---------------- */
function buildGoogleCalendarUrl(item, st) {
  const studentName = st ? st.name : '生徒';
  const unitLabel = formatScheduleUnitDisplay(item.unitKey, 'short') || '授業・復習';
  const title = `【塾授業】${studentName}さん（${st?.grade || ''}） - ${unitLabel}`;

  const dateClean = (item.date || today()).replace(/-/g, '');
  const timeParts = (item.time || '17:00').split(':');
  const startH = Number(timeParts[0]) || 17;
  const startM = Number(timeParts[1]) || 0;
  const durMin = Number(item.duration) || 100;
  const totalEndMin = startH * 60 + startM + durMin;
  const endH = Math.floor(totalEndMin / 60) % 24;
  const endM = totalEndMin % 60;

  const pad = (n) => String(n).padStart(2, '0');
  const startStr = `${dateClean}T${pad(startH)}${pad(startM)}00`;
  const endStr = `${dateClean}T${pad(endH)}${pad(endM)}00`;

  const driveInfo = st ? getDriveInfoForStudent(st) : null;
  const nextPlan = driveInfo?.tabs?.[TAB_NEXT_PLAN] || '';
  const details = [
    `■ 担当生徒：${studentName}（${st?.grade || ''}）`,
    `■ 予定単元・内容：${formatScheduleUnitDisplay(item.unitKey, 'full') || '未指定'}`,
    item.memo ? `■ 授業予定メモ：\n${item.memo}` : '',
    nextPlan ? `■ カルテの次回計画：\n${nextPlan}` : ''
  ].filter(Boolean).join('\n\n');

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startStr}/${endStr}&details=${encodeURIComponent(details)}`;
}

/* ---------------- 1. 🏠 メイン画面（カルテ［振り返り／次回計画／目標・やること］・復習・直近予定・単元マップ） ---------------- */
let currentCarteSearchQuery = '';

function renderCarteSearchResults(st) {
  const box = $('#carte-search-results');
  if (!box || !st) return;
  const q = (currentCarteSearchQuery || '').trim();
  if (!q) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  const driveInfo = getDriveInfoForStudent(st);
  const examPlan = getExamPlanForStudent(st);
  const qLower = q.toLowerCase();
  const hits = [];

  Object.entries(driveInfo.tabs || {}).forEach(([tabName, content]) => {
    const lines = String(content || '').split('\n');
    lines.forEach((line, idx) => {
      if (line.toLowerCase().includes(qLower)) {
        hits.push({ tabName, label: `${tabName} (${idx + 1}行目)`, text: line.trim() });
      }
    });
  });

  if (examPlan) {
    if (String(examPlan.goalTitle || '').toLowerCase().includes(qLower)) {
      hits.push({ tabName: TAB_GOAL_TODO, label: `${TAB_GOAL_TODO} (目標)`, text: `${examPlan.goalTitle}（${examPlan.goalDate || ''}）` });
    }
    (examPlan.todos || []).forEach((td, idx) => {
      if (String(td.text || '').toLowerCase().includes(qLower)) {
        hits.push({ tabName: TAB_GOAL_TODO, label: `${TAB_GOAL_TODO} (#${idx + 1})`, text: td.text });
      }
    });
  }

  box.hidden = false;
  if (!hits.length) {
    box.innerHTML = `<div class="sub-note" style="margin:0;">「${esc(q)}」に一致するカルテ・目標記録はありません。</div>`;
    return;
  }

  const highlightText = (str, keyword) => {
    const safeStr = esc(str);
    const safeKw = esc(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!safeKw) return safeStr;
    return safeStr.replace(new RegExp(`(${safeKw})`, 'gi'), '<mark>$1</mark>');
  };

  box.innerHTML = hits.map((h) => `
    <button type="button" class="carte-search-hit" data-search-jump-tab="${esc(h.tabName)}" data-search-kw="${esc(q)}">
      <span class="badge" style="flex-shrink:0;">${esc(h.label)}</span>
      <span style="overflow:hidden;text-overflow:ellipsis;">${highlightText(h.text, q)}</span>
    </button>
  `).join('');
}

function buildCarteGoalTodoPanelHtml(examPlan, cd) {
  const todos = examPlan.todos || [];
  const doneCount = todos.filter((t) => t.done).length;
  return `
    <div class="carte-goal-panel" id="carte-goal-panel">
      <div class="carte-goal-config">
        <label style="flex:1.6;min-width:160px;">🎯 次の目標：
          <input type="text" id="exam-goal-title" class="grow" value="${esc(examPlan.goalTitle)}" placeholder="例：2学期期末テスト、高校入試">
        </label>
        <label>📅 目標日：
          <input type="date" id="exam-goal-date" value="${esc(examPlan.goalDate)}">
        </label>
        <label>⏱ 週コマ数：
          <input type="number" id="exam-weekly-sessions" class="num" min="1" max="14" value="${esc(examPlan.weeklySessions)}" style="width:54px;"> コマ
        </label>
        <span class="badge warn" id="goal-panel-cd-badge">あと <strong>${cd.diffDays}</strong> 日（残り約 <strong>${cd.estSessions}</strong> コマ）</span>
      </div>

      <div class="carte-todo-head">
        <span>📌 今月の重点・やることリスト（完了 ${doneCount}/${todos.length}）</span>
        ${doneCount > 0 ? `<button type="button" id="btn-clear-done-todos" class="secondary small" style="padding:2px 8px;font-size:11px;">🧹 完了分(${doneCount}件)を片付ける</button>` : ''}
      </div>

      <div class="phase-tasks">
        ${todos.length ? todos.map((t, idx) => `
          <div class="phase-task-item ${t.done ? 'done' : ''}">
            <label class="phase-task-left">
              <input type="checkbox" data-goal-todo-idx="${idx}" ${t.done ? 'checked' : ''}>
              <span class="phase-task-text">${esc(t.text)}</span>
            </label>
            <div style="display:flex;align-items:center;gap:2px;flex-shrink:0;">
              <button type="button" class="phase-task-del" data-edit-goal-todo="${idx}" title="文面を編集">✏️</button>
              <button type="button" class="phase-task-del" data-del-goal-todo="${idx}" title="削除">✕</button>
            </div>
          </div>
        `).join('') : '<span class="sub-note" style="margin:2px 0;">現在登録されている目標タスクはありません。下の入力欄から追加してください。</span>'}
      </div>

      <div class="phase-add-row">
        <input type="text" id="input-goal-todo" placeholder="今月の重点目標・やることを入力（Enterで追加）...">
        <button type="button" class="primary small" id="btn-add-goal-todo">＋ 追加</button>
      </div>
    </div>
  `;
}

function updateGoalBadgeDOM(examPlan) {
  const cd = calcExamCountdown(examPlan);
  const badge = $('#home-goal-badge');
  if (badge) {
    badge.innerHTML = `🎯 ${esc(examPlan.goalTitle || '目標')}まであと <strong>${cd.diffDays}</strong> 日（約${cd.estSessions}コマ）`;
  }
  const panelBadge = $('#goal-panel-cd-badge');
  if (panelBadge) {
    panelBadge.innerHTML = `あと <strong>${cd.diffDays}</strong> 日（残り約 <strong>${cd.estSessions}</strong> コマ）`;
  }
}

function renderHome() {
  const st = getActiveStudent();
  if (!st) return;
  const driveInfo = getDriveInfoForStudent(st);
  const examPlan = getExamPlanForStudent(st);
  const cd = calcExamCountdown(examPlan);

  $('#home-student-title').textContent = `📄 ${displayStudentName(st.name)}（${st.grade}）の専用カルテ`;
  updateGoalBadgeDOM(examPlan);
  if ($('#custom-unit-grade')) $('#custom-unit-grade').value = st.grade;

  // 1. 左カード（広め）：生徒ごとに完全独立した専用カルテ（「✍️ 振り返り記録」「📅 次回計画」「🎯 目標・やること」＋カスタムタブ）
  const textTabNames = Object.keys(driveInfo.tabs || {});
  const allTabNames = [
    TAB_REFLECTION,
    TAB_NEXT_PLAN,
    TAB_GOAL_TODO,
    ...textTabNames.filter((t) => t !== TAB_REFLECTION && t !== TAB_NEXT_PLAN && t !== TAB_GOAL_TODO)
  ];

  const savedTab = activeDocTabByStudent[st.id];
  const curTab = savedTab && allTabNames.includes(savedTab) ? savedTab : TAB_REFLECTION;
  activeDocTabByStudent[st.id] = curTab;

  const unfinishedTodoCount = (examPlan.todos || []).filter((t) => !t.done).length;
  const formatTabLabel = (t) => {
    if (t === TAB_GOAL_TODO) {
      return `${esc(t)}${unfinishedTodoCount > 0 ? ` (${unfinishedTodoCount})` : ''}`;
    }
    return /^[✍️📅📌🎯]/.test(t) ? esc(t) : `📑 ${esc(t)}`;
  };
  const isCustomTab = curTab !== TAB_REFLECTION && curTab !== TAB_NEXT_PLAN && curTab !== TAB_GOAL_TODO;
  const isGoalTab = curTab === TAB_GOAL_TODO;

  // 「＋ 今日の日付見出し」ボタンはテキストタブのときのみ表示
  const dateHeaderBtn = $('#btn-insert-date-header');
  if (dateHeaderBtn) dateHeaderBtn.hidden = isGoalTab;

  $('#home-drive-content').innerHTML = `
    <div class="drive-meta-box">
      <div class="drive-meta-row">
        <span class="drive-meta-label">📘 使用教材</span>
        <input id="edit-drive-textbook" class="drive-meta-input" value="${esc(driveInfo.textbook)}" placeholder="使用教材・目標メモ（自動保存）...">
        <div class="carte-search-wrap">
          <input type="search" id="carte-search-input" class="carte-search-input" value="${esc(currentCarteSearchQuery)}" placeholder="🔍 カルテ・目標内キーワード検索...">
        </div>
      </div>
      <div id="carte-search-results" class="carte-search-results" hidden></div>
    </div>
    <div class="drive-doc-tabs">
      ${allTabNames.map((t) => `<button type="button" class="doc-tab-pill ${t === curTab ? 'active' : ''}" data-doc-tab="${esc(t)}">${formatTabLabel(t)}</button>`).join('')}
      <button type="button" class="secondary small" id="btn-add-doc-tab" style="padding:3px 9px;font-size:11.5px;">＋ タブ追加</button>
      ${isCustomTab ? `<button type="button" class="danger small" id="btn-del-doc-tab" style="padding:3px 9px;font-size:11.5px;" title="現在開いているカスタムタブを削除">🗑 タブ削除</button>` : ''}
    </div>
    ${isGoalTab
      ? buildCarteGoalTodoPanelHtml(examPlan, cd)
      : `<textarea id="edit-drive-tab-body" class="carte-editor-textarea" rows="7" placeholder="ここに直接入力すると、${esc(displayStudentName(st.name))}さん専用の「${esc(curTab)}」として自動保存されます...">${esc(driveInfo.tabs[curTab] || '')}</textarea>`}
  `;
  renderCarteSearchResults(st);

  // 2. 右カード上段：復習すべき単元（自由記入した復習項目 ＋ 8日以上経過した単元を苦手順・経過日数順で表示）
  const manualList = state.manualReviews?.[st.id] || [];
  const allUnits = unitsFor(st.grade);
  const recUnits = allUnits
    .filter((u) => isUnitSpacedDue(st.id, u.key))
    .sort((a, b) => {
      const lvA = getProg(st.id, a.key).level;
      const lvB = getProg(st.id, b.key).level;
      if (lvA !== lvB) return lvA - lvB; // ×(1) → △(2) → ○(3) → ◎(4)
      const dA = getDaysElapsed(st.id, a.key) ?? 999;
      const dB = getDaysElapsed(st.id, b.key) ?? 999;
      return dB - dA;
    });

  const recBox = $('#home-recommend-units');
  const totalDueCount = manualList.length + recUnits.length;
  const navRevBadge = $('#m-nav-review-badge');
  if (navRevBadge) {
    navRevBadge.textContent = String(totalDueCount);
    navRevBadge.hidden = totalDueCount === 0;
  }
  if (recBox) {
    const manualHtml = manualList.map((item) => `
      <div class="rec-unit-row">
        <div class="rec-unit-info">
          <span class="chip lv2" style="cursor:default;">📌 ${esc(item.text)}</span>
          <span class="due-tag">自由記入</span>
        </div>
        <div class="rec-unit-btns">
          <button type="button" class="secondary small" data-rec-manual-edit="${esc(item.id)}" title="内容を編集">✏️</button>
          <button type="button" class="primary small" data-rec-manual-done="${esc(item.id)}" title="復習済みとしてリストから完了消去します">✓ 復習済</button>
        </div>
      </div>
    `).join('');

    const autoHtml = recUnits.map((u) => {
      const lv = getProg(st.id, u.key).level;
      const d = getDaysElapsed(st.id, u.key);
      return `
        <div class="rec-unit-row">
          <div class="rec-unit-info">
            <span class="chip lv${lv}" data-rec-open-picker="${esc(u.key)}" title="タップで理解度を1タップ変更">${LEVEL_LABEL[lv]} ${esc(u.subject)}：${esc(u.unit)}</span>
            <span class="due-tag overdue">⏰ ${d ?? 10}日前</span>
          </div>
          <div class="rec-unit-btns">
            <button type="button" class="primary small" data-rec-mark-done="${esc(u.key)}" title="今日復習したとして経過日数を0日にリセットします">✓ 今日復習済</button>
          </div>
        </div>
      `;
    }).join('');

    recBox.innerHTML = (manualHtml || autoHtml)
      ? `${manualHtml}${autoHtml}`
      : '<span class="sub-note" style="margin:0;">現在、復習対象はありません（上の入力欄から自由記入も可能です）。</span>';
  }

  // 2. 右カード下段：直近の授業予定（カレンダー連動・最大3件）
  const upcomingBox = $('#home-upcoming-schedules');
  if (upcomingBox) {
    const upcomingList = (state.schedules || [])
      .filter((sc) => sc.studentId === st.id && !sc.done)
      .sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`))
      .slice(0, 3);

    upcomingBox.innerHTML = upcomingList.length
      ? upcomingList.map((sc) => {
        const firstMemoLine = (sc.memo || '').split('\n')[0].trim();
        const unitShort = formatScheduleUnitDisplay(sc.unitKey, 'short') || firstMemoLine || '単元未指定';
        const dateShort = (sc.date || '').slice(5).replace('-', '/');
        const hasMemo = Boolean((sc.memo || '').trim());
        return `
          <div class="home-upcoming-item" style="align-items:flex-start;">
            <div style="flex:1;min-width:0;">
              <div class="home-upcoming-main" data-upcoming-edit="${esc(sc.id)}" title="クリックでカレンダーの編集画面へ移動">
                <span class="home-upcoming-date">🗓 ${esc(dateShort)} ${esc(sc.time || '')}</span>
                <span class="home-upcoming-unit">${esc(unitShort)}</span>
              </div>
              ${hasMemo ? `<div class="home-upcoming-memo">${esc(sc.memo)}</div>` : ''}
            </div>
            <button type="button" class="primary small" data-upcoming-done="${esc(sc.id)}" style="padding:3px 7px;font-size:11px;flex-shrink:0;" title="この授業を実施済みにし、単元の最終学習日を更新します">✓ 済</button>
          </div>
        `;
      }).join('')
      : '<span class="sub-note" style="margin:0;">未実施の授業予定はありません（「カレンダーへ →」から登録可）</span>';
  }

  // 3. 下段：単元理解度・完了マップ（2カラムグリッド ＆ 1タップ理解度ピッカー）
  renderHomeUnitMap(st);
}

function saveInlineDocEdits(targetStudentId) {
  const st = targetStudentId ? getStudent(targetStudentId) : getActiveStudent();
  if (!st) return;
  const driveInfo = getDriveInfoForStudent(st);
  const examPlan = getExamPlanForStudent(st);
  const curTab = activeDocTabByStudent[st.id] || TAB_REFLECTION;
  if ($('#edit-drive-textbook')) {
    const val = $('#edit-drive-textbook').value.trim();
    driveInfo.textbook = val;
    st.memo = val;
  }
  if ($('#edit-drive-tab-body') && curTab && curTab !== TAB_GOAL_TODO) {
    driveInfo.tabs[curTab] = $('#edit-drive-tab-body').value;
  }
  if ($('#exam-goal-title')) {
    examPlan.goalTitle = $('#exam-goal-title').value.trim() || examPlan.goalTitle;
  }
  if ($('#exam-goal-date')) {
    examPlan.goalDate = $('#exam-goal-date').value || examPlan.goalDate;
  }
  if ($('#exam-weekly-sessions')) {
    examPlan.weeklySessions = Math.max(1, Number($('#exam-weekly-sessions').value) || 1);
  }
  save();
}

/* ---------------- 中段：単元理解度・完了マップ ＆ 1タップ理解度ピッカー ---------------- */
function renderSubjectFilterPills(allUnits) {
  const subjBox = $('#unit-subject-pills');
  if (!subjBox) return;
  const subjs = Array.from(new Set(allUnits.map((u) => {
    if (u.subject.startsWith('数学')) return '数学';
    if (u.subject.startsWith('英語')) return '英語';
    if (u.subject.startsWith('理科') || u.subject.startsWith('化学') || u.subject.startsWith('物理') || u.subject.startsWith('生物')) return '理科';
    if (u.subject.startsWith('社会')) return '社会';
    return u.subject;
  })));
  const baseSubjs = ['all', ...subjs];
  if (!baseSubjs.includes(currentSubjFilter)) currentSubjFilter = 'all';

  subjBox.innerHTML = baseSubjs.map((s) => `
    <button type="button" class="pill ${currentSubjFilter === s ? 'active' : ''}" data-subj="${esc(s)}">${s === 'all' ? '全教科' : esc(s)}</button>
  `).join('');
}

function renderUnitQuickPicker(st) {
  const picker = $('#unit-quick-picker');
  if (!picker) return;
  if (!selectedPickerUnitKey || !st) {
    picker.hidden = true;
    picker.innerHTML = '';
    return;
  }
  const [gName, subj, uName] = selectedPickerUnitKey.split('|');
  const p = getProg(st.id, selectedPickerUnitKey);
  const days = getDaysElapsed(st.id, selectedPickerUnitKey);

  picker.hidden = false;
  picker.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <strong>🎯 選択中の単元：${esc(gName)}｜${esc(subj)}「${esc(uName)}」</strong>
      <span class="badge">現在：${LEVEL_DESC[p.level]} ${days !== null ? `（${days}日前）` : ''}</span>
    </div>
    <div class="unit-picker-levels">
      <span style="font-size:12px;font-weight:700;color:#1e3a8a;">1タップで理解度変更（今日の日付に更新）：</span>
      ${[0, 1, 2, 3, 4].map((lv) => `
        <button type="button" class="chip lv${lv} ${p.level === lv ? 'selected-chip' : ''}" data-pick-level="${lv}">
          ${LEVEL_DESC[lv]}
        </button>
      `).join('')}
      <button type="button" class="danger small" data-picker-del-unit="${esc(selectedPickerUnitKey)}" title="この単元をマップから削除">🗑 単元削除</button>
      <button type="button" class="secondary small" id="btn-close-unit-picker">閉じる ✕</button>
    </div>
  `;
}

function renderHomeUnitMap(st = getActiveStudent()) {
  if (!st) return;
  const allUnits = unitsFor(st.grade, currentUnitFilter === 'all');
  renderSubjectFilterPills(allUnits);
  renderUnitQuickPicker(st);

  const studentScopeUnits = unitsFor(st.grade, false);
  const counts = [0, 0, 0, 0, 0];
  studentScopeUnits.forEach((u) => {
    const lv = getProg(st.id, u.key).level;
    counts[lv] = (counts[lv] || 0) + 1;
  });
  const learned = counts[1] + counts[2] + counts[3] + counts[4];
  const mastered = counts[3] + counts[4];
  const masteryPct = studentScopeUnits.length ? Math.round((mastered / studentScopeUnits.length) * 100) : 0;

  const summaryEl = $('#unit-mastery-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <span class="mastery-progress-track"><span class="mastery-progress-fill" style="width:${masteryPct}%"></span></span>
      <strong>習得率(○・◎): ${masteryPct}%</strong>
      <span>（学習済 ${learned}/${studentScopeUnits.length} ｜ ◎:${counts[4]} ○:${counts[3]} △:${counts[2]} ×:${counts[1]} 未:${counts[0]}）</span>
    `;
  }

  const filtered = allUnits.filter((u) => {
    const lv = getProg(st.id, u.key).level;
    if (currentSubjFilter !== 'all') {
      if (currentSubjFilter === '理科') {
        if (!u.subject.startsWith('理科') && !u.subject.startsWith('化学') && !u.subject.startsWith('物理') && !u.subject.startsWith('生物')) return false;
      } else if (!u.subject.startsWith(currentSubjFilter)) {
        return false;
      }
    }
    if (currentUnitFilter === 'current') return u.grade === st.grade;
    if (currentUnitFilter === 'weak') return [1, 2].includes(lv);
    if (currentUnitFilter === 'unlearned') return lv === 0;
    return true;
  });

  const groups = {};
  filtered.forEach((u) => { (groups[`${u.grade} ${u.subject}`] ||= []).push(u); });

  const box = $('#home-unit-map');
  if (!Object.keys(groups).length) {
    box.innerHTML = '<p class="sub-note">条件に一致する単元がありません。</p>';
    return;
  }

  box.innerHTML = Object.entries(groups).map(([g, list]) => {
    const chips = list.map((u) => {
      const p = getProg(st.id, u.key);
      const days = getDaysElapsed(st.id, u.key);
      const isDue = isUnitSpacedDue(st.id, u.key);
      const isSelected = selectedPickerUnitKey === u.key;
      const dayTag = days !== null ? `<span class="due-tag ${isDue ? 'overdue' : ''}">${isDue ? '⏰' : ''}${days}日前</span>` : '';
      return `<span class="chip lv${p.level} ${isSelected ? 'selected-chip' : ''}" data-unit-key="${esc(u.key)}" title="タップで理解度変更バーを開きます">${LEVEL_LABEL[p.level]} ${esc(u.unit)}${dayTag}</span>`;
    }).join('');
    return `<div class="unit-group"><h3>${esc(g)}</h3><div class="chips">${chips}</div></div>`;
  }).join('');
}

function onUnitFilterClick(e) {
  const pill = e.target.closest('.pill');
  if (!pill) return;
  $$('#unit-filter-pills .pill').forEach((p) => p.classList.remove('active'));
  pill.classList.add('active');
  currentUnitFilter = pill.dataset.filter;
  renderHomeUnitMap();
}

function onUnitSubjFilterClick(e) {
  const pill = e.target.closest('.pill');
  if (!pill) return;
  $$('#unit-subject-pills .pill').forEach((p) => p.classList.remove('active'));
  pill.classList.add('active');
  currentSubjFilter = pill.dataset.subj;
  renderHomeUnitMap();
}

function onHomeUnitMapClick(e) {
  const chip = e.target.closest('.chip[data-unit-key]');
  if (!chip) return;
  const key = chip.dataset.unitKey;
  selectedPickerUnitKey = (selectedPickerUnitKey === key) ? null : key;
  renderHomeUnitMap();
}

/* ---------------- カルテへの今日の日付見出し挿入 ---------------- */
function insertTodayHeaderToCarte() {
  const st = getActiveStudent();
  if (!st) return;
  saveInlineDocEdits(st.id);

  const driveInfo = getDriveInfoForStudent(st);
  const curTab = activeDocTabByStudent[st.id] && driveInfo.tabs[activeDocTabByStudent[st.id]] !== undefined
    ? activeDocTabByStudent[st.id]
    : TAB_REFLECTION;

  const headerLine = curTab === TAB_NEXT_PLAN
    ? `【${today()} 次回計画】\n・`
    : curTab === TAB_REFLECTION
      ? `【${today()} 振り返り】\n・`
      : `【${today()}】\n・`;

  const currentBody = driveInfo.tabs[curTab] || '';
  driveInfo.tabs[curTab] = `${headerLine}\n\n${currentBody}`;
  save();
  renderHome();

  const editor = $('#edit-drive-tab-body');
  if (editor) {
    editor.focus();
    editor.setSelectionRange(headerLine.length, headerLine.length);
    editor.scrollTop = 0;
  }
  toast(`📅「${curTab}」の先頭に今日の日付見出しを挿入しました`);
}

/* ---------------- 2. 📅 別ページ：授業カレンダー（月間グリッド・単元の自由記入＆検索・登録後編集対応） ---------------- */
function buildCalendarGridHtml(year, month, schedules) {
  const firstDay = new Date(year, month, 1);
  const startDow = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const todayStr = today();

  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const headerHtml = weekdays.map((w, i) => {
    const cls = i === 0 ? 'sun' : i === 6 ? 'sat' : '';
    return `<div class="cal-weekday ${cls}">${w}</div>`;
  }).join('');

  const cells = [];
  for (let i = startDow - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const prevDate = new Date(year, month - 1, d);
    const dStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;
    cells.push({ d, dStr, other: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ d, dStr, other: false });
  }
  const rem = (7 - (cells.length % 7)) % 7;
  for (let d = 1; d <= rem; d++) {
    const nextDate = new Date(year, month + 1, d);
    const dStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;
    cells.push({ d, dStr, other: true });
  }

  const cellsHtml = cells.map((c) => {
    const dayEvents = schedules.filter((sc) => sc.date === c.dStr);
    const isToday = c.dStr === todayStr;
    const isSelected = c.dStr === calSelectedDate;
    const chipsHtml = dayEvents.slice(0, 3).map((ev) => {
      const sObj = getStudent(ev.studentId);
      const shortName = sObj ? displayStudentName(sObj.name).split(' ')[0] : '';
      const firstMemoLine = (ev.memo || '').split('\n')[0].trim();
      const uShort = formatScheduleUnitDisplay(ev.unitKey, 'chip') || firstMemoLine || '授業';
      return `<div class="cal-event-chip ${ev.done ? 'done' : ''}" data-cal-event-id="${esc(ev.id)}" title="クリックして予定を編集：${esc(sObj?.name || '')} ${esc(ev.time || '')} ${esc(uShort)}">${esc(ev.time || '')} ${esc(shortName)}:${esc(uShort)}</div>`;
    }).join('');
    const moreHtml = dayEvents.length > 3 ? `<div style="font-size:10px;color:#64748b;">他${dayEvents.length - 3}件</div>` : '';

    return `
      <div class="cal-day ${c.other ? 'other-month' : ''} ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}" data-cal-date="${c.dStr}">
        <div class="cal-day-num">
          <span>${c.d}</span>
          ${isToday ? '<span style="font-size:9px;color:#2563eb;">今日</span>' : ''}
        </div>
        ${chipsHtml}
        ${moreHtml}
      </div>
    `;
  }).join('');

  return `<div class="cal-grid">${headerHtml}${cellsHtml}</div>`;
}

/* ---------------- 授業時間配分ビルダー ＆ カルテ自動反映ヘルパー ---------------- */
function syncCalendarDraftFromDOM() {
  if ($('#sched-time')) calDraftForm.time = $('#sched-time').value || '17:00';
  if ($('#sched-duration')) calDraftForm.duration = Number($('#sched-duration').value) || 100;
  if ($('#sched-unit')) calDraftForm.unit = $('#sched-unit').value;
  if ($('#sched-memo')) calDraftForm.memo = $('#sched-memo').value;
}

function formatClockAddMinutes(startTimeStr, addMin) {
  const parts = String(startTimeStr || '17:00').split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (isNaN(h) || isNaN(m)) return '';
  const total = h * 60 + m + (Number(addMin) || 0);
  const outH = Math.floor(total / 60) % 24;
  const outM = total % 60;
  return `${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}`;
}

function applyTimeBuilderTemplate(tplKey, totalDuration = 100) {
  const dur = Math.max(15, Number(totalDuration) || 100);
  const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);

  const presets = {
    standard: [
      { ratio: 0.15, label: '宿題確認・8日経過単元の復習' },
      { ratio: 0.45, label: 'メイン単元の解説・基本例題' },
      { ratio: 0.30, label: '問題演習・類題チェック' },
      { ratio: 0.10, label: 'まとめ・次回宿題指定' }
    ],
    exercise: [
      { ratio: 0.10, label: '宿題・暗記小テスト確認' },
      { ratio: 0.55, label: '実戦演習・テスト範囲問題' },
      { ratio: 0.25, label: '間違えた問題の解説・解き直し' },
      { ratio: 0.10, label: '弱点整理・次回課題指定' }
    ],
    review: [
      { ratio: 0.25, label: '前回・苦手単元の復習テスト' },
      { ratio: 0.35, label: '基本手順の確認・例題解説' },
      { ratio: 0.30, label: '反復トレーニング' },
      { ratio: 0.10, label: '本日の振り返り・宿題出し' }
    ]
  };

  const list = presets[tplKey] || presets.standard;
  let used = 0;
  calTimeBlocks = list.map((item, idx) => {
    const mins = idx === list.length - 1
      ? Math.max(5, dur - used)
      : round5(dur * item.ratio);
    used += mins;
    return { id: uid(), minutes: mins, label: item.label };
  });
}

function formatTimeBlocksToMemoText(startTimeStr) {
  let cur = 0;
  return calTimeBlocks
    .filter((b) => (Number(b.minutes) > 0) || (b.label && b.label.trim()))
    .map((b) => {
      const m = Math.max(0, Number(b.minutes) || 0);
      const s = cur;
      const e = cur + m;
      cur = e;
      const tStart = formatClockAddMinutes(startTimeStr, s);
      const tEnd = formatClockAddMinutes(startTimeStr, e);
      const rangeStr = (tStart && tEnd) ? `${tStart}〜${tEnd}` : `${s}〜${e}分`;
      return `・${rangeStr}（${m}分）：${(b.label || '').trim() || '（内容未入力）'}`;
    })
    .join('\n');
}

function buildTimeBuilderHtml(startTimeStr, totalDuration) {
  const targetDur = Math.max(15, Number(totalDuration) || 100);
  let cumMin = 0;
  const rowsHtml = calTimeBlocks.map((b) => {
    const m = Math.max(0, Number(b.minutes) || 0);
    const s = cumMin;
    const e = cumMin + m;
    cumMin = e;
    const tStart = formatClockAddMinutes(startTimeStr, s);
    const tEnd = formatClockAddMinutes(startTimeStr, e);
    const rangeLabel = (tStart && tEnd) ? `${tStart}〜${tEnd} (${s}〜${e}分)` : `${s}〜${e}分`;
    return `
      <div class="time-builder-row" data-tb-row="${esc(b.id)}">
        <span class="time-slot-range" data-tb-range="${esc(b.id)}">${esc(rangeLabel)}</span>
        <span class="time-slot-min-wrap">
          <input type="number" class="time-slot-min-input" data-tb-min="${esc(b.id)}" value="${esc(m)}" min="5" max="240" step="5">
          <span>分</span>
        </span>
        <input type="text" class="time-slot-label-input" data-tb-label="${esc(b.id)}" value="${esc(b.label)}" placeholder="この時間枠でやること（自由入力）...">
        <button type="button" class="phase-task-del" data-tb-del="${esc(b.id)}" title="この時間枠を削除">✕</button>
      </div>
    `;
  }).join('');

  const diff = targetDur - cumMin;
  const badgeCls = diff === 0 ? 'exact' : diff > 0 ? 'under' : 'over';
  const badgeText = diff === 0
    ? `合計 ${cumMin} / ${targetDur} 分（ちょうど）`
    : diff > 0
      ? `合計 ${cumMin} / ${targetDur} 分（残り ${diff} 分）`
      : `合計 ${cumMin} / ${targetDur} 分（${Math.abs(diff)} 分超過）`;

  return `
    <div class="time-builder-box" id="cal-time-builder">
      <div class="time-builder-head">
        <div class="time-builder-title">
          <span>⏱ 次の授業の時間予定を組み立てる</span>
          <span class="time-total-badge ${badgeCls}" id="tb-total-badge">${esc(badgeText)}</span>
        </div>
        <div class="time-builder-templates">
          <span style="font-size:11.5px;color:#64748b;font-weight:700;">テンプレ読込：</span>
          <button type="button" class="secondary small" data-tb-tpl="standard">📋 標準構成</button>
          <button type="button" class="secondary small" data-tb-tpl="exercise">🔥 演習・テスト対策</button>
          <button type="button" class="secondary small" data-tb-tpl="review">🌱 基礎・復習重視</button>
        </div>
      </div>
      <div class="time-builder-rows" id="tb-rows-container">
        ${rowsHtml || '<span class="sub-note" style="margin:2px 0;">「＋ 時間枠を追加」または上のテンプレから時間配分を組み立てられます。</span>'}
      </div>
      <div class="time-builder-footer">
        <button type="button" class="secondary small" id="btn-tb-add-slot">＋ 時間枠を追加</button>
        <button type="button" class="primary small" id="btn-tb-apply-memo">⬇ 組み立てた時間予定を下の次回予定メモに反映</button>
      </div>
    </div>
  `;
}

function updateTimeBuilderBadgesDOM() {
  const startTimeStr = $('#sched-time')?.value || calDraftForm.time || '17:00';
  const targetDur = Math.max(15, Number($('#sched-duration')?.value || calDraftForm.duration) || 100);
  let cumMin = 0;
  calTimeBlocks.forEach((b) => {
    const m = Math.max(0, Number(b.minutes) || 0);
    const s = cumMin;
    const e = cumMin + m;
    cumMin = e;
    const rangeEl = $(`[data-tb-range="${b.id}"]`);
    if (rangeEl) {
      const tStart = formatClockAddMinutes(startTimeStr, s);
      const tEnd = formatClockAddMinutes(startTimeStr, e);
      rangeEl.textContent = (tStart && tEnd) ? `${tStart}〜${tEnd} (${s}〜${e}分)` : `${s}〜${e}分`;
    }
  });
  const badge = $('#tb-total-badge');
  if (badge) {
    const diff = targetDur - cumMin;
    badge.className = `time-total-badge ${diff === 0 ? 'exact' : diff > 0 ? 'under' : 'over'}`;
    badge.textContent = diff === 0
      ? `合計 ${cumMin} / ${targetDur} 分（ちょうど）`
      : diff > 0
        ? `合計 ${cumMin} / ${targetDur} 分（残り ${diff} 分）`
        : `合計 ${cumMin} / ${targetDur} 分（${Math.abs(diff)} 分超過）`;
  }
}

function reflectAddedScheduleToCarte(st, sc) {
  if (!st || !sc) return;
  saveInlineDocEdits(st.id);
  const driveInfo = getDriveInfoForStudent(st);
  const uLabel = formatScheduleUnitDisplay(sc.unitKey, 'full') || '単元指定なし';
  const header = `【📅 ${sc.date} ${sc.time || ''}（${sc.duration || 100}分）｜${uLabel}】`;
  const body = (sc.memo || '').trim();
  const entryBlock = body ? `${header}\n${body}` : `${header}\n・`;
  const existing = (driveInfo.tabs[TAB_NEXT_PLAN] || '').trim();
  driveInfo.tabs[TAB_NEXT_PLAN] = existing ? `${entryBlock}\n\n${existing}` : entryBlock;
  activeDocTabByStudent[st.id] = TAB_NEXT_PLAN;
}

function renderCalendar() {
  const box = $('#calendar-body');
  if (!box) return;
  const st = getActiveStudent();
  if (!st) {
    box.innerHTML = '<div class="card"><p>生徒を選択してください。</p></div>';
    return;
  }

  // 未実施を上、実施済みを下に並べ、それぞれ日付・時間順にソート
  const allSchedules = (state.schedules || []).slice().sort((a, b) => {
    if (Boolean(a.done) !== Boolean(b.done)) return a.done ? 1 : -1;
    return (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''));
  });
  const filteredSchedules = calStudentFilter === 'all'
    ? allSchedules
    : allSchedules.filter((sc) => sc.studentId === st.id);

  const calendarGridHtml = buildCalendarGridHtml(calYear, calMonth, filteredSchedules);
  const unitDatalistHtml = buildUnitDatalistOptionsHtml(st);
  const timeBuilderHtml = buildTimeBuilderHtml(calDraftForm.time, calDraftForm.duration);

  box.innerHTML = `
    <div class="card">
      <div class="card-head">
        <div>
          <h2>📅 授業スケジュール・月間カレンダー</h2>
          <p class="sub-note" style="margin:2px 0 0;">日付マスをクリックすると下の登録フォームに日付が入ります。予定を追加するとカルテの「📅 次回計画」にも自動反映されます。</p>
        </div>
        <div class="pill-group" id="cal-student-filter-pills">
          <button type="button" class="pill ${calStudentFilter === 'active' ? 'active' : ''}" data-cal-filter="active">👤 ${esc(displayStudentName(st.name))}のみ</button>
          <button type="button" class="pill ${calStudentFilter === 'all' ? 'active' : ''}" data-cal-filter="all">👥 担当生徒すべて表示</button>
        </div>
      </div>

      <!-- 月間カレンダー操作バー -->
      <div class="cal-toolbar">
        <div class="row no-margin">
          <button type="button" id="btn-cal-prev" class="secondary small">◀ 前の月</button>
          <span class="cal-month-title">${calYear}年 ${calMonth + 1}月</span>
          <button type="button" id="btn-cal-next" class="secondary small">次の月 ▶</button>
          <button type="button" id="btn-cal-today" class="secondary small">今月へ戻る</button>
        </div>
        <span class="sub-note">📅 選択中の日付：<strong>${esc(calSelectedDate)}</strong></span>
      </div>

      ${calendarGridHtml}

      <!-- 授業予定追加フォーム（単元の自由記入＋キーワード検索 ＆ 時間配分ビルダー ＆ 改行対応メモ） -->
      <datalist id="cal-unit-datalist">${unitDatalistHtml}</datalist>
      <div class="schedule-form-wrap">
        <div class="row no-margin" style="justify-content:space-between;margin-bottom:8px;">
          <h3 style="margin:0;color:#1e3a8a;">➕ ${esc(displayStudentName(st.name))}（${st.grade}）の次回授業予定を追加（カルテ自動反映）</h3>
        </div>
        <div class="row no-margin" style="margin-bottom:8px;">
          <label>📅 授業日：<input type="date" id="sched-date" value="${esc(calSelectedDate)}"></label>
          <label>⏰ 開始時間：<input type="time" id="sched-time" value="${esc(calDraftForm.time || '17:00')}"></label>
          <label>⏱ 時間（分）：<input type="number" id="sched-duration" class="num" value="${esc(calDraftForm.duration || 100)}" min="15" max="240" step="5"></label>
          <label class="grow">📘 扱う単元・内容：<input type="text" id="sched-unit" list="cal-unit-datalist" class="grow" value="${esc(calDraftForm.unit || '')}" placeholder="自由記入、または文字入力で単元候補を検索（例：二次、関係代名詞、期末対策）..."></label>
        </div>

        ${timeBuilderHtml}

        <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;">
          <label style="font-size:12.5px;color:#1e3a8a;">📝 次回予定・授業内容メモ（Enterキーで改行できます）：</label>
          <textarea id="sched-memo" class="sched-memo-textarea" rows="3" placeholder="授業内容・時間配分・準備メモを入力（Enterで改行／上の時間配分ビルダーからも反映可）...">${esc(calDraftForm.memo || '')}</textarea>
          <div style="display:flex;justify-content:flex-end;">
            <button type="button" id="btn-add-schedule" class="primary">📅 カレンダーに予定を追加（カルテへ自動反映）</button>
          </div>
        </div>
      </div>

      <!-- 登録済み授業予定リスト（登録後の内容編集・自由記入＆単元検索に対応） -->
      <div class="schedule-list">
        ${filteredSchedules.length ? filteredSchedules.map((sc) => {
          const sObj = getStudent(sc.studentId);
          const uLabel = formatScheduleUnitDisplay(sc.unitKey, 'full') || '単元指定なし';

          // 編集モード中の予定アイテム
          if (editingScheduleId === sc.id) {
            const editSt = sObj || st;
            const editDatalistHtml = buildUnitDatalistOptionsHtml(editSt);
            const editUnitDisplayVal = formatScheduleUnitDisplay(sc.unitKey, 'full');
            const studentOpts = state.students.map((s) => (
              `<option value="${esc(s.id)}" ${sc.studentId === s.id ? 'selected' : ''}>${esc(displayStudentName(s.name))}（${esc(s.grade)}）</option>`
            )).join('');

            return `
              <div class="schedule-item editing" id="sched-item-${esc(sc.id)}">
                <div style="width:100%;">
                  <div style="font-weight:800;color:#1e3a8a;margin-bottom:8px;">✏️ 登録済み授業予定の編集</div>
                  <datalist id="cal-edit-unit-datalist">${editDatalistHtml}</datalist>
                  <div class="row no-margin" style="margin-bottom:8px;">
                    <label>👤 担当生徒：<select id="edit-sched-student">${studentOpts}</select></label>
                    <label>📅 授業日：<input type="date" id="edit-sched-date" value="${esc(sc.date)}"></label>
                    <label>⏰ 開始時間：<input type="time" id="edit-sched-time" value="${esc(sc.time || '17:00')}"></label>
                    <label>⏱ 時間（分）：<input type="number" id="edit-sched-duration" class="num" value="${esc(sc.duration || 100)}" min="15" max="240" step="5"></label>
                  </div>
                  <div class="row no-margin" style="margin-bottom:8px;">
                    <label class="grow">📘 扱う単元・内容：<input type="text" id="edit-sched-unit" list="cal-edit-unit-datalist" class="grow" value="${esc(editUnitDisplayVal)}" placeholder="自由記入、または文字入力で単元候補を検索..."></label>
                  </div>
                  <div style="display:flex;flex-direction:column;gap:6px;">
                    <label style="font-size:12.5px;color:#1e3a8a;">📝 内容・準備メモ（Enterキーで改行できます）：</label>
                    <textarea id="edit-sched-memo" class="sched-memo-textarea" rows="3" placeholder="授業内容・準備メモ（Enterで改行）">${esc(sc.memo || '')}</textarea>
                    <div class="row no-margin" style="justify-content:flex-end;">
                      <button type="button" class="primary small" data-sched-save="${esc(sc.id)}">💾 変更を保存</button>
                      <button type="button" class="secondary small" data-sched-cancel="${esc(sc.id)}">キャンセル</button>
                    </div>
                  </div>
                </div>
              </div>
            `;
          }

          return `
            <div class="schedule-item ${sc.done ? 'done' : ''}" id="sched-item-${esc(sc.id)}">
              <div class="schedule-meta">
                <div>
                  <span class="schedule-date-badge">📅 ${esc(sc.date)} ${esc(sc.time || '')}（${esc(sc.duration || 100)}分）</span>
                  <span class="badge">${esc(displayStudentName(sObj?.name || ''))}（${esc(sObj?.grade || '')}）</span>
                  <strong>${esc(uLabel)}</strong>
                </div>
                ${sc.memo ? `<div class="schedule-memo-display">${esc(sc.memo)}</div>` : ''}
              </div>
              <div class="row no-margin">
                <label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer;">
                  <input type="checkbox" data-sched-toggle="${sc.id}" ${sc.done ? 'checked' : ''}> 実施済
                </label>
                <button type="button" class="secondary small" data-sched-edit="${sc.id}">✏️ 編集</button>
                <button type="button" class="secondary small" data-gcal-id="${sc.id}">📅 Googleカレンダー登録</button>
                <button type="button" class="danger small" data-sched-del="${sc.id}">削除</button>
              </div>
            </div>
          `;
        }).join('') : '<p class="sub-note">登録されている授業予定はありません。上のフォームから追加してください。</p>'}
      </div>
    </div>
  `;
}

function startEditingSchedule(evId) {
  syncCalendarDraftFromDOM();
  editingScheduleId = evId;
  renderCalendar();
  setTimeout(() => {
    $(`#sched-item-${evId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('#edit-sched-unit')?.focus();
  }, 30);
}

function onCalendarClick(e) {
  const st = getActiveStudent();
  if (!st) return;

  // 時間配分ビルダー：テンプレ読込ボタン
  const tplBtn = e.target.closest('[data-tb-tpl]');
  if (tplBtn) {
    syncCalendarDraftFromDOM();
    applyTimeBuilderTemplate(tplBtn.dataset.tbTpl, calDraftForm.duration);
    renderCalendar();
    toast('⏱ 時間配分テンプレートを読み込みました（分数・内容は自由に変更できます）');
    return;
  }

  // 時間配分ビルダー：枠の削除ボタン
  const delSlotBtn = e.target.closest('[data-tb-del]');
  if (delSlotBtn) {
    syncCalendarDraftFromDOM();
    const bid = delSlotBtn.dataset.tbDel;
    calTimeBlocks = calTimeBlocks.filter((b) => b.id !== bid);
    renderCalendar();
    return;
  }

  // 時間配分ビルダー：＋ 時間枠を追加
  if (e.target.closest('#btn-tb-add-slot')) {
    syncCalendarDraftFromDOM();
    const targetDur = Math.max(15, Number(calDraftForm.duration) || 100);
    const used = calTimeBlocks.reduce((acc, b) => acc + (Number(b.minutes) || 0), 0);
    const rem = targetDur - used;
    const defaultMin = rem >= 5 ? rem : 15;
    const newId = uid();
    calTimeBlocks.push({ id: newId, minutes: defaultMin, label: '' });
    renderCalendar();
    $(`[data-tb-label="${newId}"]`)?.focus();
    return;
  }

  // 時間配分ビルダー：⬇ 組み立てた時間予定を下の次回予定メモに反映
  if (e.target.closest('#btn-tb-apply-memo')) {
    syncCalendarDraftFromDOM();
    const formatted = formatTimeBlocksToMemoText(calDraftForm.time);
    if (!formatted) {
      toast('時間枠を追加・入力してください');
      return;
    }
    const curMemo = (calDraftForm.memo || '').trim();
    // すでに手書きメモがある場合は改行して追記するか、空ならそのままセット
    const nonTimeLines = curMemo
      .split('\n')
      .filter((line) => line.trim() && !/^・\d{1,2}[:〜]/.test(line.trim()));
    calDraftForm.memo = nonTimeLines.length
      ? `${formatted}\n${nonTimeLines.join('\n')}`
      : formatted;
    if ($('#sched-memo')) {
      $('#sched-memo').value = calDraftForm.memo;
      $('#sched-memo').focus();
    }
    toast('⬇ 組み立てた時間予定を次回予定メモに反映しました！');
    return;
  }

  // 表示生徒フィルター切替
  const filterPill = e.target.closest('[data-cal-filter]');
  if (filterPill) {
    syncCalendarDraftFromDOM();
    calStudentFilter = filterPill.dataset.calFilter;
    renderCalendar();
    return;
  }

  // 月移動ボタン
  if (e.target.closest('#btn-cal-prev')) {
    syncCalendarDraftFromDOM();
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
    return;
  }
  if (e.target.closest('#btn-cal-next')) {
    syncCalendarDraftFromDOM();
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
    return;
  }
  if (e.target.closest('#btn-cal-today')) {
    syncCalendarDraftFromDOM();
    const d = new Date();
    calYear = d.getFullYear();
    calMonth = d.getMonth();
    calSelectedDate = today();
    renderCalendar();
    return;
  }

  // カレンダー内の予定チップをクリック ➔ その予定の編集フォームを開く
  const eventChip = e.target.closest('[data-cal-event-id]');
  if (eventChip) {
    startEditingSchedule(eventChip.dataset.calEventId);
    return;
  }

  // 日付マスをクリック ➔ 予定登録フォームの日付にセット
  const dayCell = e.target.closest('.cal-day[data-cal-date]');
  if (dayCell) {
    syncCalendarDraftFromDOM();
    calSelectedDate = dayCell.dataset.calDate;
    renderCalendar();
    return;
  }

  // 予定の編集開始ボタン
  const editBtn = e.target.closest('[data-sched-edit]');
  if (editBtn) {
    startEditingSchedule(editBtn.dataset.schedEdit);
    return;
  }

  // 予定の編集キャンセル
  if (e.target.closest('[data-sched-cancel]')) {
    syncCalendarDraftFromDOM();
    editingScheduleId = null;
    renderCalendar();
    return;
  }

  // 予定の編集保存ボタン
  const saveBtn = e.target.closest('[data-sched-save]');
  if (saveBtn) {
    syncCalendarDraftFromDOM();
    const id = saveBtn.dataset.schedSave;
    const sc = (state.schedules || []).find((x) => x.id === id);
    if (sc) {
      sc.studentId = $('#edit-sched-student')?.value || sc.studentId;
      sc.date = $('#edit-sched-date')?.value || sc.date;
      sc.time = $('#edit-sched-time')?.value || sc.time;
      sc.duration = Number($('#edit-sched-duration')?.value) || 100;
      const editSt = getStudent(sc.studentId) || st;
      sc.unitKey = resolveScheduleUnitInput(editSt, $('#edit-sched-unit')?.value || '');
      sc.memo = $('#edit-sched-memo')?.value.trim() ?? sc.memo;

      const dParts = sc.date.split('-');
      if (dParts.length === 3) {
        calYear = Number(dParts[0]);
        calMonth = Number(dParts[1]) - 1;
        calSelectedDate = sc.date;
      }
      editingScheduleId = null;
      save();
      renderAll();
      toast('💾 授業予定の内容を更新・保存しました！');
    }
    return;
  }

  // 予定追加ボタン（追加時にカルテの「📅 次回計画」へ自動反映）
  if (e.target.closest('#btn-add-schedule')) {
    const date = $('#sched-date')?.value || today();
    const time = $('#sched-time')?.value || '17:00';
    const duration = Number($('#sched-duration')?.value) || 100;
    const unitKey = resolveScheduleUnitInput(st, $('#sched-unit')?.value || '');
    const memo = $('#sched-memo')?.value.trim() || '';

    const newSchedule = {
      id: uid(),
      studentId: st.id,
      date,
      time,
      duration,
      unitKey,
      memo,
      done: false
    };

    state.schedules ||= [];
    state.schedules.push(newSchedule);

    // 予定追加時に生徒カルテの「📅 次回計画」タブへ自動反映
    reflectAddedScheduleToCarte(st, newSchedule);

    // 次回入力用に開始時間と授業時間は維持し、単元とメモをクリア
    calDraftForm.time = time;
    calDraftForm.duration = duration;
    calDraftForm.unit = '';
    calDraftForm.memo = '';

    const dParts = date.split('-');
    if (dParts.length === 3) {
      calYear = Number(dParts[0]);
      calMonth = Number(dParts[1]) - 1;
      calSelectedDate = date;
    }
    save();
    renderAll();
    toast(`📅 ${date} ${time} の予定を登録し、カルテの「📅 次回計画」に自動反映しました！`);
    return;
  }

  // Googleカレンダー登録ボタン
  const gcalBtn = e.target.closest('[data-gcal-id]');
  if (gcalBtn) {
    const id = gcalBtn.dataset.gcalId;
    const sc = (state.schedules || []).find((x) => x.id === id);
    if (!sc) return;
    const sObj = getStudent(sc.studentId);
    const url = buildGoogleCalendarUrl(sc, sObj);
    window.open(url, '_blank', 'noopener');
    return;
  }

  // 予定の削除
  const delBtn = e.target.closest('[data-sched-del]');
  if (delBtn) {
    const id = delBtn.dataset.schedDel;
    if (editingScheduleId === id) editingScheduleId = null;
    state.schedules = (state.schedules || []).filter((x) => x.id !== id);
    save();
    renderAll();
    toast('予定を削除しました');
  }
}

/* ---------------- 3. 👥 生徒管理・バックアップ ---------------- */
function renderDriveSettings() {
  const list = $('#student-manage-list');
  if (list) {
    list.innerHTML = state.students.map((s) => `
      <div class="manage-row">
        <span><strong>${esc(displayStudentName(s.name))}</strong>（${s.grade}）${s.memo ? `<span class="sub-note"> - ${esc(s.memo)}</span>` : ''}</span>
        <div class="row no-margin">
          <button type="button" class="secondary small" data-edit-st="${s.id}">✏️ 編集</button>
          <button type="button" class="danger small" data-del-st="${s.id}">削除</button>
        </div>
      </div>
    `).join('');
  }
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `juku-backup-${today()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('⬇ 全データをJSONファイルとして保存しました');
}

function importData(text) {
  try {
    const s = JSON.parse(text);
    if (!s || !Array.isArray(s.students)) throw new Error('形式が違います');
    if (!confirm('現在のデータを読み込んだデータで上書きします。よろしいですか？')) return;
    state = { ...freshState(), ...s, initialized: true };
    delete state.nextTodos;
    save();
    renderAll();
    toast('⬆ バックアップデータを読み込みました');
  } catch (e) {
    alert(`読み込みに失敗しました：${e.message}`);
  }
}

/* ---------------- どこからでも1クリックで生徒追加できるヘルパー ---------------- */
function promptQuickAddStudent() {
  const name = prompt('新しく登録する生徒の氏名を入力してください：');
  if (!name || !name.trim()) return;
  const gradeInput = prompt('学年を入力してください（中1 / 中2 / 中3 / 高1 / 高2 / 高3）：', '中3');
  if (gradeInput === null) return;
  const validGrades = ['中1', '中2', '中3', '高1', '高2', '高3'];
  const grade = validGrades.includes(gradeInput.trim()) ? gradeInput.trim() : '中3';
  const memoInput = prompt('使用教材・目標メモを入力してください（任意）：', '') ?? '';

  saveInlineDocEdits(state.currentStudentId);

  const st = { id: uid(), name: name.trim(), grade, memo: memoInput.trim() };
  state.students.push(st);
  state.currentStudentId = st.id;
  getDriveInfoForStudent(st);
  getExamPlanForStudent(st);
  save();
  renderAll();
  toast(`👤「${st.name}（${st.grade}）」さんを追加し、専用カルテを作成しました！`);
}

/* ---------------- 初期化とイベントリスナー ---------------- */
function init() {
  // もしサンプル生徒（A/B）のみが入っている場合は5生徒の実データへ自動アップグレード
  upgradeSampleStudentsIfNeeded();

  if (!state.initialized || !Array.isArray(state.students) || state.students.length === 0) {
    loadDefaultGenericStudents(true);
  } else {
    state.initialized = true;
    delete state.nextTodos;
    state.schedules ||= [];
    state.students.forEach((st) => {
      getDriveInfoForStudent(st);
      getExamPlanForStudent(st);
    });
    save();
  }

  window.addEventListener('beforeunload', () => {
    saveInlineDocEdits(state.currentStudentId);
    save();
  });

  refreshSelects();

  // タブ切り替え（PC用）
  $$('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));

  // スマホ用：上部1タップ生徒切り替えピルバーのクリック
  $('#mobile-student-pills')?.addEventListener('click', (e) => {
    if (e.target.closest('#btn-mobile-add-student')) {
      promptQuickAddStudent();
      return;
    }
    const pill = e.target.closest('[data-mst-id]');
    if (pill) {
      switchActiveStudent(pill.dataset.mstId);
    }
  });

  // モバイル用ボトムナビ切り替え（1画面1機能でスッキリ表示）
  $$('.m-nav-btn').forEach((b) => {
    b.addEventListener('click', () => {
      const target = b.dataset.mview;
      $$('.m-nav-btn').forEach((x) => x.classList.toggle('active', x === b));
      if (target === 'drive') {
        selectedPickerUnitKey = null;
        showView('drive');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (target === 'calendar') {
        selectedPickerUnitKey = null;
        showView('calendar');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        const homeSec = $('#view-home');
        if (homeSec) homeSec.dataset.msection = target;
        if (target !== 'units') selectedPickerUnitKey = null;
        showView('home');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });

  // カレンダー画面のイベント登録（クリック・時間配分ビルダー入力・Enter改行対応・実施済チェック）
  $('#calendar-body')?.addEventListener('click', onCalendarClick);
  $('#calendar-body')?.addEventListener('input', (e) => {
    const minInput = e.target.closest('[data-tb-min]');
    if (minInput) {
      const bid = minInput.dataset.tbMin;
      const item = calTimeBlocks.find((b) => b.id === bid);
      if (item) {
        item.minutes = Math.max(0, Number(minInput.value) || 0);
        updateTimeBuilderBadgesDOM();
      }
      return;
    }
    const labelInput = e.target.closest('[data-tb-label]');
    if (labelInput) {
      const bid = labelInput.dataset.tbLabel;
      const item = calTimeBlocks.find((b) => b.id === bid);
      if (item) {
        item.label = labelInput.value;
      }
      return;
    }
    if (e.target.id === 'sched-time' || e.target.id === 'sched-duration') {
      syncCalendarDraftFromDOM();
      updateTimeBuilderBadgesDOM();
      return;
    }
    if (e.target.id === 'sched-unit' || e.target.id === 'sched-memo') {
      syncCalendarDraftFromDOM();
    }
  });
  $('#calendar-body')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    // 次回予定メモ欄（#sched-memo / #edit-sched-memo）では通常のEnterキーは「改行」として動作させる
    if (e.target.id === 'sched-unit') {
      e.preventDefault();
      $('#btn-add-schedule')?.click();
    } else if (e.target.id === 'edit-sched-unit' && editingScheduleId) {
      e.preventDefault();
      $(`[data-sched-save="${editingScheduleId}"]`)?.click();
    }
  });
  $('#calendar-body')?.addEventListener('change', (e) => {
    if (e.target.id === 'edit-sched-student') {
      const editSt = getStudent(e.target.value) || getActiveStudent();
      const dl = $('#cal-edit-unit-datalist');
      if (dl && editSt) dl.innerHTML = buildUnitDatalistOptionsHtml(editSt);
      return;
    }
    const toggle = e.target.closest('[data-sched-toggle]');
    if (toggle) {
      const id = toggle.dataset.schedToggle;
      const sc = (state.schedules || []).find((x) => x.id === id);
      if (sc) {
        sc.done = toggle.checked;
        if (sc.done && isCurriculumUnitKey(sc.unitKey)) {
          const curLv = getProg(sc.studentId, sc.unitKey).level;
          setLevel(sc.studentId, sc.unitKey, curLv < 3 ? 3 : curLv, sc.date);
        }
        save();
        renderAll();
        toast(sc.done ? '✅ 授業を実施済みにしました' : '未実施に戻しました');
      }
    }
  });

  // グローバル生徒切り替え（切り替え前の生徒のカルテ編集内容を確実に保存してから切り替え）
  $('#global-student').addEventListener('change', () => {
    switchActiveStudent($('#global-student').value);
  });

  // ヘッダーの「＋ 生徒追加」ボタン
  $('#btn-header-add-student')?.addEventListener('click', promptQuickAddStudent);

  // カルテへの日付見出し挿入 ＆ 目標バッジクリック ＆ カレンダーへ移動ボタン
  $('#btn-insert-date-header')?.addEventListener('click', insertTodayHeaderToCarte);
  $('#home-goal-badge')?.addEventListener('click', () => {
    const st = getActiveStudent();
    if (!st) return;
    saveInlineDocEdits(st.id);
    activeDocTabByStudent[st.id] = TAB_GOAL_TODO;
    renderHome();
  });
  $('#btn-jump-calendar')?.addEventListener('click', () => {
    $$('.m-nav-btn').forEach((x) => x.classList.toggle('active', x.dataset.mview === 'calendar'));
    showView('calendar');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // 右カード上部：「🔥 復習すべき単元」への自由記入追加（ボタン ＆ Enterキー）
  const addManualReviewItem = () => {
    const st = getActiveStudent();
    if (!st) return;
    const input = $('#input-manual-review');
    const val = input?.value.trim();
    if (!val) {
      toast('復習したい単元・内容を入力してください');
      return;
    }
    state.manualReviews ||= {};
    state.manualReviews[st.id] ||= [];
    state.manualReviews[st.id].unshift({ id: uid(), text: val });
    input.value = '';
    save();
    renderHome();
    toast(`📌「${val}」を復習すべき単元に追加しました！`);
  };
  $('#btn-add-manual-review')?.addEventListener('click', addManualReviewItem);
  $('#input-manual-review')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addManualReviewItem();
    }
  });

  // 右カード下部：直近の授業予定からの「✓ 済」更新 ＆ カレンダー編集画面へのジャンプ
  $('#home-upcoming-schedules')?.addEventListener('click', (e) => {
    const doneBtn = e.target.closest('[data-upcoming-done]');
    if (doneBtn) {
      const id = doneBtn.dataset.upcomingDone;
      const sc = (state.schedules || []).find((x) => x.id === id);
      if (sc) {
        sc.done = true;
        if (isCurriculumUnitKey(sc.unitKey)) {
          const curLv = getProg(sc.studentId, sc.unitKey).level;
          setLevel(sc.studentId, sc.unitKey, curLv < 3 ? 3 : curLv, sc.date || today());
        }
        save();
        renderAll();
        toast('✅ 授業予定を実施済みにしました！');
      }
      return;
    }

    const editJump = e.target.closest('[data-upcoming-edit]');
    if (editJump) {
      const id = editJump.dataset.upcomingEdit;
      const sc = (state.schedules || []).find((x) => x.id === id);
      if (sc && sc.date) {
        const dParts = sc.date.split('-');
        if (dParts.length === 3) {
          calYear = Number(dParts[0]);
          calMonth = Number(dParts[1]) - 1;
          calSelectedDate = sc.date;
        }
      }
      showView('calendar');
      startEditingSchedule(id);
    }
  });

  // カルテ入力欄の自動保存 ＆ カルテ内キーワード検索 ＆ 「🎯 目標・やること」タブ操作
  $('#home-drive-content')?.addEventListener('input', (e) => {
    if (e.target.id === 'carte-search-input') {
      currentCarteSearchQuery = e.target.value;
      renderCarteSearchResults(getActiveStudent());
      return;
    }
    saveInlineDocEdits(state.currentStudentId);
    const st = getActiveStudent();
    if (st && (e.target.id === 'exam-goal-title' || e.target.id === 'exam-goal-date' || e.target.id === 'exam-weekly-sessions')) {
      updateGoalBadgeDOM(getExamPlanForStudent(st));
    }
    if (currentCarteSearchQuery.trim()) {
      renderCarteSearchResults(st);
    }
  });

  $('#home-drive-content')?.addEventListener('change', (e) => {
    const todoCb = e.target.closest('[data-goal-todo-idx]');
    if (todoCb) {
      const st = getActiveStudent();
      if (!st) return;
      const plan = getExamPlanForStudent(st);
      const idx = Number(todoCb.dataset.goalTodoIdx);
      if (plan.todos[idx]) {
        plan.todos[idx].done = todoCb.checked;
        save();
        renderHome();
      }
    }
  });

  $('#home-drive-content')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'input-goal-todo') {
      e.preventDefault();
      $('#btn-add-goal-todo')?.click();
    }
  });

  $('#home-drive-content')?.addEventListener('click', (e) => {
    const searchHit = e.target.closest('[data-search-jump-tab]');
    if (searchHit) {
      saveInlineDocEdits(state.currentStudentId);
      const st = getActiveStudent();
      if (!st) return;
      const targetTab = searchHit.dataset.searchJumpTab;
      const kw = searchHit.dataset.searchKw || '';
      activeDocTabByStudent[st.id] = targetTab;
      renderHome();
      const ta = $('#edit-drive-tab-body');
      if (ta && kw) {
        ta.focus();
        const idx = ta.value.toLowerCase().indexOf(kw.toLowerCase());
        if (idx >= 0) {
          ta.setSelectionRange(idx, idx + kw.length);
        }
      }
      return;
    }

    const pill = e.target.closest('[data-doc-tab]');
    if (pill) {
      saveInlineDocEdits(state.currentStudentId);
      const st = getActiveStudent();
      if (!st) return;
      activeDocTabByStudent[st.id] = pill.dataset.docTab;
      renderHome();
      return;
    }

    // 「🎯 目標・やること」タブ内のToDo追加・編集・削除・完了片付け
    if (e.target.closest('#btn-add-goal-todo')) {
      const st = getActiveStudent();
      if (!st) return;
      const input = $('#input-goal-todo');
      const val = input?.value.trim();
      if (!val) {
        toast('追加する目標・やることを入力してください');
        return;
      }
      const plan = getExamPlanForStudent(st);
      plan.todos.push({ id: uid(), text: val, done: false });
      save();
      renderHome();
      $('#input-goal-todo')?.focus();
      toast('📌 目標・やることリストに追加しました！');
      return;
    }

    if (e.target.closest('#btn-clear-done-todos')) {
      const st = getActiveStudent();
      if (!st) return;
      const plan = getExamPlanForStudent(st);
      const before = plan.todos.length;
      plan.todos = plan.todos.filter((t) => !t.done);
      save();
      renderHome();
      toast(`🧹 完了した項目（${before - plan.todos.length}件）を片付けました`);
      return;
    }

    const editTodoBtn = e.target.closest('[data-edit-goal-todo]');
    if (editTodoBtn) {
      const st = getActiveStudent();
      if (!st) return;
      const plan = getExamPlanForStudent(st);
      const idx = Number(editTodoBtn.dataset.editGoalTodo);
      if (plan.todos[idx]) {
        const nextText = prompt('目標・やることの文面を編集：', plan.todos[idx].text);
        if (nextText !== null && nextText.trim()) {
          plan.todos[idx].text = nextText.trim();
          save();
          renderHome();
          toast('✏️ 文面を更新しました');
        }
      }
      return;
    }

    const delTodoBtn = e.target.closest('[data-del-goal-todo]');
    if (delTodoBtn) {
      const st = getActiveStudent();
      if (!st) return;
      const plan = getExamPlanForStudent(st);
      const idx = Number(delTodoBtn.dataset.delGoalTodo);
      if (plan.todos[idx]) {
        plan.todos.splice(idx, 1);
        save();
        renderHome();
      }
      return;
    }

    if (e.target.closest('#btn-add-doc-tab')) {
      saveInlineDocEdits(state.currentStudentId);
      const st = getActiveStudent();
      if (!st) return;
      const newTabName = prompt('追加するタブ名を入力してください（例：期末対策、宿題記録）');
      if (!newTabName || !newTabName.trim()) return;
      const driveInfo = getDriveInfoForStudent(st);
      driveInfo.tabs[newTabName.trim()] = `【${newTabName.trim()}】\n`;
      activeDocTabByStudent[st.id] = newTabName.trim();
      save();
      renderHome();
      return;
    }
    if (e.target.closest('#btn-del-doc-tab')) {
      const st = getActiveStudent();
      if (!st) return;
      const driveInfo = getDriveInfoForStudent(st);
      const curTab = activeDocTabByStudent[st.id];
      if (!curTab || curTab === TAB_REFLECTION || curTab === TAB_NEXT_PLAN || curTab === TAB_GOAL_TODO) return;
      if (!confirm(`カスタムタブ「${curTab}」を削除しますか？`)) return;
      delete driveInfo.tabs[curTab];
      activeDocTabByStudent[st.id] = TAB_REFLECTION;
      save();
      renderHome();
      toast(`🗑 タブ「${curTab}」を削除しました`);
    }
  });

  // 復習おすすめ単元からのアクション（自由記入の完了・編集 ＆ 自動抽出単元の復習済更新）
  $('#home-recommend-units')?.addEventListener('click', (e) => {
    const st = getActiveStudent();
    if (!st) return;

    const manualDoneBtn = e.target.closest('[data-rec-manual-done]');
    if (manualDoneBtn) {
      const mid = manualDoneBtn.dataset.recManualDone;
      const list = state.manualReviews?.[st.id] || [];
      const item = list.find((x) => x.id === mid);
      if (item) {
        // もし自由記入のテキストが単元マップの単元と一致していれば学習日も今日に更新
        const resolved = resolveScheduleUnitInput(st, item.text);
        if (isCurriculumUnitKey(resolved)) {
          const curLv = getProg(st.id, resolved).level;
          setLevel(st.id, resolved, curLv < 3 ? 3 : curLv, today());
        }
        state.manualReviews[st.id] = list.filter((x) => x.id !== mid);
        save();
        renderAll();
        toast(`✅「${item.text}」を復習済みにしました！`);
      }
      return;
    }

    const manualEditBtn = e.target.closest('[data-rec-manual-edit]');
    if (manualEditBtn) {
      const mid = manualEditBtn.dataset.recManualEdit;
      const list = state.manualReviews?.[st.id] || [];
      const item = list.find((x) => x.id === mid);
      if (item) {
        const nextText = prompt('復習内容を編集：', item.text);
        if (nextText !== null && nextText.trim()) {
          item.text = nextText.trim();
          save();
          renderHome();
          toast('✏️ 復習内容を更新しました');
        }
      }
      return;
    }

    const markDoneBtn = e.target.closest('[data-rec-mark-done]');
    if (markDoneBtn) {
      const key = markDoneBtn.dataset.recMarkDone;
      const [, , uName] = key.split('|');
      const curLv = getProg(st.id, key).level;
      const nextLv = curLv < 3 ? 3 : curLv;
      setLevel(st.id, key, nextLv, today());
      save();
      renderAll();
      toast(`✅「${uName}」を今日復習済みに更新しました（理解度：${LEVEL_LABEL[nextLv]}）`);
      return;
    }

    const chip = e.target.closest('[data-rec-open-picker]');
    if (chip) {
      selectedPickerUnitKey = chip.dataset.recOpenPicker;
      const homeSec = $('#view-home');
      if (homeSec) homeSec.dataset.msection = 'units';
      $$('.m-nav-btn').forEach((x) => x.classList.toggle('active', x.dataset.mview === 'units'));
      renderHomeUnitMap();
      $('#section-unit-map')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });

  // 単元クイックピッカー（1タップで未/×/△/○/◎変更 ＆ 今日日付更新 ＆ 単元削除）
  $('#unit-quick-picker')?.addEventListener('click', (e) => {
    const st = getActiveStudent();
    if (!st || !selectedPickerUnitKey) return;

    if (e.target.closest('#btn-close-unit-picker')) {
      selectedPickerUnitKey = null;
      renderHomeUnitMap();
      return;
    }

    const lvBtn = e.target.closest('[data-pick-level]');
    if (lvBtn) {
      const lv = Number(lvBtn.dataset.pickLevel);
      const [, , uName] = selectedPickerUnitKey.split('|');
      setLevel(st.id, selectedPickerUnitKey, lv, today());
      save();
      renderHome();
      toast(`✅「${uName}」を「${LEVEL_DESC[lv]}」に更新しました（学習日：今日）`);
      return;
    }

    const delUnitBtn = e.target.closest('[data-picker-del-unit]');
    if (delUnitBtn) {
      const [gName, subj, uName] = selectedPickerUnitKey.split('|');
      if (!confirm(`単元「${gName}｜${subj}：${uName}」を単元マップから削除しますか？`)) return;
      state.deletedUnitKeys ||= [];
      if (!state.deletedUnitKeys.includes(selectedPickerUnitKey)) {
        state.deletedUnitKeys.push(selectedPickerUnitKey);
      }
      state.customUnits = (state.customUnits || []).filter(
        (cu) => `${cu.grade}|${cu.subject}|${cu.unit}` !== selectedPickerUnitKey
      );
      selectedPickerUnitKey = null;
      save();
      renderHome();
      toast(`🗑 単元「${uName}」を削除しました`);
    }
  });

  // カスタム単元の自由追加（ボタン ＆ Enterキー対応）
  $('#custom-unit-name')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      $('#btn-add-custom-unit')?.click();
    }
  });
  $('#btn-add-custom-unit')?.addEventListener('click', () => {
    const st = getActiveStudent();
    const grade = $('#custom-unit-grade')?.value || st?.grade || '中3';
    const subject = $('#custom-unit-subj')?.value.trim() || '数学';
    const unit = $('#custom-unit-name')?.value.trim();
    if (!unit) {
      toast('追加する単元名を入力してください');
      return;
    }
    const key = `${grade}|${subject}|${unit}`;
    state.deletedUnitKeys = (state.deletedUnitKeys || []).filter((k) => k !== key);
    state.customUnits ||= [];
    if (!state.customUnits.some((cu) => cu.grade === grade && cu.subject === subject && cu.unit === unit)) {
      state.customUnits.push({ grade, subject, unit });
    }
    $('#custom-unit-name').value = '';
    selectedPickerUnitKey = key;
    save();
    renderHome();
    toast(`＋ 単元「${grade}｜${subject}：${unit}」を追加しました！`);
  });

  $('#unit-filter-pills')?.addEventListener('click', onUnitFilterClick);
  $('#unit-subject-pills')?.addEventListener('click', onUnitSubjFilterClick);
  $('#home-unit-map')?.addEventListener('click', onHomeUnitMapClick);

  $('#btn-privacy-toggle')?.addEventListener('click', () => {
    state.privacyMode = !state.privacyMode;
    save();
    toast(state.privacyMode ? '🔒 プライバシー保護モードON（生徒名をイニシャル表示）' : '🔓 通常表示モード');
    renderAll();
  });

  // 生徒追加（ボタン ＆ Enterキー対応）
  ['#st-name', '#st-memo'].forEach((sel) => {
    $(sel)?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        $('#btn-add-student')?.click();
      }
    });
  });
  $('#btn-add-student')?.addEventListener('click', () => {
    const name = $('#st-name').value.trim();
    const grade = $('#st-grade').value;
    const memo = $('#st-memo').value.trim();
    if (!name) { toast('生徒名を入力してください'); return; }
    const st = { id: uid(), name, grade, memo };
    state.students.push(st);
    state.currentStudentId = st.id;
    getDriveInfoForStudent(st);
    getExamPlanForStudent(st);
    save();
    $('#st-name').value = '';
    $('#st-memo').value = '';
    renderAll();
    toast(`＋「${name}」さんを追加しました（専用カルテ作成・自動保存済み）`);
  });

  $('#student-manage-list')?.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit-st]');
    if (editBtn) {
      const sid = editBtn.dataset.editSt;
      const st = getStudent(sid);
      if (!st) return;
      const newName = prompt('生徒の氏名を入力してください：', st.name);
      if (newName === null) return;
      const newGrade = prompt('学年を入力してください（中1 / 中2 / 中3 / 高1 / 高2 / 高3）：', st.grade);
      if (newGrade === null) return;
      const newMemo = prompt('使用教材・目標メモを入力してください：', st.memo || '');
      if (newMemo === null) return;
      st.name = newName.trim() || st.name;
      if (['中1', '中2', '中3', '高1', '高2', '高3'].includes(newGrade.trim())) {
        st.grade = newGrade.trim();
      }
      st.memo = newMemo.trim();
      if (state.driveDocs?.[st.id]) {
        state.driveDocs[st.id].docTitle = `${st.name} カルテ`;
        if (st.memo) state.driveDocs[st.id].textbook = st.memo;
      }
      save();
      renderAll();
      toast(`✏️「${st.name}」さんの情報を更新・保存しました`);
      return;
    }

    const btn = e.target.closest('[data-del-st]');
    if (!btn) return;
    const sid = btn.dataset.delSt;
    const st = getStudent(sid);
    if (!confirm(`本当に「${st?.name}」さんを削除しますか？`)) return;
    state.students = state.students.filter((s) => s.id !== sid);
    if (state.driveDocs) delete state.driveDocs[sid];
    if (state.examPlans) delete state.examPlans[sid];
    if (state.progress) delete state.progress[sid];
    if (state.manualReviews) delete state.manualReviews[sid];
    state.schedules = (state.schedules || []).filter((sc) => sc.studentId !== sid);
    if (state.students.length === 0) {
      loadDefaultGenericStudents(true);
    } else if (state.currentStudentId === sid) {
      state.currentStudentId = state.students[0]?.id || '';
    }
    save();
    renderAll();
    toast('生徒を削除しました');
  });

  $('#btn-export')?.addEventListener('click', exportJson);
  $('#file-import')?.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (f) importData(await f.text());
    e.target.value = '';
  });
  $('#btn-restore-five')?.addEventListener('click', () => {
    if (!confirm('5生徒（土岐芽生さん・藤田湊空くん・遠藤快音くん・藤田渚岬くん・保科篤輝くん）のカルテデータを読み込みますか？')) return;
    loadDefaultGenericStudents(false);
  });
  $('#btn-reset')?.addEventListener('click', () => {
    if (!confirm('本当に全データを初期状態に戻しますか？')) return;
    state = freshState();
    loadDefaultGenericStudents(true);
    save();
    renderAll();
    toast('データを初期状態に戻しました');
  });

  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
