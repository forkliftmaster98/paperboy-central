import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import Papa from "papaparse";

// ── Constants ────────────────────────────────────────────
const STORAGE_KEY = "budget-manager-v3";
const TABS = ["Dashboard", "Transactions", "Budget", "Goals", "Trends"];
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
  { id: "r3", keywords: "netflix,spotify,hulu,disney,amazon prime,apple,youtube", categoryId: "subscriptions" },
  { id: "r4", keywords: "chipotle,mcdonald,dunkin,starbucks,pizza,burger,taco,subway,wendy,restaurant,cafe,diner", categoryId: "dining" },
  { id: "r5", keywords: "stop shop,shaws,market,whole foods,aldi,walmart,hannaford,trader joe,price chopper,big y", categoryId: "groceries" },
  { id: "r6", keywords: "shell,sunoco,mobil,bp,citgo,exxon,gulf,cumberland,irving,gas station", categoryId: "gas" },
  { id: "r7", keywords: "amazon,target,tj maxx,marshalls,kohls,home depot,lowes,bestbuy", categoryId: "shopping" },
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
  return { incomes: [], categories: DEFAULT_CATEGORIES, transactions: [], savings: [], debts: [], rules: DEFAULT_RULES, recurring: [] };
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
  const txs = data.transactions.filter(t => monthKey(t.date) === month);
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

// ── Styles ────────────────────────────────────────────────
const S = {
  root: { fontFamily: "'Inter', -apple-system, sans-serif", background: "#111110", color: "#E8E4DB", minHeight: "100vh" },
  wrap: { maxWidth: 960, margin: "0 auto", padding: "20px 14px 100px" },
  hdr: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 6 },
  h1: { fontSize: 20, fontWeight: 600, margin: 0, letterSpacing: "-0.02em" },
  monthNav: { display: "flex", alignItems: "center", gap: 6 },
  mBtn: { background: "none", border: "1px solid #333", color: "#999", borderRadius: 3, padding: "3px 9px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" },
  mLbl: { fontSize: 13, color: "#999", minWidth: 130, textAlign: "center", fontFamily: "monospace" },
  tabs: { display: "flex", gap: 0, borderBottom: "1px solid #2A2A28", margin: "14px 0 20px", overflowX: "auto" },
  tab: (a) => ({ padding: "9px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer", background: "none", border: "none", borderBottom: a ? "2px solid #C9A227" : "2px solid transparent", color: a ? "#E8E4DB" : "#777", fontFamily: "inherit", whiteSpace: "nowrap" }),
  card: { background: "#1A1A18", borderRadius: 4, padding: "16px 18px", marginBottom: 12, border: "1px solid #2A2A28" },
  cTitle: { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#888", marginBottom: 10 },
  row: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" },
  inp: { background: "#111110", border: "1px solid #333", borderRadius: 3, padding: "7px 9px", color: "#E8E4DB", fontSize: 14, fontFamily: "inherit", flex: 1, minWidth: 80 },
  inpSm: { background: "#111110", border: "1px solid #333", borderRadius: 3, padding: "7px 9px", color: "#E8E4DB", fontSize: 14, fontFamily: "inherit", width: 105 },
  sel: { background: "#111110", border: "1px solid #333", borderRadius: 3, padding: "7px 9px", color: "#E8E4DB", fontSize: 14, fontFamily: "inherit", minWidth: 110 },
  btn: { background: "#C9A227", color: "#111", border: "none", borderRadius: 3, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  btnD: { background: "#9C4A3C", color: "#fff", border: "none", borderRadius: 3, padding: "3px 8px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" },
  btnG: { background: "none", border: "1px solid #333", color: "#999", borderRadius: 3, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
  btnTeal: { background: "#3E7C74", color: "#fff", border: "none", borderRadius: 3, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  tbl: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "7px 8px", borderBottom: "1px solid #2A2A28", color: "#888", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" },
  td: { padding: "7px 8px", borderBottom: "1px solid #1F1F1D", color: "#CCC" },
  statV: { fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" },
  statL: { fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 3 },
  bar: { height: 6, borderRadius: 3, background: "#2A2A28", overflow: "hidden", marginTop: 5 },
  barF: (p, c) => ({ height: "100%", borderRadius: 3, background: c, width: `${Math.min(p, 100)}%`, transition: "width 0.3s" }),
  overB: { display: "inline-block", background: "#9C4A3C", color: "#fff", fontSize: 10, fontWeight: 600, padding: "1px 5px", borderRadius: 2, marginLeft: 5 },
  underB: { display: "inline-block", background: "#3E7C74", color: "#fff", fontSize: 10, fontWeight: 600, padding: "1px 5px", borderRadius: 2, marginLeft: 5 },
  empty: { color: "#666", fontSize: 13, padding: "16px 0", textAlign: "center" },
  delBtn: { background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 13, padding: "1px 5px" },
  pbFloat: { position: "fixed", bottom: 20, right: 20, zIndex: 1000 },
  pbBtn: { width: 56, height: 56, borderRadius: "50%", background: "#1A6B3C", border: "3px solid #C9A227", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.5)", transition: "transform 0.15s" },
  pbPanel: { position: "fixed", bottom: 86, right: 16, width: 340, maxWidth: "calc(100vw - 32px)", maxHeight: "70vh", background: "#1A1A18", border: "1px solid #2A2A28", borderRadius: 8, boxShadow: "0 8px 40px rgba(0,0,0,0.6)", display: "flex", flexDirection: "column", zIndex: 1001 },
  pbHdr: { padding: "12px 14px", borderBottom: "1px solid #2A2A28", display: "flex", justifyContent: "space-between", alignItems: "center" },
  pbBody: { flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 },
  pbInput: { display: "flex", gap: 6, padding: "10px 14px", borderTop: "1px solid #2A2A28" },
  pbMsg: (isUser) => ({ background: isUser ? "#2A2A28" : "#1F2E1F", padding: "8px 12px", borderRadius: 6, fontSize: 13, lineHeight: 1.55, color: "#DDD", alignSelf: isUser ? "flex-end" : "flex-start", maxWidth: "90%", whiteSpace: "pre-wrap", wordBreak: "break-word" }),
  pbQuick: { display: "flex", flexWrap: "wrap", gap: 5, padding: "6px 14px 0" },
  pbQBtn: { background: "#222", border: "1px solid #333", color: "#AAA", borderRadius: 12, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" },
  tipCard: (type) => ({ padding: "10px 14px", borderRadius: 4, fontSize: 13, lineHeight: 1.5, borderLeft: `3px solid ${type === "good" ? "#5B8A72" : type === "warning" || type === "over" ? "#C9A227" : type === "danger" ? "#9C4A3C" : "#3E7C74"}`, background: "#1F1F1D", marginBottom: 8 }),
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

// ════════════════════════════════════════════════════════
//  MAIN APP
// ════════════════════════════════════════════════════════
export default function BudgetManager() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState(0);
  const [month, setMonth] = useState(curMonth());
  const [loading, setLoading] = useState(true);
  const [pbOpen, setPbOpen] = useState(false);

  const save = useCallback(async (nd) => {
    setData(nd);
    try { await window.storage.set(STORAGE_KEY, JSON.stringify(nd)); } catch(e) { console.error(e); }
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
    monthTx.forEach(tx => { t[tx.categoryId] = (t[tx.categoryId] || 0) + tx.amount; });
    return t;
  }, [data, monthTx]);
  const totalSpent = useMemo(() => Object.values(catSpend).reduce((s, v) => s + v, 0), [catSpend]);
  const totalBudgeted = useMemo(() => data ? data.categories.reduce((s, c) => s + c.budget, 0) : 0, [data]);
  const totalIncome = useMemo(() => data ? getMonthlyIncome(data.incomes) : 0, [data]);

  if (loading || !data) return <div style={{ ...S.root, display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}><p style={{ color: "#888" }}>Loading...</p></div>;

  // CRUD
  const addTx = (tx) => save({ ...data, transactions: [...data.transactions, { ...tx, id: uid() }] });
  const addTxBatch = (txs) => save({ ...data, transactions: [...data.transactions, ...txs.map(t => ({ ...t, id: uid() }))] });
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

  return (
    <div style={S.root}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={S.wrap}>
        <div style={S.hdr}>
          <h1 style={S.h1}>Budget Manager</h1>
          <div style={S.monthNav}>
            <button style={S.mBtn} onClick={() => shiftMonth(-1)}>&larr;</button>
            <span style={S.mLbl}>{monthLabelLong(month)}</span>
            <button style={S.mBtn} onClick={() => shiftMonth(1)}>&rarr;</button>
          </div>
        </div>
        <div style={S.tabs}>
          {TABS.map((t, i) => <button key={t} style={S.tab(i === tab)} onClick={() => setTab(i)}>{t}</button>)}
        </div>

        {tab === 0 && <Dashboard data={data} monthTx={monthTx} catSpend={catSpend} totalSpent={totalSpent} totalBudgeted={totalBudgeted} totalIncome={totalIncome} month={month} />}
        {tab === 1 && <Transactions data={data} monthTx={monthTx} addTx={addTx} addTxBatch={addTxBatch} delTx={delTx} addRecurring={addRecurring} delRecurring={delRecurring} />}
        {tab === 2 && <BudgetTab data={data} catSpend={catSpend} totalIncome={totalIncome} addInc={addInc} delInc={delInc} updCat={updCat} addCat={addCat} delCat={delCat} addRule={addRule} delRule={delRule} />}
        {tab === 3 && <GoalsTab data={data} addSav={addSav} updSav={updSav} delSav={delSav} depositSav={depositSav} addDbt={addDbt} updDbt={updDbt} delDbt={delDbt} totalIncome={totalIncome} />}
        {tab === 4 && <TrendsTab data={data} month={month} />}
      </div>

      {/* PaperBoy */}
      <div style={S.pbFloat}>
        <div style={S.pbBtn} onClick={() => setPbOpen(!pbOpen)} onMouseEnter={e => e.currentTarget.style.transform = "scale(1.08)"} onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
          <PaperBoySVG size={36} />
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
    return `Month: ${monthLabelLong(month)}\nMonthly income: ${fmt(totalIncome)}\nSpent this month: ${fmt(totalSpent)}\nRemaining: ${fmt(totalIncome - totalSpent)}\n\nCategory budgets vs spending:\n${cats}\n\nSavings goals:\n${savs}\n\nDebts:\n${dbts}\n\nRecurring bills:\n${rec}`;
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

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        <div style={S.card}><div style={{ ...S.statV, color: "#5B8A72" }}>{fmt(totalIncome)}</div><div style={S.statL}>Monthly Income</div></div>
        <div style={S.card}><div style={{ ...S.statV, color: totalSpent > totalIncome ? "#9C4A3C" : "#E8E4DB" }}>{fmt(totalSpent)}</div><div style={S.statL}>Spent</div></div>
        <div style={S.card}><div style={{ ...S.statV, color: remaining < 0 ? "#9C4A3C" : "#5B8A72" }}>{fmt(remaining)}</div><div style={S.statL}>Remaining</div></div>
      </div>

      {totalBudgeted > 0 && (
        <div style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3, color: "#AAA" }}>
            <span style={{ ...S.cTitle, marginBottom: 0 }}>Budget Health</span>
            <span style={{ color: (totalBudgeted - totalSpent) < 0 ? "#9C4A3C" : "#5B8A72" }}>{fmt(totalBudgeted - totalSpent)} left of {fmt(totalBudgeted)}</span>
          </div>
          <div style={S.bar}><div style={S.barF(pct(totalSpent, totalBudgeted), totalSpent > totalBudgeted ? "#9C4A3C" : "#C9A227")} /></div>
          {overCats.length > 0 && <div style={{ marginTop: 8, fontSize: 11, color: "#9C4A3C" }}>Over budget: {overCats.map(c => `${c.name} (+${fmt((catSpend[c.id] || 0) - c.budget)})`).join(", ")}</div>}
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
      header: true, skipEmptyLines: true,
      complete: (results) => {
        if (results.data.length > 0) {
          setCsvData(results);
          const cols = results.meta.fields || [];
          const dateCols = cols.filter(c => /date|time/i.test(c));
          const amtCols = cols.filter(c => /amount|total|price|debit|credit|sum/i.test(c));
          const descCols = cols.filter(c => /desc|memo|note|narr|detail|merchant|payee/i.test(c));
          const map = { date: dateCols[0] || cols[0] || "", amount: amtCols[0] || cols[1] || "", desc: descCols[0] || cols[2] || "" };
          setCsvMap(map);
          // Build rows with auto-categorization
          const rows = results.data.map(row => {
            const d = row[map.desc] || "";
            const matched = autoCategory(d, data.rules || [], data.categories);
            return { ...row, _catId: matched?.id || csvCat, _matched: !!matched };
          });
          setCsvRows(rows);
        }
      }
    });
  };

  const importCSV = () => {
    if (!csvData || !csvMap.date || !csvMap.amount) return;
    const txs = [];
    csvRows.forEach(row => {
      const rawAmt = String(row[csvMap.amount] || "").replace(/[^0-9.-]/g, "");
      const amt = Math.abs(parseFloat(rawAmt));
      if (!amt || amt <= 0) return;
      const parsed = new Date(row[csvMap.date] || "");
      const dateStr = isNaN(parsed.getTime()) ? todayStr() : parsed.toISOString().slice(0, 10);
      const cat = data.categories.find(c => c.id === row._catId) || data.categories[0];
      txs.push({ date: dateStr, amount: amt, categoryId: cat.id, categoryName: cat.name, description: row[csvMap.desc] || cat.name || "" });
    });
    if (txs.length > 0) addTxBatch(txs);
    setCsvData(null); setCsvRows([]); setCsvMode(false);
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
                  {csvRows.length} rows -- {csvRows.filter(r => r._matched).length} auto-categorized. Review and adjust below:
                </div>
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
                  <button style={S.btn} onClick={importCSV}>Import {csvRows.length} Transactions</button>
                  <button style={S.btnG} onClick={() => { setCsvData(null); setCsvRows([]); }}>Cancel</button>
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
          <span style={{ fontSize: 12, color: "#888", fontFamily: "monospace" }}>Total: {fmt(filtered.reduce((s, t) => s + t.amount, 0))}</span>
        </div>
        {filtered.length === 0 ? <div style={S.empty}>No transactions match.</div> : (
          <div style={{ overflowX: "auto" }}><table style={S.tbl}><thead><tr><th style={S.th}>Date</th><th style={S.th}>Description</th><th style={S.th}>Category</th><th style={{ ...S.th, textAlign: "right" }}>Amount</th><th style={{ ...S.th, width: 24 }}></th></tr></thead><tbody>
            {filtered.map(t => <tr key={t.id}><td style={{ ...S.td, fontFamily: "monospace", fontSize: 11, color: "#888", whiteSpace: "nowrap" }}>{t.date}</td><td style={S.td}>{t.description}{t.fromRecurring && <span style={{ ...S.underB, marginLeft: 4 }}>auto</span>}{t.isSavingsDeposit && <span style={{ ...S.underB, marginLeft: 4 }}>savings</span>}</td><td style={{ ...S.td, color: "#888" }}>{t.categoryName}</td><td style={{ ...S.td, textAlign: "right", fontFamily: "monospace" }}>{fmt(t.amount)}</td><td style={S.td}><button style={S.delBtn} onClick={() => delTx(t.id)}>x</button></td></tr>)}
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
        <td style={S.td}>{c.budget > 0 && <div style={S.bar}><div style={S.barF(pct(sp, c.budget), over ? "#9C4A3C" : "#5B8A72")} /></div>}</td>
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
function GoalsTab({ data, addSav, updSav, delSav, depositSav, addDbt, updDbt, delDbt, totalIncome }) {
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
          <span style={{ fontSize: 12, color: "#5B8A72", fontFamily: "monospace" }}>Total saved: {fmt(totalSaved)}</span>
        </div>
        {data.savings.length === 0 ? <div style={S.empty}>No savings goals.</div> : data.savings.map(g => {
          const p = pct(g.saved, g.target);
          const monthsLeft = g.targetDate ? Math.max(1, Math.ceil((new Date(g.targetDate) - new Date()) / (1000 * 60 * 60 * 24 * 30))) : null;
          const needed = monthsLeft ? (g.target - g.saved) / monthsLeft : null;
          const onPace = needed !== null && totalIncome > 0 ? needed <= totalIncome * 0.3 : true;
          return (
            <div key={g.id} style={{ padding: "12px 0", borderBottom: "1px solid #222" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ fontWeight: 500 }}>{g.name}</span>
                <span style={{ fontSize: 11, color: "#888" }}>{g.targetDate || "No deadline"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#AAA", margin: "3px 0" }}>
                <span>{fmt(g.saved)} / {fmt(g.target)}</span>
                <span>{p}%</span>
              </div>
              <div style={S.bar}><div style={S.barF(p, "#5B8A72")} /></div>
              {needed !== null && (
                <div style={{ fontSize: 11, color: onPace ? "#5B8A72" : "#C9A227", marginTop: 4 }}>
                  {fmt(needed)}/mo needed to hit deadline {!onPace && "-- may need to adjust"}
                </div>
              )}
              <div style={{ marginTop: 6, display: "flex", gap: 5, alignItems: "center" }}>
                <input type="number" placeholder="$ deposit" style={{ ...S.inpSm, width: 85, padding: "3px 6px", fontSize: 12 }}
                  onKeyDown={e => { if (e.key === "Enter") { const v = parseFloat(e.target.value); if (v > 0) { depositSav(g, v); e.target.value = ""; } } }} />
                <span style={{ fontSize: 10, color: "#555" }}>Enter to deposit</span>
                <div style={{ flex: 1 }} />
                <button style={S.btnD} onClick={() => delSav(g.id)}>Remove</button>
              </div>
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
          <span style={{ fontSize: 12, color: totalDebt > 0 ? "#9C4A3C" : "#5B8A72", fontFamily: "monospace" }}>Total: {fmt(totalDebt)}</span>
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
                    <td style={{ ...S.td, color: d.rate > 15 ? "#C9A227" : "#888" }}>{d.rate}%</td>
                    <td style={{ ...S.td, fontFamily: "monospace", fontSize: 11 }}>{fmt(d.minPayment)}{d.extraPayment > 0 ? ` +${fmt(d.extraPayment)}` : ""}</td>
                    <td style={{ ...S.td, fontSize: 11 }}>
                      <span style={{ color: po.months === Infinity ? "#9C4A3C" : "#C9A227" }}>{po.text}</span>
                      {simPo && <div style={{ color: "#5B8A72", fontSize: 10, marginTop: 2 }}>+{fmt(simAmt)}/mo: {simPo.text}</div>}
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
    const txs = data.transactions.filter(t => monthKey(t.date) === m);
    const totals = {};
    data.categories.forEach(c => { totals[c.id] = 0; });
    txs.forEach(t => { totals[t.categoryId] = (totals[t.categoryId] || 0) + t.amount; });
    return { totals, total: txs.reduce((s, t) => s + t.amount, 0) };
  }, [data]);

  const trendData = useMemo(() => {
    return months.map(m => {
      const { totals, total } = getMonthSpend(m);
      const row = { month: monthLabel(m), total };
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
            <div style={{ ...S.statV, color: spendB.total > spendA.total ? "#9C4A3C" : "#5B8A72", fontSize: 20 }}>{fmt(spendB.total)}</div>
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
