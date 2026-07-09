import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import Papa from "papaparse";

// ── Constants ────────────────────────────────────────────
const STORAGE_KEY = "budget-manager-v3";
const COLORS = ["#5B8A72","#C9A227","#9C4A3C","#3E7C74","#8B6DB0","#C97B3A","#5A7FA5","#D4756B","#6BAA75","#B8964E","#7A6B8A","#4A90A0"];

const DEFAULT_CATEGORIES = [
  { id: "rent", name: "Rent/Mortgage", type: "fixed", budget: 0 },
  { id: "utilities", name: "Utilities", type: "fixed", budget: 0 },
  { id: "insurance", name: "Insurance", type: "fixed", budget: 0 },
  { id: "phone", name: "Phone", type: "fixed", budget: 0 },
  { id: "subscriptions", name: "Subscriptions", type: "fixed", budget: 0 },
  { id: "groceries", name: "Groceries", type: "variable", budget: 0 },
  { id: "dining", name: "Dining Out", type: "variable", budget: 0 },
  { id: "gas", name: "Gas", type: "variable", budget: 0 },
  { id: "shopping", name: "Shopping", type: "variable", budget: 0 },
  { id: "leisure", name: "Leisure", type: "variable", budget: 0 },
  { id: "personal", name: "Personal Care", type: "variable", budget: 0 },
  { id: "misc", name: "Misc", type: "variable", budget: 0 },
];

const DEFAULT_RULES = [
  { id: "r1", keywords: "rent,mortgage,landlord", categoryId: "rent" },
  { id: "r2", keywords: "electric,gas bill,water,eversource,ngrid,national grid,unitil", categoryId: "utilities" },
  { id: "r3", keywords: "netflix,spotify,hulu,disney,amazon prime,apple.com/bill,youtube,crunchyroll,twitch,discord,prime video,steamgames,doordash,grubhub", categoryId: "subscriptions" },
  { id: "r4", keywords: "chipotle,mcdonald,dunkin,starbucks,pizza,burger,taco bell,taco,subway,wendy,restaurant,cafe,diner,chick-fil-a,wingstop,sushi,fancy bagels,bagel cafe,jgilbert,wong wok,longboard bur,haya", categoryId: "dining" },
  { id: "r5", keywords: "stop shop,shaws,market,whole foods,aldi,walmart,hannaford,trader joe,price chopper,big y,ocean state,tractor supply,ondrick natural earth", categoryId: "groceries" },
  { id: "r6", keywords: "shell,sunoco,mobil,bp,citgo,exxon,gulf,cumberland,irving,gas station,pride station", categoryId: "gas" },
  { id: "r7", keywords: "amazon,target,tj maxx,marshalls,kohls,home depot,lowes,bestbuy,bobs sports,rufe", categoryId: "shopping" },
  { id: "r8", keywords: "travelers,geico,progressive,allstate,state farm,per insur", categoryId: "insurance" },
  { id: "r9", keywords: "crossover fitness,best abc,best fitness,planet fitness,gym,ymca,anytime fitness,crunch fitness", categoryId: "leisure" },
  { id: "r10", keywords: "capital one,venmo,ally,car payment,loan payment,mobile pmt", categoryId: "misc" },
  { id: "r11", keywords: "grape ape,vape,smoke,tobacco,cigarette", categoryId: "personal" },
  { id: "r12", keywords: "car wash,washville,auto wash", categoryId: "personal" },
  { id: "r13", keywords: "otis ridge,ski area,ski resort,mountain,lift ticket", categoryId: "leisure" },
  { id: "r14", keywords: "pioneer vtc,memorial ft in,atm,withdrwl,withdrawal", categoryId: "misc" },
  { id: "r15", keywords: "o'reilly,autozone,napa auto,advance auto,pep boys,jiffy lube", categoryId: "misc" },
  { id: "r16", keywords: "b d mart,bd mart,convenience,corner store,7-eleven,cumberland farms", categoryId: "groceries" },
  { id: "r17", keywords: "fine fettle,dispensary,cannabis,weed", categoryId: "personal" },
  { id: "r18", keywords: "sp the cutting edge,hair,salon,barber,spa,nail", categoryId: "personal" },
];

const ACHIEVEMENTS = [
  { id: "first_income", title: "Income Set", desc: "Added your first income source" },
  { id: "first_tx", title: "First Log", desc: "Logged your first transaction manually" },
  { id: "csv_import", title: "CSV Pro", desc: "Imported transactions from a CSV file" },
  { id: "tx_50", title: "Tracking Champ", desc: "Logged 50+ transactions" },
  { id: "all_budgets", title: "Budget Ready", desc: "Set budgets for all spending categories" },
  { id: "budget_month", title: "On Budget", desc: "Stayed under total budget for a full month" },
  { id: "budget_streak", title: "Budget Streak", desc: "Under budget 3 months in a row" },
  { id: "save_20pct", title: "20% Club", desc: "Saved 20%+ of income in a month" },
  { id: "save_30pct", title: "30% Club", desc: "Saved 30%+ of income in a month" },
  { id: "first_goal", title: "Goal Setter", desc: "Created your first savings goal" },
  { id: "first_deposit", title: "First Deposit", desc: "Made your first savings deposit" },
  { id: "goal_25", title: "Quarter Way", desc: "Reached 25% on any savings goal" },
  { id: "goal_50", title: "Halfway There", desc: "Reached 50% on any savings goal" },
  { id: "goal_100", title: "Goal Crusher", desc: "Fully funded a savings goal" },
  { id: "goals_3", title: "Serial Saver", desc: "Fully funded 3 savings goals" },
  { id: "emergency_fund", title: "Safety Net", desc: "Saved 3 months of income as an emergency fund" },
  { id: "first_debt", title: "Debt Fighter", desc: "Started tracking a debt to pay off" },
];

// ── Helpers ───────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = (n) => (n || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
const pct = (a, b) => b === 0 ? 0 : Math.round((a / b) * 100);
const monthKey = (d) => d ? d.slice(0, 7) : "";
const todayStr = () => new Date().toISOString().slice(0, 10);
const curMonth = () => todayStr().slice(0, 7);
const monthLabel = (m) => { const [y, mo] = m.split("-"); return new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString("en-US", { month: "short", year: "numeric" }); };
const monthLabelLong = (m) => { const [y, mo] = m.split("-"); return new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }); };
const shiftMonthStr = (m, d) => { const [y, mo] = m.split("-").map(Number); const dt = new Date(y, mo - 1 + d); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`; };
const last6Months = (m) => Array.from({ length: 6 }, (_, i) => shiftMonthStr(m, -(5 - i)));

function getDefaultState() {
  return { incomes: [], categories: DEFAULT_CATEGORIES, transactions: [], savings: [], debts: [], rules: DEFAULT_RULES, recurring: [], achievements: [], csvImported: false };
}

function getMonthlyIncome(incomes) {
  return incomes.reduce((s, i) => {
    if (i.frequency === "weekly") return s + i.amount * 4.33;
    if (i.frequency === "biweekly") return s + i.amount * 2.17;
    return s + i.amount;
  }, 0);
}

function calcPayoff(balance, rate, monthly) {
  if (monthly <= 0 || balance <= 0) return { text: "N/A", months: Infinity, interest: 0 };
  if (rate === 0) { const m = Math.ceil(balance / monthly); return { text: `${m} months`, months: m, interest: 0 }; }
  const mr = rate / 100 / 12;
  const interest = balance * mr;
  if (monthly <= interest) return { text: "Never (payment < interest)", months: Infinity, interest: Infinity };
  const months = Math.ceil(-Math.log(1 - (balance * mr) / monthly) / Math.log(1 + mr));
  if (isNaN(months) || months < 0) return { text: "N/A", months: Infinity, interest: 0 };
  const totalInterest = (monthly * months) - balance;
  const years = Math.floor(months / 12); const rem = months % 12;
  return { text: `${years > 0 ? `${years}y ${rem}m` : `${rem} months`} (${fmt(totalInterest)} interest)`, months, interest: totalInterest };
}

function autoCategory(desc, rules, categories) {
  if (!desc) return null;
  const d = desc.toLowerCase();
  for (const rule of rules) {
    const kws = rule.keywords.split(",").map(k => k.trim().toLowerCase()).filter(Boolean);
    if (kws.some(k => d.includes(k))) {
      const cat = categories.find(c => c.id === rule.categoryId);
      if (cat) return cat;
    }
  }
  return null;
}

function analyzeFinances(data, month) {
  const tips = [];
  const income = getMonthlyIncome(data.incomes);
  const txs = data.transactions.filter(t => monthKey(t.date) === month && t.type !== "income");
  const spent = txs.reduce((s, t) => s + t.amount, 0);
  const cSpend = {};
  data.categories.forEach(c => { cSpend[c.id] = 0; });
  txs.forEach(t => { cSpend[t.categoryId] = (cSpend[t.categoryId] || 0) + t.amount; });

  if (income === 0) { tips.push({ type: "setup", msg: "No income set up yet. Head to the Budget tab and add your income sources." }); return tips; }

  const fixedSpend = data.categories.filter(c => c.type === "fixed").reduce((s, c) => s + (cSpend[c.id] || 0), 0);
  const varSpend = data.categories.filter(c => c.type === "variable").reduce((s, c) => s + (cSpend[c.id] || 0), 0);
  const fixedPct = Math.round((fixedSpend / income) * 100);
  const varPct = Math.round((varSpend / income) * 100);
  const savedPct = Math.max(0, Math.round(((income - spent) / income) * 100));

  if (fixedPct > 50) tips.push({ type: "warning", msg: `Fixed expenses are ${fixedPct}% of income (target: under 50%). Bills are eating more than half your paycheck.` });
  if (varPct > 30) tips.push({ type: "warning", msg: `Variable spending is ${varPct}% of income (target: under 30%).` });
  if (savedPct < 20 && spent > 0) tips.push({ type: "warning", msg: `Saving roughly ${savedPct}% of income (target: 20%+). ${fmt(income - spent)} left over this month.` });
  if (savedPct >= 20) tips.push({ type: "good", msg: `Saving ${savedPct}% of income -- at or above the 20% target.` });

  data.categories.filter(c => c.budget > 0 && (cSpend[c.id] || 0) > c.budget).forEach(c => {
    tips.push({ type: "over", msg: `${c.name}: ${fmt((cSpend[c.id] || 0) - c.budget)} over budget. Spent ${fmt(cSpend[c.id])} vs ${fmt(c.budget)}.` });
  });

  const zeroBudget = data.categories.filter(c => c.budget === 0 && (cSpend[c.id] || 0) > 0);
  if (zeroBudget.length > 0) tips.push({ type: "setup", msg: `${zeroBudget.length} categories have spending but no budget: ${zeroBudget.map(c => c.name).join(", ")}.` });

  const totalSaved = data.savings.reduce((s, g) => s + g.saved, 0);
  const threeMonths = income * 3;
  if (totalSaved < threeMonths) tips.push({ type: "goal", msg: `Emergency fund: ${fmt(totalSaved)} of ${fmt(threeMonths)} target (3 months expenses). ${totalSaved === 0 ? "Start here first." : `${fmt(threeMonths - totalSaved)} to go.`}` });

  // Goal pace check
  data.savings.forEach(g => {
    if (!g.targetDate || g.saved >= g.target) return;
    const monthsLeft = Math.max(1, Math.ceil((new Date(g.targetDate) - new Date()) / (1000 * 60 * 60 * 24 * 30)));
    const needed = (g.target - g.saved) / monthsLeft;
    tips.push({ type: "goal", msg: `"${g.name}": need ${fmt(needed)}/mo to hit ${fmt(g.target)} by ${g.targetDate}.` });
  });

  if (data.debts.length > 0) {
    const highRate = data.debts.filter(d => d.rate > 15).sort((a, b) => b.rate - a.rate);
    if (highRate.length > 0) tips.push({ type: "debt", msg: `High-interest debt: ${highRate.map(d => `${d.name} at ${d.rate}%`).join(", ")}. Prioritize these (avalanche method).` });
    data.debts.filter(d => d.rate > 0 && (d.minPayment + d.extraPayment) <= (d.balance * d.rate / 100 / 12)).forEach(d => {
      tips.push({ type: "danger", msg: `${d.name}: payment doesn't cover monthly interest. Balance is growing.` });
    });
  }

  if (tips.length === 0 && spent > 0) tips.push({ type: "good", msg: "Numbers look clean this month. Keep logging." });
  return tips;
}

function checkAchievements(data) {
  const earned = new Set((data.achievements || []).map(a => a.id));
  const newIds = [];
  const unlock = (id) => { if (!earned.has(id)) { earned.add(id); newIds.push(id); } };

  if (data.incomes.length > 0) unlock("first_income");

  const manualTxs = (data.transactions || []).filter(t => !t.fromRecurring && !t.isSavingsDeposit);
  if (manualTxs.length > 0) unlock("first_tx");
  if (manualTxs.length >= 50) unlock("tx_50");

  if (data.csvImported) unlock("csv_import");

  const spendCats = (data.categories || []).filter(c => c.id !== "savings_deposit");
  if (spendCats.length > 0 && spendCats.every(c => c.budget > 0)) unlock("all_budgets");

  if ((data.savings || []).length > 0) unlock("first_goal");
  if ((data.transactions || []).some(t => t.isSavingsDeposit)) unlock("first_deposit");

  if ((data.savings || []).some(g => g.target > 0 && g.saved >= g.target * 0.25)) unlock("goal_25");
  if ((data.savings || []).some(g => g.target > 0 && g.saved >= g.target * 0.5)) unlock("goal_50");
  const completedGoals = (data.savings || []).filter(g => g.target > 0 && g.saved >= g.target);
  if (completedGoals.length > 0) unlock("goal_100");
  if (completedGoals.length >= 3) unlock("goals_3");

  if ((data.debts || []).length > 0) unlock("first_debt");

  const income = getMonthlyIncome(data.incomes);
  const totalSaved = (data.savings || []).reduce((s, g) => s + g.saved, 0);
  if (income > 0 && totalSaved >= income * 3) unlock("emergency_fund");

  const months = [...new Set((data.transactions || []).map(t => monthKey(t.date)))].filter(Boolean).sort();
  const totalBudget = (data.categories || []).reduce((s, c) => s + c.budget, 0);
  let streak = 0;
  months.forEach(m => {
    const txs = (data.transactions || []).filter(t => monthKey(t.date) === m && t.type !== "income");
    const spent = txs.reduce((s, t) => s + t.amount, 0);
    if (income > 0) {
      const savedPct = (income - spent) / income;
      if (savedPct >= 0.2) unlock("save_20pct");
      if (savedPct >= 0.3) unlock("save_30pct");
    }
    if (totalBudget > 0 && spent <= totalBudget) {
      unlock("budget_month");
      streak++;
      if (streak >= 3) unlock("budget_streak");
    } else {
      streak = 0;
    }
  });

  return newIds;
}

// ── Design tokens ─────────────────────────────────────────
const C = {
  bg: "#0A0A0A",
  surface: "#141414",
  surfaceHigh: "#1E1E1E",
  border: "#2A2A2A",
  green: "#22C55E",
  greenDim: "#14532D",
  blue: "#3B82F6",
  blueDim: "#1E3A8A",
  red: "#EF4444",
  redDim: "#7F1D1D",
  amber: "#F59E0B",
  text: "#F1F5F9",
  textMid: "#94A3B8",
  textDim: "#7A8FA6",
};

// ── Styles ────────────────────────────────────────────────
const S = {
  root: { fontFamily: "'Inter', -apple-system, sans-serif", background: C.bg, color: C.text, minHeight: "100vh" },
  wrap: { maxWidth: 640, margin: "0 auto", padding: "0 0 80px" },
  hdr: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 16px 0", marginBottom: 4 },
  h1: { fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: "-0.03em", color: C.text },
  monthNav: { display: "flex", alignItems: "center", gap: 6 },
  mBtn: { background: C.surfaceHigh, border: "none", color: C.textMid, borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 14, fontFamily: "inherit" },
  mLbl: { fontSize: 13, color: C.textMid, minWidth: 110, textAlign: "center", fontFamily: "monospace" },
  bottomNav: { position: "fixed", bottom: 0, left: 0, right: 0, background: C.surface, borderTop: "1px solid " + C.border, display: "flex", zIndex: 100 },
  navItem: (a) => ({ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "10px 0 12px", cursor: "pointer", background: "none", border: "none", color: a ? C.green : C.textDim, fontFamily: "inherit", gap: 3, transition: "color 0.15s" }),
  navLabel: (a) => ({ fontSize: 10, fontWeight: a ? 600 : 400, letterSpacing: "0.02em" }),
  page: { padding: "12px 16px 0" },
  card: { background: C.surface, borderRadius: 12, padding: "14px 16px", marginBottom: 10, border: "1px solid " + C.border },
  cardFlush: { background: C.surface, borderRadius: 12, overflow: "hidden", marginBottom: 10, border: "1px solid " + C.border },
  cTitle: { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textDim, marginBottom: 10 },
  row: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" },
  inp: { background: C.surfaceHigh, border: "1px solid " + C.border, borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 15, fontFamily: "inherit", flex: 1, minWidth: 80 },
  inpSm: { background: C.surfaceHigh, border: "1px solid " + C.border, borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 15, fontFamily: "inherit", width: 105 },
  sel: { background: C.surfaceHigh, border: "1px solid " + C.border, borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 14, fontFamily: "inherit", minWidth: 110 },
  btn: { background: C.green, color: "#000", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  btnD: { background: C.red, color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" },
  btnG: { background: C.surfaceHigh, border: "none", color: C.textMid, borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  btnTeal: { background: C.blue, color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  tbl: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "8px 12px", borderBottom: "1px solid " + C.border, color: C.textDim, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" },
  td: { padding: "10px 12px", borderBottom: "1px solid " + C.border, color: C.textMid },
  statV: { fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 },
  statL: { fontSize: 11, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 4 },
  bar: { height: 6, borderRadius: 99, background: C.surfaceHigh, overflow: "hidden", marginTop: 6 },
  barF: (p, c) => ({ height: "100%", borderRadius: 99, background: c, width: String(Math.min(p, 100)) + "%", transition: "width 0.4s ease" }),
  overB: { display: "inline-block", background: C.redDim, color: C.red, fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, marginLeft: 6 },
  underB: { display: "inline-block", background: C.greenDim, color: C.green, fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, marginLeft: 6 },
  empty: { color: C.textDim, fontSize: 13, padding: "20px 0", textAlign: "center" },
  delBtn: { background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 15, padding: "2px 6px" },
  pbFloat: { position: "fixed", bottom: 72, right: 16, zIndex: 200 },
  pbBtn: { width: 52, height: 52, borderRadius: "50%", background: C.greenDim, border: "2px solid " + C.green, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 24px rgba(34,197,94,0.25)", transition: "transform 0.15s" },
  pbPanel: { position: "fixed", bottom: 134, right: 12, width: 320, maxWidth: "calc(100vw - 24px)", maxHeight: "65vh", background: C.surface, border: "1px solid " + C.border, borderRadius: 16, boxShadow: "0 8px 40px rgba(0,0,0,0.7)", display: "flex", flexDirection: "column", zIndex: 201 },
  pbHdr: { padding: "12px 14px", borderBottom: "1px solid " + C.border, display: "flex", justifyContent: "space-between", alignItems: "center" },
  pbBody: { flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 },
  pbInput: { display: "flex", gap: 6, padding: "10px 12px", borderTop: "1px solid " + C.border },
  pbMsg: (isUser) => ({ background: isUser ? C.surfaceHigh : C.greenDim + "88", padding: "9px 12px", borderRadius: isUser ? "12px 12px 4px 12px" : "12px 12px 12px 4px", fontSize: 13, lineHeight: 1.5, color: C.text, alignSelf: isUser ? "flex-end" : "flex-start", maxWidth: "88%", whiteSpace: "pre-wrap", wordBreak: "break-word" }),
  pbQuick: { display: "flex", flexWrap: "wrap", gap: 5, padding: "6px 12px 2px" },
  pbQBtn: { background: C.surfaceHigh, border: "none", color: C.textMid, borderRadius: 16, padding: "5px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" },
  tipCard: (type) => ({ padding: "10px 14px", borderRadius: 8, fontSize: 13, lineHeight: 1.5, background: type === "good" ? C.greenDim + "44" : type === "warning" || type === "over" ? "#78350F44" : type === "danger" ? C.redDim + "44" : C.blueDim + "44", borderLeft: "3px solid " + (type === "good" ? C.green : type === "warning" || type === "over" ? C.amber : type === "danger" ? C.red : C.blue), marginBottom: 8, color: C.text }),
};

// ── PaperBoy SVG ──────────────────────────────────────────
function PaperBoySVG({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <rect x="15" y="20" width="70" height="60" rx="6" fill="#85BB65" stroke="#3D6B35" strokeWidth="2" />
      <rect x="20" y="25" width="60" height="50" rx="3" fill="#6EA555" />
      <text x="50" y="58" textAnchor="middle" fill="#3D6B35" fontSize="28" fontWeight="bold" fontFamily="serif">$</text>
      <ellipse cx="38" cy="38" rx="5" ry="6" fill="white" />
      <ellipse cx="62" cy="38" rx="5" ry="6" fill="white" />
      <ellipse cx="39" cy="39" rx="2.5" ry="3" fill="#222" />
      <ellipse cx="63" cy="39" rx="2.5" ry="3" fill="#222" />
      <path d="M40 54 Q50 62 60 54" stroke="#3D6B35" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <ellipse cx="50" cy="22" rx="28" ry="8" fill="#4A3728" />
      <path d="M22 22 Q22 12 50 10 Q78 12 78 22" fill="#5C4433" />
      <rect x="22" y="19" width="56" height="5" rx="2" fill="#4A3728" />
      <path d="M30 19 Q28 10 50 7 Q72 10 70 19" fill="#6B5543" />
    </svg>
  );
}

// ── Achievement Toast ─────────────────────────────────────
function AchievementToast({ achievement, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 999, background: C.greenDim, border: "1px solid " + C.green, borderRadius: 12, padding: "12px 18px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 4px 24px rgba(34,197,94,0.3)", maxWidth: 320, animation: "none" }}>
      <span style={{ fontSize: 22 }}>🏆</span>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color: C.green }}>{achievement.title}</div>
        <div style={{ fontSize: 11, color: C.textMid, marginTop: 1 }}>{achievement.desc}</div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  MAIN APP
// ════════════════════════════════════════════════════════
export default function BudgetManager() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState(0);
  const [month, setMonth] = useState(curMonth());
  const [loading, setLoading] = useState(true);
  const [pbOpen, setPbOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const save = useCallback(async (nd) => {
    const newIds = checkAchievements(nd);
    let finalData = nd;
    if (newIds.length > 0) {
      const today = todayStr();
      const newAch = newIds.map(id => ({ id, unlockedAt: today }));
      finalData = { ...nd, achievements: [...(nd.achievements || []), ...newAch] };
      const def = ACHIEVEMENTS.find(a => a.id === newIds[0]);
      if (def) setToast(def);
    }
    setData(finalData);
    try { await window.storage.set(STORAGE_KEY, JSON.stringify(finalData)); } catch(e) { console.error(e); }
  }, []);

  // Auto-generate recurring transactions on load
  const generateRecurring = useCallback((d) => {
    if (!d.recurring || d.recurring.length === 0) return d;
    const now = curMonth();
    const existing = new Set(d.transactions.filter(t => t.fromRecurring).map(t => `${t.fromRecurring}-${monthKey(t.date)}`));
    const newTxs = [];
    d.recurring.forEach(r => {
      const key = `${r.id}-${now}`;
      if (!existing.has(key)) {
        const cat = d.categories.find(c => c.id === r.categoryId);
        newTxs.push({ id: uid(), date: `${now}-01`, amount: r.amount, categoryId: r.categoryId, categoryName: cat?.name || r.categoryId, description: r.name, fromRecurring: r.id });
      }
    });
    if (newTxs.length === 0) return d;
    return { ...d, transactions: [...d.transactions, ...newTxs] };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(STORAGE_KEY);
        if (r?.value) {
          const parsed = { ...getDefaultState(), ...JSON.parse(r.value) };
          const withRecurring = generateRecurring(parsed);
          setData(withRecurring);
          if (withRecurring !== parsed) {
            await window.storage.set(STORAGE_KEY, JSON.stringify(withRecurring));
          }
        } else { setData(getDefaultState()); }
      } catch { setData(getDefaultState()); }
      setLoading(false);
    })();
  }, [generateRecurring]);

  const shiftMonth = (d) => setMonth(shiftMonthStr(month, d));

  const monthTx = useMemo(() => data ? data.transactions.filter(t => monthKey(t.date) === month).sort((a, b) => b.date.localeCompare(a.date)) : [], [data, month]);
  const catSpend = useMemo(() => {
    if (!data) return {};
    const t = {}; data.categories.forEach(c => { t[c.id] = 0; });
    monthTx.filter(tx => tx.type !== "income").forEach(tx => { t[tx.categoryId] = (t[tx.categoryId] || 0) + tx.amount; });
    return t;
  }, [data, monthTx]);
  const totalSpent = useMemo(() => Object.values(catSpend).reduce((s, v) => s + v, 0), [catSpend]);
  const totalBudgeted = useMemo(() => data ? data.categories.reduce((s, c) => s + c.budget, 0) : 0, [data]);
  const totalIncome = useMemo(() => {
    if (!data) return 0;
    const manual = getMonthlyIncome(data.incomes);
    const deposits = monthTx.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
    return manual + deposits;
  }, [data, monthTx]);

  if (loading || !data) return <div style={{ ...S.root, display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}><p style={{ color: "#888" }}>Loading...</p></div>;

  // CRUD
  const addTx = (tx) => save({ ...data, transactions: [...data.transactions, { ...tx, id: uid() }] });
  const addTxBatch = (txs, isCSV = false) => save({ ...data, transactions: [...data.transactions, ...txs.map(t => ({ ...t, id: uid() }))], ...(isCSV ? { csvImported: true } : {}) });
  const delTx = (id) => save({ ...data, transactions: data.transactions.filter(t => t.id !== id) });
  const addInc = (i) => save({ ...data, incomes: [...data.incomes, { ...i, id: uid() }] });
  const delInc = (id) => save({ ...data, incomes: data.incomes.filter(i => i.id !== id) });
  const updCat = (id, u) => save({ ...data, categories: data.categories.map(c => c.id === id ? { ...c, ...u } : c) });
  const addCat = (c) => save({ ...data, categories: [...data.categories, { ...c, id: uid() }] });
  const delCat = (id) => save({ ...data, categories: data.categories.filter(c => c.id !== id) });
  const addSav = (g) => save({ ...data, savings: [...data.savings, { ...g, id: uid() }] });
  const updSav = (id, u) => save({ ...data, savings: data.savings.map(g => g.id === id ? { ...g, ...u } : g) });
  const delSav = (id) => save({ ...data, savings: data.savings.filter(g => g.id !== id) });
  // Savings deposit also logs a transaction
  const depositSav = (goal, amount) => {
    const tx = { id: uid(), date: todayStr(), amount, categoryId: "savings_deposit", categoryName: "Savings Deposit", description: `Deposit: ${goal.name}`, isSavingsDeposit: true };
    save({ ...data, savings: data.savings.map(g => g.id === goal.id ? { ...g, saved: g.saved + amount } : g), transactions: [...data.transactions, tx] });
  };
  const addDbt = (d) => save({ ...data, debts: [...data.debts, { ...d, id: uid() }] });
  const updDbt = (id, u) => save({ ...data, debts: data.debts.map(d => d.id === id ? { ...d, ...u } : d) });
  const delDbt = (id) => save({ ...data, debts: data.debts.filter(d => d.id !== id) });
  const addRule = (r) => save({ ...data, rules: [...(data.rules || []), { ...r, id: uid() }] });
  const delRule = (id) => save({ ...data, rules: (data.rules || []).filter(r => r.id !== id) });
  const addRecurring = (r) => save({ ...data, recurring: [...(data.recurring || []), { ...r, id: uid() }] });
  const delRecurring = (id) => save({ ...data, recurring: (data.recurring || []).filter(r => r.id !== id) });

  // Nav icons as SVG inline
  const NAV = [
    { label: "Home", icon: (a) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a ? C.green : C.textDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
    { label: "Txns", icon: (a) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a ? C.green : C.textDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
    { label: "Budget", icon: (a) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a ? C.green : C.textDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> },
    { label: "Goals", icon: (a) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a ? C.green : C.textDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> },
    { label: "Trends", icon: (a) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a ? C.green : C.textDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
  ];

  return (
    <div style={S.root}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={S.wrap}>
        <div style={S.hdr}>
          <h1 style={S.h1}>PaperBoy Central</h1>
          <div style={S.monthNav}>
            <button style={S.mBtn} onClick={() => shiftMonth(-1)}>&#8249;</button>
            <span style={S.mLbl}>{monthLabelLong(month)}</span>
            <button style={S.mBtn} onClick={() => shiftMonth(1)}>&#8250;</button>
          </div>
        </div>

        <div style={S.page}>
          {tab === 0 && <Dashboard data={data} monthTx={monthTx} catSpend={catSpend} totalSpent={totalSpent} totalBudgeted={totalBudgeted} totalIncome={totalIncome} month={month} />}
          {tab === 1 && <Transactions data={data} monthTx={monthTx} addTx={addTx} addTxBatch={addTxBatch} delTx={delTx} addRecurring={addRecurring} delRecurring={delRecurring} />}
          {tab === 2 && <BudgetTab data={data} catSpend={catSpend} totalIncome={totalIncome} addInc={addInc} delInc={delInc} updCat={updCat} addCat={addCat} delCat={delCat} addRule={addRule} delRule={delRule} />}
          {tab === 3 && <GoalsTab data={data} addSav={addSav} updSav={updSav} delSav={delSav} depositSav={depositSav} addDbt={addDbt} updDbt={updDbt} delDbt={delDbt} totalIncome={totalIncome} achievements={data.achievements || []} />}
          {tab === 4 && <TrendsTab data={data} month={month} />}
        </div>
      </div>

      {/* Bottom nav */}
      <nav style={S.bottomNav}>
        {NAV.map((n, i) => (
          <button key={n.label} style={S.navItem(i === tab)} onClick={() => setTab(i)}>
            {n.icon(i === tab)}
            <span style={S.navLabel(i === tab)}>{n.label}</span>
          </button>
        ))}
      </nav>

      {/* Achievement toast */}
      {toast && <AchievementToast achievement={toast} onDone={() => setToast(null)} />}

      {/* PaperBoy */}
      <div style={S.pbFloat}>
        <div style={S.pbBtn} onClick={() => setPbOpen(!pbOpen)} onMouseEnter={e => e.currentTarget.style.transform = "scale(1.08)"} onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
          <PaperBoySVG size={32} />
        </div>
      </div>
      {pbOpen && <PaperBoyPanel data={data} month={month} catSpend={catSpend} totalSpent={totalSpent} totalIncome={totalIncome} onClose={() => setPbOpen(false)} save={save} />}
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  PAPERBOY — with onboarding + goal tracking
// ════════════════════════════════════════════════════════
function PaperBoyPanel({ data, month, catSpend, totalSpent, totalIncome, onClose, save }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const bodyRef = useRef(null);
  const initialized = useRef(false);

  const isNewUser = data.incomes.length === 0 && data.transactions.length === 0;
  const hasNoIncome = data.incomes.length === 0;
  const hasNoBudgets = data.categories.every(c => c.budget === 0);

  const QUICK_PROMPTS = [
    "How am I doing this month?",
    "Where should I cut spending?",
    "Am I on track with my goals?",
    "Which debt should I pay first?",
    "How much should I save each month?",
  ];

  const buildContext = () => {
    const cats = data.categories.map(c => `${c.name}: budget ${fmt(c.budget)}, spent ${fmt(catSpend[c.id] || 0)}`).join("\n");
    const savs = data.savings.map(g => {
      const monthsLeft = g.targetDate ? Math.max(1, Math.ceil((new Date(g.targetDate) - new Date()) / (1000 * 60 * 60 * 24 * 30))) : null;
      const needed = monthsLeft ? (g.target - g.saved) / monthsLeft : null;
      return `${g.name}: saved ${fmt(g.saved)} of ${fmt(g.target)}${g.targetDate ? `, deadline ${g.targetDate}, need ${fmt(needed)}/mo` : ""}`;
    }).join("\n") || "None";
    const dbts = data.debts.map(d => `${d.name}: ${fmt(d.balance)} balance at ${d.rate}% APR, paying ${fmt(d.minPayment + d.extraPayment)}/mo, payoff: ${calcPayoff(d.balance, d.rate, d.minPayment + d.extraPayment).text}`).join("\n") || "None";
    const rec = (data.recurring || []).map(r => `${r.name}: ${fmt(r.amount)}/mo`).join("\n") || "None";
    const earned = (data.achievements || []).map(a => { const def = ACHIEVEMENTS.find(x => x.id === a.id); return def ? def.title : a.id; }).join(", ") || "None yet";
    return `Month: ${monthLabelLong(month)}\nMonthly income: ${fmt(totalIncome)}\nSpent this month: ${fmt(totalSpent)}\nRemaining: ${fmt(totalIncome - totalSpent)}\n\nCategory budgets vs spending:\n${cats}\n\nSavings goals:\n${savs}\n\nDebts:\n${dbts}\n\nRecurring bills:\n${rec}\n\nAchievements earned (${(data.achievements || []).length}/${ACHIEVEMENTS.length}): ${earned}`;
  };

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Onboarding flow for new users
    if (isNewUser) {
      setMessages([{ role: "pb", text: "Hey -- I'm PaperBoy. Looks like you're just getting started.\n\nHere's the order I'd set things up:\n1. Go to Budget tab → add your income (paycheck amount + frequency)\n2. Set budget amounts for each spending category\n3. Come back here and I'll tell you what the numbers say\n\nOr ask me anything and I'll walk you through it." }]);
      return;
    }

    if (hasNoIncome) {
      setMessages([{ role: "pb", text: "No income entered yet. Head to the Budget tab and add your paycheck -- without that number, everything else is guesswork. Come back when it's in." }]);
      return;
    }

    // Normal analysis
    const tips = analyzeFinances(data, month);
    const goalAlerts = data.savings.filter(g => {
      if (!g.targetDate || g.saved >= g.target) return false;
      const monthsLeft = Math.ceil((new Date(g.targetDate) - new Date()) / (1000 * 60 * 60 * 24 * 30));
      const needed = (g.target - g.saved) / Math.max(1, monthsLeft);
      // Flag if they'd need to save more than 15% of income per goal
      return needed > (totalIncome * 0.15);
    });

    let greeting = `Here's where you stand in ${monthLabelLong(month)}:\n\n`;
    greeting += tips.map(t => {
      const icon = t.type === "good" ? "[+]" : t.type === "warning" || t.type === "over" ? "[!]" : t.type === "danger" ? "[!!]" : "[-]";
      return `${icon} ${t.msg}`;
    }).join("\n\n");

    if (goalAlerts.length > 0) {
      greeting += `\n\nGoal warning: ${goalAlerts.map(g => `"${g.name}" deadline may be tight`).join(", ")}. Ask me about it.`;
    }

    if (hasNoBudgets) {
      greeting += "\n\nBudgets are all at $0. Go to the Budget tab and set real numbers -- otherwise there's nothing to track against.";
    }

    greeting += "\n\nAsk me anything.";
    setMessages([{ role: "pb", text: greeting }]);
  }, [data, month, catSpend, totalSpent, totalIncome, isNewUser, hasNoIncome, hasNoBudgets]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async (overrideText) => {
    const q = (overrideText || input).trim();
    if (!q || thinking) return;
    setInput("");
    const newMsgs = [...messages, { role: "user", text: q }];
    setMessages(newMsgs);
    setThinking(true);

    try {
      const ctx = buildContext();
      const history = newMsgs.slice(-12).map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: `You are PaperBoy, a no-nonsense financial advisor living inside a personal budget app. You look like a dollar bill wearing a newsboy cap. You're direct, practical, and occasionally dry. You give specific advice from the user's actual numbers -- never generic tips.\n\nUser's financial data:\n${ctx}\n\nRules:\n- Always reference their actual figures, not hypotheticals\n- Be direct. If numbers are bad, say so. If good, acknowledge briefly and move on.\n- Keep responses to 3-5 sentences unless they ask for detail or a breakdown\n- Use casual language but be precise with money amounts\n- If they ask for a goal plan, calculate the exact monthly savings needed from their data\n- If they're off pace for a goal, tell them by how much and what to do\n- If they ask about debt payoff order, use avalanche (highest rate first) by default unless they specify\n- Flag if any payment doesn't cover interest\n- If they need a licensed professional (tax, legal, investment management), say so clearly\n- You are not a licensed financial advisor. Say that if asked for specific investment picks.\n- Never make up numbers. Only use what's in the data above.`,
          messages: history
        })
      });

      const d = await response.json();
      const reply = d.content?.map(b => b.text || "").join("\n") || "Something went wrong on my end. Try again.";
      setMessages(prev => [...prev, { role: "pb", text: reply }]);
    } catch {
      // Rules-based fallback
      const tips = analyzeFinances(data, month);
      const fallback = tips.length > 0
        ? `Can't connect right now. Here's what I see:\n\n${tips.map(t => `- ${t.msg}`).join("\n")}`
        : "Can't connect right now. Try again in a moment.";
      setMessages(prev => [...prev, { role: "pb", text: fallback }]);
    }
    setThinking(false);
  };

  return (
    <div style={S.pbPanel}>
      <div style={S.pbHdr}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <PaperBoySVG size={24} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1 }}>PaperBoy</div>
            <div style={{ fontSize: 10, color: "#888" }}>Financial Advisor</div>
          </div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 18 }}>x</button>
      </div>
      <div ref={bodyRef} style={S.pbBody}>
        {messages.map((m, i) => <div key={i} style={S.pbMsg(m.role === "user")}>{m.text}</div>)}
        {thinking && <div style={{ ...S.pbMsg(false), color: "#888" }}>Crunching numbers...</div>}
      </div>
      {/* Quick prompts */}
      {messages.length <= 1 && !thinking && (
        <div style={S.pbQuick}>
          {QUICK_PROMPTS.map(p => <button key={p} style={S.pbQBtn} onClick={() => sendMessage(p)}>{p}</button>)}
        </div>
      )}
      <div style={S.pbInput}>
        <input style={{ ...S.inp, fontSize: 13 }} placeholder="Ask PaperBoy..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()} />
        <button style={{ ...S.btn, padding: "6px 12px" }} onClick={() => sendMessage()}>Send</button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════════════════
function Dashboard({ data, monthTx, catSpend, totalSpent, totalBudgeted, totalIncome, month }) {
  const remaining = totalIncome - totalSpent;
  const overCats = data.categories.filter(c => c.budget > 0 && (catSpend[c.id] || 0) > c.budget);
  const pieData = data.categories.filter(c => (catSpend[c.id] || 0) > 0).map(c => ({ name: c.name, value: catSpend[c.id] })).sort((a, b) => b.value - a.value);
  const barData = data.categories.filter(c => c.budget > 0 || (catSpend[c.id] || 0) > 0).map(c => ({ name: c.name.length > 10 ? c.name.slice(0, 9) + "." : c.name, budget: c.budget, spent: catSpend[c.id] || 0 }));

  const tips = analyzeFinances(data, month);
  const alertTips = tips.filter(t => t.type !== "good" && t.type !== "goal");

  const totalSaved = data.savings.reduce((s, g) => s + g.saved, 0);
  const totalDebt = data.debts.reduce((s, d) => s + d.balance, 0);
  const netWorth = totalSaved - totalDebt;
  const earnedCount = (data.achievements || []).length;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 10 }}>
        <div style={S.card}><div style={{ ...S.statV, color: C.green, fontSize: 20 }}>{fmt(totalIncome)}</div><div style={S.statL}>Income</div></div>
        <div style={S.card}><div style={{ ...S.statV, color: totalSpent > totalIncome ? C.red : C.text, fontSize: 20 }}>{fmt(totalSpent)}</div><div style={S.statL}>Spent</div></div>
        <div style={S.card}><div style={{ ...S.statV, color: remaining < 0 ? C.red : C.green, fontSize: 20 }}>{fmt(remaining)}</div><div style={S.statL}>Left</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div style={S.card}>
          <div style={{ ...S.statV, color: netWorth >= 0 ? C.green : C.red, fontSize: 22 }}>{fmt(netWorth)}</div>
          <div style={S.statL}>Net Worth</div>
          {(totalSaved > 0 || totalDebt > 0) && <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>{fmt(totalSaved)} saved · {fmt(totalDebt)} debt</div>}
        </div>
        <div style={S.card}>
          <div style={{ ...S.statV, color: C.amber, fontSize: 22 }}>{earnedCount}<span style={{ fontSize: 13, color: C.textDim, fontWeight: 400 }}> / {ACHIEVEMENTS.length}</span></div>
          <div style={S.statL}>Achievements</div>
          {earnedCount > 0 && <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>See Goals tab for details</div>}
        </div>
      </div>

      {totalBudgeted > 0 && (
        <div style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3, color: "#AAA" }}>
            <span style={{ ...S.cTitle, marginBottom: 0 }}>Budget Health</span>
            <span style={{ color: (totalBudgeted - totalSpent) < 0 ? C.red : C.green }}>{fmt(totalBudgeted - totalSpent)} left of {fmt(totalBudgeted)}</span>
          </div>
          <div style={S.bar}><div style={S.barF(pct(totalSpent, totalBudgeted), totalSpent > totalBudgeted ? C.red : C.green)} /></div>
          {overCats.length > 0 && <div style={{ marginTop: 8, fontSize: 11, color: C.red }}>Over budget: {overCats.map(c => `${c.name} (+${fmt((catSpend[c.id] || 0) - c.budget)})`).join(", ")}</div>}
        </div>
      )}

      {alertTips.length > 0 && (
        <div style={S.card}>
          <div style={S.cTitle}>Alerts</div>
          {alertTips.map((t, i) => <div key={i} style={S.tipCard(t.type)}>{t.msg}</div>)}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: pieData.length > 0 && barData.length > 0 ? "1fr 1fr" : "1fr", gap: 12 }}>
        {pieData.length > 0 && (
          <div style={S.card}>
            <div style={S.cTitle}>Spending Breakdown</div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart><Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={70} innerRadius={35} paddingAngle={2} strokeWidth={0}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie><Tooltip formatter={v => fmt(v)} contentStyle={{ background: "#1A1A18", border: "1px solid #333", borderRadius: 3, color: "#CCC", fontSize: 11 }} /></PieChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 10 }}>
              {pieData.map((d, i) => <span key={d.name} style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: COLORS[i % COLORS.length], flexShrink: 0 }} />{d.name}: {fmt(d.value)}</span>)}
            </div>
          </div>
        )}
        {barData.length > 0 && (
          <div style={S.card}>
            <div style={S.cTitle}>Budget vs Actual</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                <XAxis type="number" tickFormatter={v => `$${v}`} tick={{ fill: "#888", fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={70} tick={{ fill: "#AAA", fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={v => fmt(v)} contentStyle={{ background: "#1A1A18", border: "1px solid #333", borderRadius: 3, color: "#CCC", fontSize: 11 }} />
                <Bar dataKey="budget" fill="#333" radius={[0, 2, 2, 0]} barSize={8} name="Budget" />
                <Bar dataKey="spent" fill="#C9A227" radius={[0, 2, 2, 0]} barSize={8} name="Spent" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div style={S.card}>
        <div style={S.cTitle}>Recent Transactions</div>
        {monthTx.length === 0 ? <div style={S.empty}>No transactions this month.</div> : (
          <div style={{ overflowX: "auto" }}><table style={S.tbl}><thead><tr><th style={S.th}>Date</th><th style={S.th}>Description</th><th style={S.th}>Category</th><th style={{ ...S.th, textAlign: "right" }}>Amount</th></tr></thead><tbody>
            {monthTx.slice(0, 8).map(t => <tr key={t.id}><td style={{ ...S.td, fontFamily: "monospace", fontSize: 11, color: "#888" }}>{t.date}</td><td style={S.td}>{t.description}{t.fromRecurring && <span style={{ ...S.underB, marginLeft: 4 }}>auto</span>}</td><td style={{ ...S.td, color: "#888" }}>{t.categoryName}</td><td style={{ ...S.td, textAlign: "right", fontFamily: "monospace" }}>{fmt(t.amount)}</td></tr>)}
          </tbody></table></div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  TRANSACTIONS + CSV + RECURRING
// ════════════════════════════════════════════════════════
function Transactions({ data, monthTx, addTx, addTxBatch, delTx, addRecurring, delRecurring }) {
  const [date, setDate] = useState(todayStr());
  const [amount, setAmount] = useState("");
  const [catId, setCatId] = useState(data.categories[0]?.id || "");
  const [desc, setDesc] = useState("");
  const [csvMode, setCsvMode] = useState(false);
  const [recurringMode, setRecurringMode] = useState(false);
  const [csvData, setCsvData] = useState(null);
  const [csvMap, setCsvMap] = useState({ date: "", amount: "", desc: "" });
  const [csvRows, setCsvRows] = useState([]);
  const [csvDepositRows, setCsvDepositRows] = useState([]);
  const [depositTypes, setDepositTypes] = useState({});
  const [csvCat] = useState(data.categories[0]?.id || "");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [recName, setRecName] = useState("");
  const [recAmt, setRecAmt] = useState("");
  const [recCat, setRecCat] = useState(data.categories[0]?.id || "");
  const fileRef = useRef(null);

  // Auto-categorize on description change
  useEffect(() => {
    if (desc) {
      const matched = autoCategory(desc, data.rules || [], data.categories);
      if (matched) setCatId(matched.id);
    }
  }, [desc, data.rules, data.categories]);

  const handleAdd = () => {
    const a = parseFloat(amount);
    if (!a || a <= 0 || !catId) return;
    const cat = data.categories.find(c => c.id === catId);
    addTx({ date, amount: a, categoryId: catId, categoryName: cat?.name || catId, description: desc || cat?.name || "" });
    setAmount(""); setDesc("");
  };

  const handleCSV = (file) => {
    Papa.parse(file, {
      header: false, skipEmptyLines: true,
      complete: (results) => {
        // Find the real header row (contains "Date" and "Amount" or "Description")
        let headerIdx = -1;
        for (let i = 0; i < Math.min(results.data.length, 10); i++) {
          const row = results.data[i];
          const joined = row.join(",").toLowerCase();
          if (joined.includes("date") && (joined.includes("amount") || joined.includes("description"))) {
            headerIdx = i;
            break;
          }
        }
        if (headerIdx === -1) headerIdx = 0; // fallback

        const headers = results.data[headerIdx];
        const dataRows = results.data.slice(headerIdx + 1);

        const cols = headers.map(h => String(h).trim());
        const colIdx = (patterns) => {
          const idx = cols.findIndex(c => patterns.some(p => c.toLowerCase().includes(p)));
          return idx >= 0 ? cols[idx] : null;
        };

        const dateCol = colIdx(["date", "time"]) || cols[0];
        const amtCol = colIdx(["amount", "total", "debit", "credit", "sum"]) || cols[1];
        const descCol = colIdx(["desc", "memo", "note", "narr", "detail", "merchant", "payee"]) || cols[2];

        const map = { date: dateCol, amount: amtCol, desc: descCol };

        // Parse rows into objects, skip summary/balance header lines
        const allParsed = dataRows
          .map(row => {
            const obj = {};
            cols.forEach((h, i) => { obj[h] = row[i] || ""; });
            return obj;
          })
          .filter(row => {
            const rawAmt = String(row[amtCol] || "").replace(/[^0-9.-]/g, "");
            const amt = parseFloat(rawAmt);
            if (!rawAmt || isNaN(amt) || amt === 0) return false;
            const desc = String(row[descCol] || "").toLowerCase();
            if (desc.includes("beginning balance") || desc.includes("ending balance") || desc.includes("total credits") || desc.includes("total debits")) return false;
            return true;
          });

        const expenseRows = allParsed
          .filter(row => parseFloat(String(row[amtCol] || "").replace(/[^0-9.-]/g, "")) < 0)
          .map(row => {
            const d = row[descCol] || "";
            const matched = autoCategory(d, data.rules || [], data.categories);
            return { ...row, _catId: matched?.id || csvCat, _matched: !!matched };
          });

        const depositRows = allParsed
          .filter(row => parseFloat(String(row[amtCol] || "").replace(/[^0-9.-]/g, "")) > 0)
          .map((row, i) => ({ ...row, _depositId: i }));

        // Auto-detect payroll rows
        const initTypes = {};
        depositRows.forEach(row => {
          const desc = String(row[descCol] || "").toLowerCase();
          const isPayroll = /payroll|direct dep|salary|wages|ddep|ach dep/.test(desc);
          initTypes[row._depositId] = isPayroll ? "income" : "skip";
        });

        if (expenseRows.length > 0 || depositRows.length > 0) {
          const syntheticResults = { meta: { fields: cols }, data: expenseRows };
          setCsvData(syntheticResults);
          setCsvMap(map);
          setCsvRows(expenseRows);
          setCsvDepositRows(depositRows);
          setDepositTypes(initTypes);
        }
      }
    });
  };

  const parseRowDate = (row) => {
    const rawDate = String(row[csvMap.date] || "").trim();
    const mmddyyyy = rawDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mmddyyyy) return `${mmddyyyy[3]}-${mmddyyyy[1].padStart(2,"0")}-${mmddyyyy[2].padStart(2,"0")}`;
    const parsed = new Date(rawDate);
    return isNaN(parsed.getTime()) ? todayStr() : parsed.toISOString().slice(0, 10);
  };

  const importCSV = () => {
    if (!csvData || !csvMap.date || !csvMap.amount) return;
    const txs = [];
    csvRows.forEach(row => {
      const amt = Math.abs(parseFloat(String(row[csvMap.amount] || "").replace(/[^0-9.-]/g, "")));
      if (!amt || amt <= 0) return;
      const cat = data.categories.find(c => c.id === row._catId) || data.categories[0];
      txs.push({ date: parseRowDate(row), amount: amt, categoryId: cat.id, categoryName: cat.name, description: row[csvMap.desc] || cat.name || "" });
    });
    csvDepositRows.forEach(row => {
      if (depositTypes[row._depositId] !== "income") return;
      const amt = Math.abs(parseFloat(String(row[csvMap.amount] || "").replace(/[^0-9.-]/g, "")));
      if (!amt || amt <= 0) return;
      txs.push({ date: parseRowDate(row), amount: amt, categoryId: "income", categoryName: "Income / Deposit", description: row[csvMap.desc] || "Deposit", type: "income" });
    });
    if (txs.length > 0) addTxBatch(txs, true);
    setCsvData(null); setCsvRows([]); setCsvDepositRows([]); setDepositTypes({}); setCsvMode(false);
  };

  const handleAddRecurring = () => {
    const a = parseFloat(recAmt);
    if (!recName || !a || a <= 0) return;
    const cat = data.categories.find(c => c.id === recCat);
    addRecurring({ name: recName, amount: a, categoryId: recCat, categoryName: cat?.name || recCat });
    setRecName(""); setRecAmt("");
  };

  // Filtered transactions
  const filtered = useMemo(() => monthTx.filter(t => {
    const matchSearch = !search || t.description.toLowerCase().includes(search.toLowerCase()) || (t.categoryName || "").toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === "all" || t.categoryId === filterCat;
    return matchSearch && matchCat;
  }), [monthTx, search, filterCat]);

  return (
    <div>
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={S.cTitle}>Add Transaction</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={recurringMode ? S.btn : S.btnG} onClick={() => { setRecurringMode(!recurringMode); setCsvMode(false); }}>Recurring</button>
            <button style={csvMode ? S.btn : S.btnG} onClick={() => { setCsvMode(!csvMode); setRecurringMode(false); setCsvData(null); setCsvRows([]); }}>{csvMode ? "Close" : "Import CSV"}</button>
          </div>
        </div>

        {!csvMode && !recurringMode && (
          <div style={{ ...S.row, gap: 6 }}>
            <input type="date" style={S.inpSm} value={date} onChange={e => setDate(e.target.value)} />
            <input type="number" style={{ ...S.inpSm, width: 90 }} placeholder="$" value={amount} onChange={e => setAmount(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdd()} step="0.01" min="0" />
            <input type="text" style={S.inp} placeholder="Description (auto-categorizes)" value={desc} onChange={e => setDesc(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdd()} />
            <select style={S.sel} value={catId} onChange={e => setCatId(e.target.value)}>
              {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button style={S.btn} onClick={handleAdd}>Add</button>
          </div>
        )}

        {recurringMode && (
          <div>
            <div style={{ fontSize: 12, color: "#AAA", marginBottom: 10 }}>Recurring bills auto-generate on the 1st of each month.</div>
            <div style={{ ...S.row, gap: 6, marginBottom: 14 }}>
              <input style={S.inp} placeholder="Name (e.g. Rent)" value={recName} onChange={e => setRecName(e.target.value)} />
              <input type="number" style={S.inpSm} placeholder="$" value={recAmt} onChange={e => setRecAmt(e.target.value)} min="0" />
              <select style={S.sel} value={recCat} onChange={e => setRecCat(e.target.value)}>
                {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button style={S.btn} onClick={handleAddRecurring}>Add</button>
            </div>
            {(data.recurring || []).length === 0 ? <div style={S.empty}>No recurring transactions set.</div> : (
              <table style={S.tbl}><thead><tr><th style={S.th}>Name</th><th style={S.th}>Amount</th><th style={S.th}>Category</th><th style={{ ...S.th, width: 24 }}></th></tr></thead><tbody>
                {(data.recurring || []).map(r => <tr key={r.id}><td style={S.td}>{r.name}</td><td style={{ ...S.td, fontFamily: "monospace" }}>{fmt(r.amount)}/mo</td><td style={{ ...S.td, color: "#888" }}>{r.categoryName}</td><td style={S.td}><button style={S.delBtn} onClick={() => delRecurring(r.id)}>x</button></td></tr>)}
              </tbody></table>
            )}
          </div>
        )}

        {csvMode && (
          <div>
            {!csvData ? (
              <div>
                <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" style={{ display: "none" }} onChange={e => e.target.files[0] && handleCSV(e.target.files[0])} />
                <div onClick={() => fileRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "#C9A227"; }}
                  onDragLeave={e => { e.currentTarget.style.borderColor = "#333"; }}
                  onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = "#333"; const f = e.dataTransfer.files[0]; if (f) handleCSV(f); }}
                  style={{ border: "2px dashed #333", borderRadius: 6, padding: "30px 20px", textAlign: "center", cursor: "pointer", color: "#888", fontSize: 13 }}>
                  Drop CSV here or click to browse<br/><span style={{ fontSize: 11, color: "#555" }}>Bank: Account &gt; Activity &gt; Download/Export</span>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ ...S.row, gap: 8, marginBottom: 10 }}>
                  {["date", "amount", "desc"].map(field => (
                    <div key={field} style={{ flex: 1 }}>
                      <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 3 }}>{field === "desc" ? "DESCRIPTION" : field.toUpperCase()} COLUMN</label>
                      <select style={{ ...S.sel, width: "100%" }} value={csvMap[field]} onChange={e => {
                        const newMap = { ...csvMap, [field]: e.target.value };
                        setCsvMap(newMap);
                        if (field === "desc") {
                          const rows = csvData.data.map(row => {
                            const d = row[e.target.value] || "";
                            const matched = autoCategory(d, data.rules || [], data.categories);
                            return { ...row, _catId: matched?.id || csvCat, _matched: !!matched };
                          });
                          setCsvRows(rows);
                        }
                      }}>
                        {field === "desc" && <option value="">-- none --</option>}
                        {csvData.meta.fields.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>
                  {csvRows.length} expenses — {csvRows.filter(r => r._matched).length} auto-categorized.
                </div>
                {csvDepositRows.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#5B8A72", marginBottom: 6 }}>Deposits / Credits ({csvDepositRows.length}) — mark which ones are income:</div>
                    <div style={{ overflowX: "auto", maxHeight: 160, overflowY: "auto" }}>
                      <table style={S.tbl}><thead><tr><th style={S.th}>Date</th><th style={S.th}>Description</th><th style={{ ...S.th, textAlign: "right" }}>Amount</th><th style={S.th}>Type</th></tr></thead><tbody>
                        {csvDepositRows.map(row => (
                          <tr key={row._depositId}>
                            <td style={{ ...S.td, fontFamily: "monospace", fontSize: 11, color: "#888" }}>{row[csvMap.date]}</td>
                            <td style={S.td}>{row[csvMap.desc]}</td>
                            <td style={{ ...S.td, textAlign: "right", fontFamily: "monospace", color: "#5B8A72" }}>+{fmt(Math.abs(parseFloat(String(row[csvMap.amount] || "").replace(/[^0-9.-]/g, ""))))}</td>
                            <td style={S.td}>
                              <select style={{ ...S.sel, fontSize: 11, padding: "2px 4px" }} value={depositTypes[row._depositId] || "skip"} onChange={e => setDepositTypes(prev => ({ ...prev, [row._depositId]: e.target.value }))}>
                                <option value="income">Income</option>
                                <option value="skip">Skip</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody></table>
                    </div>
                  </div>
                )}
                <div style={{ overflowX: "auto", maxHeight: 260, overflowY: "auto" }}>
                  <table style={S.tbl}><thead><tr><th style={S.th}>Date</th><th style={S.th}>Amount</th><th style={S.th}>Description</th><th style={S.th}>Category</th></tr></thead><tbody>
                    {csvRows.slice(0, 20).map((row, i) => (
                      <tr key={i}>
                        <td style={{ ...S.td, fontSize: 11, color: "#888" }}>{row[csvMap.date] || "?"}</td>
                        <td style={{ ...S.td, fontFamily: "monospace", fontSize: 11 }}>{row[csvMap.amount] || "?"}</td>
                        <td style={{ ...S.td, fontSize: 11 }}>{csvMap.desc ? row[csvMap.desc] || "" : ""}</td>
                        <td style={S.td}>
                          <select style={{ ...S.sel, padding: "2px 6px", fontSize: 11, minWidth: 90 }} value={row._catId}
                            onChange={e => { const updated = [...csvRows]; updated[i] = { ...row, _catId: e.target.value, _matched: false }; setCsvRows(updated); }}>
                            {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody></table>
                  {csvRows.length > 20 && <div style={{ fontSize: 11, color: "#888", padding: "6px 8px" }}>+ {csvRows.length - 20} more rows (all will be imported)</div>}
                </div>
                <div style={{ ...S.row, gap: 8, marginTop: 12 }}>
                  <button style={S.btn} onClick={importCSV}>Import {csvRows.length + csvDepositRows.filter(r => depositTypes[r._depositId] === "income").length} Transactions</button>
                  <button style={S.btnG} onClick={() => { setCsvData(null); setCsvRows([]); setCsvDepositRows([]); setDepositTypes({}); }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Search + filter */}
      <div style={{ ...S.row, gap: 8, marginBottom: 10 }}>
        <input style={S.inp} placeholder="Search transactions..." value={search} onChange={e => setSearch(e.target.value)} />
        <select style={S.sel} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="all">All categories</option>
          {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={S.cTitle}>Transactions ({filtered.length})</div>
          <span style={{ fontSize: 12, color: "#888", fontFamily: "monospace" }}>Spent: {fmt(filtered.filter(t => t.type !== "income").reduce((s, t) => s + t.amount, 0))}{filtered.some(t => t.type === "income") && <span style={{ color: "#5B8A72", marginLeft: 8 }}>Deposits: +{fmt(filtered.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0))}</span>}</span>
        </div>
        {filtered.length === 0 ? <div style={S.empty}>No transactions match.</div> : (
          <div style={{ overflowX: "auto" }}><table style={S.tbl}><thead><tr><th style={S.th}>Date</th><th style={S.th}>Description</th><th style={S.th}>Category</th><th style={{ ...S.th, textAlign: "right" }}>Amount</th><th style={{ ...S.th, width: 24 }}></th></tr></thead><tbody>
            {filtered.map(t => <tr key={t.id} style={t.type === "income" ? { background: "rgba(91,138,114,0.08)" } : {}}><td style={{ ...S.td, fontFamily: "monospace", fontSize: 11, color: "#888", whiteSpace: "nowrap" }}>{t.date}</td><td style={S.td}>{t.description}{t.fromRecurring && <span style={{ ...S.underB, marginLeft: 4 }}>auto</span>}{t.isSavingsDeposit && <span style={{ ...S.underB, marginLeft: 4 }}>savings</span>}{t.type === "income" && <span style={{ ...S.underB, marginLeft: 4, background: "#5B8A72", color: "#fff" }}>deposit</span>}</td><td style={{ ...S.td, color: t.type === "income" ? "#5B8A72" : "#888" }}>{t.categoryName}</td><td style={{ ...S.td, textAlign: "right", fontFamily: "monospace", color: t.type === "income" ? "#5B8A72" : undefined }}>{t.type === "income" ? "+" : ""}{fmt(t.amount)}</td><td style={S.td}><button style={S.delBtn} onClick={() => delTx(t.id)}>x</button></td></tr>)}
          </tbody></table></div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  BUDGET TAB + AUTO-CATEGORIZATION RULES
// ════════════════════════════════════════════════════════
function BudgetTab({ data, catSpend, totalIncome, addInc, delInc, updCat, addCat, delCat, addRule, delRule }) {
  const [incName, setIncName] = useState("");
  const [incAmt, setIncAmt] = useState("");
  const [incFreq, setIncFreq] = useState("monthly");
  const [catName, setCatName] = useState("");
  const [catType, setCatType] = useState("variable");
  const [ruleKw, setRuleKw] = useState("");
  const [ruleCat, setRuleCat] = useState(data.categories[0]?.id || "");
  const [showRules, setShowRules] = useState(false);

  const handleAddInc = () => { const a = parseFloat(incAmt); if (!incName || !a) return; addInc({ name: incName, amount: a, frequency: incFreq }); setIncName(""); setIncAmt(""); };
  const handleAddCat = () => { if (!catName.trim()) return; addCat({ name: catName.trim(), type: catType, budget: 0 }); setCatName(""); };
  const handleAddRule = () => { if (!ruleKw.trim()) return; addRule({ keywords: ruleKw.trim(), categoryId: ruleCat }); setRuleKw(""); };

  const CatRow = ({ c }) => {
    const sp = catSpend[c.id] || 0; const over = c.budget > 0 && sp > c.budget;
    return (
      <tr>
        <td style={S.td}>{c.name}</td>
        <td style={S.td}><input type="number" style={{ ...S.inpSm, width: 80, padding: "3px 6px", fontSize: 12 }} value={c.budget || ""} onChange={e => updCat(c.id, { budget: parseFloat(e.target.value) || 0 })} placeholder="0" min="0" /></td>
        <td style={{ ...S.td, fontFamily: "monospace", fontSize: 12 }}>{fmt(sp)}{over && <span style={S.overB}>+{fmt(sp - c.budget)}</span>}{c.budget > 0 && !over && sp > 0 && <span style={S.underB}>{fmt(c.budget - sp)} left</span>}</td>
        <td style={S.td}>{c.budget > 0 && <div style={S.bar}><div style={S.barF(pct(sp, c.budget), over ? C.red : C.green)} /></div>}</td>
        <td style={S.td}><button style={S.delBtn} onClick={() => delCat(c.id)}>x</button></td>
      </tr>
    );
  };

  return (
    <div>
      <div style={S.card}>
        <div style={S.cTitle}>Income Sources</div>
        <div style={{ ...S.row, gap: 6, marginBottom: 12 }}>
          <input style={S.inp} placeholder="Source" value={incName} onChange={e => setIncName(e.target.value)} />
          <input type="number" style={S.inpSm} placeholder="$" value={incAmt} onChange={e => setIncAmt(e.target.value)} min="0" />
          <select style={S.sel} value={incFreq} onChange={e => setIncFreq(e.target.value)}><option value="weekly">Weekly</option><option value="biweekly">Biweekly</option><option value="monthly">Monthly</option></select>
          <button style={S.btn} onClick={handleAddInc}>Add</button>
        </div>
        {data.incomes.length === 0 ? <div style={S.empty}>No income sources.</div> : (
          <table style={S.tbl}><thead><tr><th style={S.th}>Source</th><th style={S.th}>Amount</th><th style={S.th}>Freq</th><th style={S.th}>Monthly Est.</th><th style={{ ...S.th, width: 24 }}></th></tr></thead><tbody>
            {data.incomes.map(i => { const mo = i.frequency === "weekly" ? i.amount * 4.33 : i.frequency === "biweekly" ? i.amount * 2.17 : i.amount; return <tr key={i.id}><td style={S.td}>{i.name}</td><td style={{ ...S.td, fontFamily: "monospace" }}>{fmt(i.amount)}</td><td style={{ ...S.td, color: "#888" }}>{i.frequency}</td><td style={{ ...S.td, fontFamily: "monospace" }}>{fmt(mo)}</td><td style={S.td}><button style={S.delBtn} onClick={() => delInc(i.id)}>x</button></td></tr>; })}
            <tr><td colSpan={3} style={{ ...S.td, fontWeight: 600, borderTop: "1px solid #333" }}>Total Monthly</td><td style={{ ...S.td, fontFamily: "monospace", fontWeight: 600, borderTop: "1px solid #333" }}>{fmt(totalIncome)}</td><td style={S.td}></td></tr>
          </tbody></table>
        )}
      </div>

      {["fixed", "variable"].map(type => (
        <div key={type} style={S.card}>
          <div style={S.cTitle}>{type === "fixed" ? "Fixed Expenses (Bills)" : "Variable Expenses"}</div>
          <div style={{ overflowX: "auto" }}><table style={S.tbl}><thead><tr><th style={S.th}>Category</th><th style={S.th}>Budget</th><th style={S.th}>Spent</th><th style={{ ...S.th, width: 70 }}></th><th style={{ ...S.th, width: 24 }}></th></tr></thead><tbody>
            {data.categories.filter(c => c.type === type).map(c => <CatRow key={c.id} c={c} />)}
          </tbody></table></div>
        </div>
      ))}

      <div style={S.card}>
        <div style={S.cTitle}>Add Category</div>
        <div style={{ ...S.row, gap: 6 }}>
          <input style={S.inp} placeholder="Name" value={catName} onChange={e => setCatName(e.target.value)} />
          <select style={S.sel} value={catType} onChange={e => setCatType(e.target.value)}><option value="fixed">Fixed</option><option value="variable">Variable</option></select>
          <button style={S.btn} onClick={handleAddCat}>Add</button>
        </div>
      </div>

      {/* Auto-categorization rules */}
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={S.cTitle}>Auto-Categorization Rules</div>
          <button style={S.btnG} onClick={() => setShowRules(!showRules)}>{showRules ? "Hide" : "Show"}</button>
        </div>
        {showRules && (
          <div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>When a transaction description contains these keywords, it auto-assigns to that category on import and manual entry.</div>
            <div style={{ ...S.row, gap: 6, marginBottom: 12 }}>
              <input style={S.inp} placeholder="Keywords (comma-separated)" value={ruleKw} onChange={e => setRuleKw(e.target.value)} />
              <select style={S.sel} value={ruleCat} onChange={e => setRuleCat(e.target.value)}>
                {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button style={S.btn} onClick={handleAddRule}>Add Rule</button>
            </div>
            {(data.rules || []).length === 0 ? <div style={S.empty}>No rules.</div> : (
              <table style={S.tbl}><thead><tr><th style={S.th}>Keywords</th><th style={S.th}>Category</th><th style={{ ...S.th, width: 24 }}></th></tr></thead><tbody>
                {(data.rules || []).map(r => {
                  const cat = data.categories.find(c => c.id === r.categoryId);
                  return <tr key={r.id}><td style={{ ...S.td, fontSize: 12, color: "#AAA" }}>{r.keywords}</td><td style={S.td}>{cat?.name || r.categoryId}</td><td style={S.td}><button style={S.delBtn} onClick={() => delRule(r.id)}>x</button></td></tr>;
                })}
              </tbody></table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  GOALS TAB
// ════════════════════════════════════════════════════════
function GoalsTab({ data, addSav, updSav, delSav, depositSav, addDbt, updDbt, delDbt, totalIncome, achievements }) {
  const [gName, setGName] = useState("");
  const [gTarget, setGTarget] = useState("");
  const [gDate, setGDate] = useState("");
  const [dName, setDName] = useState("");
  const [dBal, setDBal] = useState("");
  const [dRate, setDRate] = useState("");
  const [dMin, setDMin] = useState("");
  const [dExtra, setDExtra] = useState("");
  const [simId, setSimId] = useState(null);
  const [simExtra, setSimExtra] = useState("");
  const [depositAmounts, setDepositAmounts] = useState({});

  const handleAddGoal = () => { const t = parseFloat(gTarget); if (!gName || !t) return; addSav({ name: gName, target: t, targetDate: gDate || null, saved: 0 }); setGName(""); setGTarget(""); setGDate(""); };
  const handleAddDebt = () => { const b = parseFloat(dBal); if (!dName || !b) return; addDbt({ name: dName, balance: b, rate: parseFloat(dRate) || 0, minPayment: parseFloat(dMin) || 0, extraPayment: parseFloat(dExtra) || 0 }); setDName(""); setDBal(""); setDRate(""); setDMin(""); setDExtra(""); };

  const totalDebt = data.debts.reduce((s, d) => s + d.balance, 0);
  const totalSaved = data.savings.reduce((s, g) => s + g.saved, 0);

  return (
    <div>
      {/* Savings */}
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={S.cTitle}>Savings Goals</div>
          <span style={{ fontSize: 12, color: C.green, fontFamily: "monospace" }}>Total saved: {fmt(totalSaved)}</span>
        </div>
        {data.savings.length === 0 ? <div style={S.empty}>No savings goals.</div> : data.savings.map(g => {
          const p = pct(g.saved, g.target);
          const completed = g.saved >= g.target && g.target > 0;
          const monthsLeft = g.targetDate ? Math.max(1, Math.ceil((new Date(g.targetDate) - new Date()) / (1000 * 60 * 60 * 24 * 30))) : null;
          const needed = monthsLeft && !completed ? (g.target - g.saved) / monthsLeft : null;
          const onPace = needed !== null && totalIncome > 0 ? needed <= totalIncome * 0.3 : true;
          const handleDeposit = () => {
            const v = parseFloat(depositAmounts[g.id]);
            if (v > 0) { depositSav(g, v); setDepositAmounts(prev => ({ ...prev, [g.id]: "" })); }
          };
          return (
            <div key={g.id} style={{ padding: "12px 0", borderBottom: "1px solid #222" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ fontWeight: 500 }}>{g.name}{completed && <span style={{ marginLeft: 6, background: C.green, color: "#000", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99 }}>FUNDED</span>}</span>
                <span style={{ fontSize: 11, color: "#888" }}>{g.targetDate || "No deadline"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#AAA", margin: "3px 0" }}>
                <span>{fmt(g.saved)} / {fmt(g.target)}</span>
                <span style={{ color: completed ? C.green : undefined }}>{p}%</span>
              </div>
              <div style={S.bar}><div style={S.barF(Math.min(p, 100), completed ? C.green : "#5B8A72")} /></div>
              {needed !== null && (
                <div style={{ fontSize: 11, color: onPace ? C.green : C.amber, marginTop: 4 }}>
                  {fmt(needed)}/mo needed to hit deadline {!onPace && "-- may need to adjust"}
                </div>
              )}
              {!completed && (
                <div style={{ marginTop: 6, display: "flex", gap: 5, alignItems: "center" }}>
                  <input
                    type="number"
                    placeholder="$ deposit"
                    style={{ ...S.inpSm, width: 85, padding: "3px 6px", fontSize: 12 }}
                    value={depositAmounts[g.id] || ""}
                    onChange={e => setDepositAmounts(prev => ({ ...prev, [g.id]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && handleDeposit()}
                  />
                  <button style={{ ...S.btn, padding: "4px 12px", fontSize: 12 }} onClick={handleDeposit}>Deposit</button>
                  <div style={{ flex: 1 }} />
                  <button style={S.btnD} onClick={() => delSav(g.id)}>Remove</button>
                </div>
              )}
              {completed && (
                <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: C.green }}>Goal complete!</span>
                  <button style={S.btnD} onClick={() => delSav(g.id)}>Remove</button>
                </div>
              )}
            </div>
          );
        })}
        <div style={{ marginTop: 14 }}>
          <div style={{ ...S.cTitle, marginTop: 6 }}>Add Goal</div>
          <div style={{ ...S.row, gap: 6 }}>
            <input style={S.inp} placeholder="Goal name" value={gName} onChange={e => setGName(e.target.value)} />
            <input type="number" style={S.inpSm} placeholder="$ Target" value={gTarget} onChange={e => setGTarget(e.target.value)} min="0" />
            <input type="date" style={S.inpSm} value={gDate} onChange={e => setGDate(e.target.value)} />
            <button style={S.btn} onClick={handleAddGoal}>Add</button>
          </div>
        </div>
      </div>

      {/* Debt */}
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={S.cTitle}>Debt Payoff</div>
          <span style={{ fontSize: 12, color: totalDebt > 0 ? C.red : C.green, fontFamily: "monospace" }}>Total: {fmt(totalDebt)}</span>
        </div>
        {data.debts.length === 0 ? <div style={S.empty}>No debts tracked.</div> : (
          <div>
            <div style={{ overflowX: "auto" }}><table style={S.tbl}><thead><tr><th style={S.th}>Name</th><th style={S.th}>Balance</th><th style={S.th}>Rate</th><th style={S.th}>Payment</th><th style={S.th}>Payoff</th><th style={{ ...S.th, width: 60 }}>Sim</th><th style={{ ...S.th, width: 24 }}></th></tr></thead><tbody>
              {data.debts.map(d => {
                const mo = d.minPayment + d.extraPayment;
                const po = calcPayoff(d.balance, d.rate, mo);
                const simAmt = parseFloat(simExtra) || 0;
                const simPo = simId === d.id && simAmt > 0 ? calcPayoff(d.balance, d.rate, mo + simAmt) : null;
                return (
                  <tr key={d.id}>
                    <td style={S.td}>{d.name}</td>
                    <td style={S.td}><input type="number" style={{ ...S.inpSm, width: 85, padding: "3px 6px", fontSize: 12 }} value={d.balance} onChange={e => updDbt(d.id, { balance: parseFloat(e.target.value) || 0 })} /></td>
                    <td style={{ ...S.td, color: d.rate > 15 ? C.amber : C.textDim }}>{d.rate}%</td>
                    <td style={{ ...S.td, fontFamily: "monospace", fontSize: 11 }}>{fmt(d.minPayment)}{d.extraPayment > 0 ? ` +${fmt(d.extraPayment)}` : ""}</td>
                    <td style={{ ...S.td, fontSize: 11 }}>
                      <span style={{ color: po.months === Infinity ? C.red : C.blue }}>{po.text}</span>
                      {simPo && <div style={{ color: C.green, fontSize: 10, marginTop: 2 }}>+{fmt(simAmt)}/mo: {simPo.text}</div>}
                    </td>
                    <td style={S.td}><button style={{ ...S.btnG, padding: "2px 8px", fontSize: 11 }} onClick={() => setSimId(simId === d.id ? null : d.id)}>sim</button></td>
                    <td style={S.td}><button style={S.delBtn} onClick={() => delDbt(d.id)}>x</button></td>
                  </tr>
                );
              })}
            </tbody></table></div>
            {simId && (
              <div style={{ ...S.row, gap: 8, marginTop: 10, padding: "10px 14px", background: "#111", borderRadius: 3 }}>
                <span style={{ fontSize: 12, color: "#AAA" }}>Extra payment/mo:</span>
                <input type="number" style={{ ...S.inpSm, width: 90 }} placeholder="$ extra" value={simExtra} onChange={e => setSimExtra(e.target.value)} min="0" />
                <span style={{ fontSize: 11, color: "#888" }}>See payoff time update above in the sim column row</span>
              </div>
            )}
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <div style={{ ...S.cTitle, marginTop: 6 }}>Add Debt</div>
          <div style={{ ...S.row, gap: 6 }}>
            <input style={S.inp} placeholder="Name" value={dName} onChange={e => setDName(e.target.value)} />
            <input type="number" style={{ ...S.inpSm, width: 85 }} placeholder="$ Balance" value={dBal} onChange={e => setDBal(e.target.value)} min="0" />
            <input type="number" style={{ ...S.inpSm, width: 70 }} placeholder="APR%" value={dRate} onChange={e => setDRate(e.target.value)} min="0" step="0.1" />
            <input type="number" style={S.inpSm} placeholder="$ Min pmt" value={dMin} onChange={e => setDMin(e.target.value)} min="0" />
            <input type="number" style={{ ...S.inpSm, width: 85 }} placeholder="$ Extra" value={dExtra} onChange={e => setDExtra(e.target.value)} min="0" />
            <button style={S.btn} onClick={handleAddDebt}>Add</button>
          </div>
        </div>
      </div>

      {/* Achievements */}
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={S.cTitle}>Achievements</div>
          <span style={{ fontSize: 12, color: C.amber, fontFamily: "monospace" }}>{achievements.length} / {ACHIEVEMENTS.length} unlocked</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {ACHIEVEMENTS.map(a => {
            const earned = achievements.find(e => e.id === a.id);
            return (
              <div key={a.id} style={{ background: earned ? C.greenDim + "66" : C.surfaceHigh, border: "1px solid " + (earned ? C.green + "55" : C.border), borderRadius: 8, padding: "10px 12px", opacity: earned ? 1 : 0.45 }}>
                <div style={{ fontSize: 16, marginBottom: 3 }}>{earned ? "🏆" : "🔒"}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: earned ? C.text : C.textDim }}>{a.title}</div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 2, lineHeight: 1.3 }}>{a.desc}</div>
                {earned && <div style={{ fontSize: 9, color: C.green, marginTop: 4 }}>{earned.unlockedAt}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  TRENDS TAB — month-over-month comparison
// ════════════════════════════════════════════════════════
function TrendsTab({ data, month }) {
  const months = last6Months(month);
  const [compareA, setCompareA] = useState(shiftMonthStr(month, -1));
  const [compareB, setCompareB] = useState(month);

  const getMonthSpend = useCallback((m) => {
    const txs = data.transactions.filter(t => monthKey(t.date) === m && t.type !== "income");
    const totals = {};
    data.categories.forEach(c => { totals[c.id] = 0; });
    txs.forEach(t => { totals[t.categoryId] = (totals[t.categoryId] || 0) + t.amount; });
    const depositIncome = data.transactions.filter(t => monthKey(t.date) === m && t.type === "income").reduce((s, t) => s + t.amount, 0);
    return { totals, total: txs.reduce((s, t) => s + t.amount, 0), depositIncome };
  }, [data]);

  const trendData = useMemo(() => {
    return months.map(m => {
      const { totals, total, depositIncome } = getMonthSpend(m);
      const row = { month: monthLabel(m), total, depositIncome };
      data.categories.forEach(c => { row[c.name] = totals[c.id] || 0; });
      return row;
    });
  }, [months, getMonthSpend, data.categories]);

  const catTrendData = useMemo(() => {
    return data.categories.filter(c => months.some(m => {
      const txs = data.transactions.filter(t => monthKey(t.date) === m && t.categoryId === c.id);
      return txs.length > 0;
    })).map(c => {
      const row = { name: c.name };
      months.forEach(m => {
        const txs = data.transactions.filter(t => monthKey(t.date) === m && t.categoryId === c.id);
        row[monthLabel(m)] = txs.reduce((s, t) => s + t.amount, 0);
      });
      return row;
    });
  }, [data, months]);

  const spendA = getMonthSpend(compareA);
  const spendB = getMonthSpend(compareB);

  const compData = data.categories
    .filter(c => (spendA.totals[c.id] || 0) > 0 || (spendB.totals[c.id] || 0) > 0)
    .map(c => ({ name: c.name.length > 10 ? c.name.slice(0, 9) + "." : c.name, [monthLabel(compareA)]: spendA.totals[c.id] || 0, [monthLabel(compareB)]: spendB.totals[c.id] || 0 }));

  return (
    <div>
      <div style={S.card}>
        <div style={S.cTitle}>Savings Rate — Last 6 Months</div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={trendData.map(d => {
            const income = getMonthlyIncome(data.incomes) + (d.depositIncome || 0);
            const rate = income > 0 ? Math.max(0, Math.round(((income - d.total) / income) * 100)) : 0;
            return { month: d.month, rate, fill: rate >= 20 ? C.green : rate >= 10 ? C.amber : C.red };
          })} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
            <XAxis dataKey="month" tick={{ fill: "#888", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => `${v}%`} tick={{ fill: "#888", fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} />
            <Tooltip formatter={v => `${v}%`} contentStyle={{ background: "#1A1A18", border: "1px solid #333", borderRadius: 3, color: "#CCC", fontSize: 11 }} />
            <Bar dataKey="rate" name="Saved %" radius={[2, 2, 0, 0]}>
              {trendData.map((d, i) => {
                const income = getMonthlyIncome(data.incomes) + (d.depositIncome || 0);
                const rate = income > 0 ? Math.max(0, Math.round(((income - d.total) / income) * 100)) : 0;
                return <Cell key={i} fill={rate >= 20 ? C.green : rate >= 10 ? C.amber : C.red} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div style={{ fontSize: 10, color: C.textDim, textAlign: "center" }}>Green = 20%+ · Amber = 10–19% · Red = under 10%</div>
      </div>

      <div style={S.card}>
        <div style={S.cTitle}>Total Spending — Last 6 Months</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={trendData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
            <XAxis dataKey="month" tick={{ fill: "#888", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => `$${v}`} tick={{ fill: "#888", fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip formatter={v => fmt(v)} contentStyle={{ background: "#1A1A18", border: "1px solid #333", borderRadius: 3, color: "#CCC", fontSize: 11 }} />
            <Bar dataKey="total" fill="#C9A227" radius={[2, 2, 0, 0]} name="Total Spent" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Month comparison */}
      <div style={S.card}>
        <div style={S.cTitle}>Month Comparison</div>
        <div style={{ ...S.row, gap: 8, marginBottom: 14 }}>
          <select style={S.sel} value={compareA} onChange={e => setCompareA(e.target.value)}>
            {months.map(m => <option key={m} value={m}>{monthLabelLong(m)}</option>)}
          </select>
          <span style={{ color: "#888", fontSize: 13, padding: "0 4px" }}>vs</span>
          <select style={S.sel} value={compareB} onChange={e => setCompareB(e.target.value)}>
            {months.map(m => <option key={m} value={m}>{monthLabelLong(m)}</option>)}
          </select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ ...S.statV, color: "#AAA", fontSize: 20 }}>{fmt(spendA.total)}</div>
            <div style={{ fontSize: 11, color: "#888" }}>{monthLabelLong(compareA)}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ ...S.statV, color: spendB.total > spendA.total ? C.red : C.green, fontSize: 20 }}>{fmt(spendB.total)}</div>
            <div style={{ fontSize: 11, color: "#888" }}>{monthLabelLong(compareB)} {spendB.total !== spendA.total && <span>({spendB.total > spendA.total ? "+" : ""}{fmt(spendB.total - spendA.total)})</span>}</div>
          </div>
        </div>
        {compData.length > 0 && (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={compData} layout="vertical" margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
              <XAxis type="number" tickFormatter={v => `$${v}`} tick={{ fill: "#888", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={75} tick={{ fill: "#AAA", fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={v => fmt(v)} contentStyle={{ background: "#1A1A18", border: "1px solid #333", borderRadius: 3, color: "#CCC", fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10, color: "#888" }} />
              <Bar dataKey={monthLabel(compareA)} fill="#555" radius={[0, 2, 2, 0]} barSize={8} />
              <Bar dataKey={monthLabel(compareB)} fill="#C9A227" radius={[0, 2, 2, 0]} barSize={8} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Category trend lines */}
      {catTrendData.length > 0 && (
        <div style={S.card}>
          <div style={S.cTitle}>Category Trends</div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trendData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
              <XAxis dataKey="month" tick={{ fill: "#888", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `$${v}`} tick={{ fill: "#888", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={v => fmt(v)} contentStyle={{ background: "#1A1A18", border: "1px solid #333", borderRadius: 3, color: "#CCC", fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {catTrendData.map((c, i) => (
                <Line key={c.name} type="monotone" dataKey={c.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
