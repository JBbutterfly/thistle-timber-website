// Homebook front end. Plain JS modules, no build step.
// DOM is built with h() (never innerHTML with data) so recognized text can't inject markup.

/* ---------------- utilities ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v; // only used for static icon SVG
    else if (k in el && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const fmt = (c, opts = {}) => {
  if (c === null || c === undefined) return "—";
  const v = (c / 100).toLocaleString(undefined, { style: "currency", currency: "USD", ...opts });
  return v;
};
const fmt0 = (c) => fmt(c, { maximumFractionDigits: 0, minimumFractionDigits: 0 });
const toCents = (s) => {
  const n = parseFloat(String(s).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};
const centsInput = (c) => (c === null || c === undefined ? "" : (c / 100).toFixed(2));
const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const thisMonth = () => todayISO().slice(0, 7);
const monthLabel = (m) => new Date(m + "-15").toLocaleDateString(undefined, { month: "long", year: "numeric" });
const shortMonth = (m) => new Date(m + "-15").toLocaleDateString(undefined, { month: "short" });
const shiftMonth = (m, d) => { let [y, mo] = m.split("-").map(Number); mo += d; while (mo < 1) { mo += 12; y--; } while (mo > 12) { mo -= 12; y++; } return `${y}-${String(mo).padStart(2, "0")}`; };
const niceDate = (d) => d ? new Date(d + "T12:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

async function request(method, url, body, isForm = false) {
  const opts = { method, credentials: "same-origin", headers: {} };
  if (body !== undefined) {
    if (isForm) opts.body = body;
    else { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  }
  const r = await fetch(url, opts);
  if (r.status === 401 && !/\/api\/(login|setup|me)$/.test(url)) { state.user = null; render(); throw new ApiError(401, "Signed out"); }
  const data = r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text();
  if (!r.ok) {
    let msg = typeof data === "object" ? data.detail : data;
    if (Array.isArray(msg)) msg = msg.map((e) => `${e.loc?.slice(-1)[0] ?? ""}: ${e.msg}`).join("; ");
    throw new ApiError(r.status, msg || r.statusText);
  }
  return data;
}
const api = {
  get: (u) => request("GET", u),
  post: (u, b = {}) => request("POST", u, b),
  put: (u, b) => request("PUT", u, b),
  patch: (u, b) => request("PATCH", u, b),
  del: (u) => request("DELETE", u),
  upload: (u, file) => { const f = new FormData(); f.append("image", file); return request("POST", u, f, true); },
};

function toast(msg, ms = 2600) {
  const t = h("div", { class: "toast", role: "status" }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}
const fail = (e) => { if (e.status !== 401) toast(e.message || "Something went wrong", 4000); console.error(e); };

function sheet(title, body, { onClose } = {}) {
  const dlg = h("dialog", { class: "sheet" },
    h("div", { class: "sheet-head" }, h("h1", {}, title),
      h("button", { class: "iconbtn", "aria-label": "Close", onclick: () => close() , html: ICON.x })),
    h("div", { class: "sheet-body" }, body));
  const close = () => { dlg.close(); };
  dlg.addEventListener("close", () => { dlg.remove(); onClose && onClose(); });
  document.body.append(dlg);
  dlg.showModal();
  return { close, el: dlg, setBody: (b) => { const sb = $(".sheet-body", dlg); sb.replaceChildren(b); } };
}

function field(label, input) { return h("label", { class: "field" }, h("span", {}, label), input); }
function busy(text = "Working…") { return h("div", { class: "row", style: "padding:20px 0" }, h("div", { class: "spinner" }), h("span", { class: "muted" }, text)); }

function pickFile({ capture = true } = {}) {
  return new Promise((resolve) => {
    const inp = h("input", { type: "file", accept: "image/*", style: "display:none" });
    if (capture) inp.setAttribute("capture", "environment");
    inp.addEventListener("change", () => { resolve(inp.files[0] || null); inp.remove(); });
    document.body.append(inp);
    inp.click();
  });
}

/* ---------------- icons (static SVG) ---------------- */
const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const ICON = {
  home: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>'),
  list: svg('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  box: svg('<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>'),
  wallet: svg('<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/><circle cx="16.5" cy="15" r="1.2"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  pen: svg('<path d="M4 20h4L19 9l-4-4L4 16v4z"/>'),
  barcode: svg('<path d="M4 6v12M7 6v12M10 6v12M14 6v12M16 6v12M20 6v12"/>'),
  receipt: svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  left: svg('<path d="M15 6l-6 6 6 6"/>'),
  right: svg('<path d="M9 6l6 6-6 6"/>'),
  logo: `<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#2f6b4f"/><path d="M8 9h7a3 3 0 013 3v12a2.5 2.5 0 00-2.5-2.5H8z" fill="#e2eee7"/><path d="M24 9h-4a2 2 0 00-2 2v13a2.5 2.5 0 012.5-2.5H24z" fill="#b9d6c5"/></svg>`,
};

/* ---------------- state ---------------- */
const state = { user: null, cats: [], accounts: [], items: [], view: "home", month: thisMonth(), setup: null };

async function loadRefs() {
  [state.cats, state.accounts] = await Promise.all([api.get("/api/categories"), api.get("/api/accounts")]);
}
async function loadItems() { state.items = await api.get("/api/items"); return state.items; }

function catName(id) { const c = state.cats.find((c) => c.id === id); return c ? (c.parent_name ? `${c.parent_name} › ${c.name}` : c.name) : ""; }

function categorySelect(value, { allowEmpty = true, kinds = null } = {}) {
  const sel = h("select", {});
  if (allowEmpty) sel.append(h("option", { value: "" }, "— Category —"));
  const parents = state.cats.filter((c) => !c.parent_id && (!kinds || kinds.includes(c.kind)));
  for (const p of parents) {
    const g = h("optgroup", { label: p.name });
    g.append(h("option", { value: p.id }, `${p.name} (general)`));
    for (const c of state.cats.filter((c) => c.parent_id === p.id)) g.append(h("option", { value: c.id }, c.name));
    sel.append(g);
  }
  sel.value = value ?? "";
  return sel;
}
function accountSelect(value) {
  const sel = h("select", {}, h("option", { value: "" }, "— Paid with —"), state.accounts.map((a) => h("option", { value: a.id }, a.name)));
  sel.value = value ?? "";
  return sel;
}
const intOrNull = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

/* ---------------- shell & routing ---------------- */
const TABS = [
  ["home", "Home", ICON.home],
  ["activity", "Activity", ICON.list],
  ["add", "Add", ICON.plus],
  ["stock", "Stock", ICON.box],
  ["budget", "Budget", ICON.wallet],
];

function shell(title, content, actions = []) {
  const app = $("#app");
  app.replaceChildren(
    h("header", { class: "top" },
      h("div", { class: "brand" }, h("span", { html: ICON.logo }), h("h1", {}, title)),
      h("div", { class: "row" }, actions,
        h("button", { class: "iconbtn", "aria-label": "Settings", onclick: () => go("settings"), html: ICON.gear }))),
    h("main", {}, content),
    h("nav", { class: "tabs" }, TABS.map(([key, label, icon]) => key === "add"
      ? h("button", { class: "add", onclick: openAdd, "aria-label": "Add" }, h("span", { class: "plus", html: icon }), label)
      : h("button", { class: state.view === key ? "active" : "", onclick: () => go(key), html: icon + `<span>${label}</span>` }))),
  );
}

function go(view) { state.view = view; location.hash = view; render(); }
window.addEventListener("hashchange", () => { const v = location.hash.slice(1); if (v && v !== state.view && VIEWS[v]) { state.view = v; render(); } });

async function render() {
  if (!state.user) return renderAuth();
  try { await (VIEWS[state.view] || VIEWS.home)(); } catch (e) { fail(e); }
}

/* ---------------- auth ---------------- */
async function renderAuth() {
  const app = $("#app");
  const s = state.setup || (state.setup = await api.get("/api/setup-status"));
  const name = h("input", { autocomplete: "name", required: true });
  const user = h("input", { autocomplete: "username", autocapitalize: "none", required: true });
  const pw = h("input", { type: "password", autocomplete: s.needs_setup ? "new-password" : "current-password", required: true });
  const err = h("p", { class: "small", style: "color:var(--bad)" });
  const form = h("form", { class: "card stack", onsubmit: async (e) => {
    e.preventDefault(); err.textContent = "";
    try {
      state.user = s.needs_setup
        ? await api.post("/api/setup", { name: name.value, username: user.value, password: pw.value })
        : await api.post("/api/login", { username: user.value, password: pw.value });
      state.user = await api.get("/api/me");
      await loadRefs();
      go(location.hash.slice(1) && VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : "home");
    } catch (ex) { err.textContent = ex.message; }
  } },
    s.needs_setup ? h("p", { class: "muted small" }, "First run: create the household admin account. You can add family members in Settings.") : null,
    s.needs_setup ? field("Your name", name) : null,
    field("Username", user),
    field(s.needs_setup ? "Password (8+ characters)" : "Password", pw),
    err,
    h("button", { class: "btn primary block", type: "submit" }, s.needs_setup ? "Create account" : "Sign in"));
  app.replaceChildren(h("div", { class: "auth stack" },
    h("div", { class: "brand", style: "justify-content:center;margin-bottom:12px" }, h("span", { html: ICON.logo }), h("h1", {}, "Homebook")),
    form));
}

/* ---------------- home ---------------- */
async function viewHome() {
  const m = state.month;
  const [s, ins, tr, inv] = await Promise.all([
    api.get(`/api/reports/summary?month=${m}`),
    api.get(`/api/reports/insights?month=${m}`),
    api.get(`/api/reports/trend?months=6`),
    api.get(`/api/inventory/shopping-list?days=7`),
  ]);
  const monthNav = h("div", { class: "row between" },
    h("button", { class: "iconbtn", "aria-label": "Previous month", onclick: () => { state.month = shiftMonth(m, -1); render(); }, html: ICON.left }),
    h("h2", { style: "margin:0" }, monthLabel(m)),
    h("button", { class: "iconbtn", "aria-label": "Next month", onclick: () => { state.month = shiftMonth(m, 1); render(); }, html: ICON.right }));

  const tiles = h("div", { class: "tiles" },
    h("div", { class: "tile" }, h("div", { class: "label" }, "Spent"), h("div", { class: "value" }, fmt0(s.expenses)),
      h("div", { class: "sub" }, s.budget_expense_total ? `of ${fmt0(s.budget_expense_total)} budget` : s.days_elapsed < s.days_in_month && s.days_elapsed ? `on pace for ${fmt0(s.projected_month_spend)}` : "")),
    h("div", { class: "tile" }, h("div", { class: "label" }, "Income"), h("div", { class: "value" }, fmt0(s.income)),
      h("div", { class: "sub" }, s.savings ? `${fmt0(s.savings)} saved/invested` : "")),
    h("div", { class: `tile ${s.net >= 0 ? "good" : "bad"}` }, h("div", { class: "label" }, "Left to invest"),
      h("div", { class: "value" }, fmt0(s.net)), h("div", { class: "sub" }, "income − spending − savings")),
    h("div", { class: "tile" }, h("div", { class: "label" }, "Day-to-day, per day"), h("div", { class: "value" }, fmt(s.avg_daily_spend)),
      h("div", { class: "sub" }, `${fmt0(s.avg_weekly_spend)}/wk · bills add ${fmt(s.recurring.daily)}/day`)));

  const expenseCats = s.categories.filter((c) => c.kind === "expense" && (c.actual || c.budget));
  const maxActual = Math.max(1, ...expenseCats.map((c) => c.actual));
  const budgets = expenseCats.length ? h("div", { class: "list" }, expenseCats.map((c) => {
    const pct = c.budget ? Math.min(100, (100 * c.actual) / c.budget) : (100 * c.actual) / maxActual;
    const cls = c.over ? "over" : c.budget && pct > 85 ? "near" : "";
    return h("div", { class: "li" }, h("div", { class: "grow" },
      h("div", { class: "row between" }, h("span", { class: "title" }, c.name),
        h("span", { class: "num small" }, fmt0(c.actual), c.budget ? h("span", { class: "muted" }, ` / ${fmt0(c.budget)}`) : null)),
      h("div", { class: `bar ${cls}` }, h("i", { style: `width:${pct}%` }))));
  })) : h("div", { class: "list" }, h("div", { class: "empty" }, "No spending logged this month yet. Tap + to add your first expense."));

  const maxTrend = Math.max(1, ...tr.map((t) => t.expenses));
  const trend = h("div", { class: "card" }, h("h3", {}, "Spending, last 6 months"),
    h("div", { class: "trend" }, tr.map((t) => h("div", { class: `col ${t.month === thisMonth() ? "current" : ""}`, title: `${monthLabel(t.month)}: ${fmt0(t.expenses)}` },
      h("span", { class: "num" }, t.expenses ? fmt0(t.expenses) : ""),
      h("i", { style: `height:${(80 * t.expenses) / maxTrend}%` }), h("span", {}, shortMonth(t.month))))));

  const r = s.recurring;
  const bills = h("div", { class: "card" }, h("h3", {}, "Recurring bills & subscriptions"),
    h("p", { class: "num", style: "margin:6px 0 0" }, `${fmt0(r.monthly)}/month · ${fmt0(r.weekly)}/week · ${fmt(r.daily)}/day`),
    s.recurring_discretionary_annual ? h("p", { class: "muted small", style: "margin:4px 0 0" }, `${fmt0(s.recurring_discretionary_annual)}/year of that is discretionary.`) : null);

  shell("Homebook", h("div", { class: "stack" },
    monthNav, tiles,
    ins.length ? insightsBlock(ins) : null,
    h("h2", {}, "By category"), budgets,
    inv.length ? h("div", {}, h("h2", {}, "Restock soon"), h("div", { class: "list" }, inv.slice(0, 6).map(stockRow))) : null,
    h("h2", {}, "Trends"), trend, bills));
}

function insightsBlock(ins) {
  // Warnings first, then the rest; show four and fold the remainder.
  const order = { warn: 0, good: 1, info: 2 };
  const sorted = [...ins].sort((a, b) => order[a.level] - order[b.level]);
  const box = h("div", { class: "stack" });
  const draw = (all) => {
    // replaceChildren() doesn't flatten arrays or skip nulls the way h() does.
    box.replaceChildren(h("h2", {}, "Gaps & opportunities"),
      ...(all ? sorted : sorted.slice(0, 4)).map((i) => h("div", { class: `insight ${i.level}` }, h("span", {}, i.text))),
      ...(sorted.length > 4 ? [h("button", { class: "btn small", onclick: () => draw(!all) }, all ? "Show fewer" : `Show ${sorted.length - 4} more`)] : []));
  };
  draw(false);
  return box;
}

/* ---------------- activity ---------------- */
async function viewActivity() {
  const q = h("input", { type: "search", placeholder: "Search merchant or note", value: state.q || "" });
  const listBox = h("div", {});
  const load = async () => {
    state.q = q.value;
    const data = await api.get(`/api/transactions?limit=300${q.value ? `&q=${encodeURIComponent(q.value)}` : ""}`);
    if (!data.length) { listBox.replaceChildren(h("div", { class: "list" }, h("div", { class: "empty" }, "Nothing here yet."))); return; }
    listBox.replaceChildren(h("div", { class: "list" }, data.map((t) => {
      const cat = state.cats.find((c) => c.id === t.category_id);
      const isIncome = cat && cat.kind === "income";
      return h("div", { class: "li tap", onclick: () => editTransaction(t.id) },
        h("div", { class: "grow" },
          h("div", { class: "title" }, t.merchant || t.category_name || "Expense"),
          h("div", { class: "meta" }, [niceDate(t.date), t.line_count ? `${t.line_count} items` : t.category_name, t.user_name, t.source !== "manual" ? t.source : null, t.planned ? null : "unplanned"].filter(Boolean).join(" · "))),
        h("div", { class: `amt ${isIncome ? "income" : ""}` }, (isIncome ? "+" : "") + fmt(t.amount_cents)));
    })));
  };
  let timer;
  q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(load, 250); });
  shell("Activity", h("div", { class: "stack" }, q, listBox),
    [h("a", { class: "btn small", href: "/api/export/transactions.csv" }, "Export CSV")]);
  await load();
}

async function editTransaction(id) {
  try {
    const t = await api.get(`/api/transactions/${id}`);
    openTxEditor({
      tx_date: t.date, merchant: t.merchant, amount_cents: t.amount_cents, category_id: t.category_id, account_id: t.account_id,
      source: t.source, planned: !!t.planned, note: t.note, image_path: t.image_path,
      lines: t.lines.map((l) => ({ item_id: l.item_id, description: l.description, qty: l.qty, amount_cents: l.amount_cents, category_id: l.category_id })),
    }, { id });
  } catch (e) { fail(e); }
}

/* ---------------- transaction editor (manual, receipt, barcode all land here) ---------------- */
async function openTxEditor(draft = {}, { id = null, receiptTotal = null, title = null } = {}) {
  await loadItems();
  const d = { tx_date: todayISO(), planned: true, source: "manual", lines: [], ...draft };
  let itemized = d.lines.length > 0;

  const date = h("input", { type: "date", value: d.tx_date });
  const merchant = h("input", { value: d.merchant || "", placeholder: "Store, biller, or payee" });
  const amount = h("input", { inputmode: "decimal", placeholder: "0.00", value: centsInput(d.amount_cents) });
  const category = categorySelect(d.category_id);
  const account = accountSelect(d.account_id);
  const planned = h("input", { type: "checkbox", checked: d.planned });
  const note = h("input", { value: d.note || "", placeholder: "Optional" });

  const itemList = h("datalist", { id: "item-names" }, state.items.map((i) => h("option", { value: i.name }, i.brand || "")));
  const lines = d.lines.map((l) => ({ ...l }));
  const linesBox = h("div", { class: "stack" });
  const totalEl = h("div", { class: "row between" });

  const simpleBox = h("div", { class: "grid2" }, field("Amount", amount), field("Category", category));
  const modeSeg = h("div", { class: "seg" });
  const modeHint = h("span", { class: "muted small" });

  function refreshMode() {
    modeSeg.replaceChildren(
      h("button", { type: "button", class: itemized ? "" : "on", onclick: () => { itemized = false; refreshMode(); } }, "Simple"),
      h("button", { type: "button", class: itemized ? "on" : "", onclick: () => { itemized = true; if (!lines.length) lines.push(blankLine()); refreshMode(); } }, "Itemized"));
    modeHint.textContent = itemized ? "Link lines to items to track stock" : "One amount, one category";
    simpleBox.classList.toggle("hidden", itemized);
    linesWrap.classList.toggle("hidden", !itemized);
    drawLines();
  }
  const blankLine = () => ({ description: "", qty: 1, amount_cents: null, category_id: null, item_id: null, save_item: false });

  function drawLines() {
    linesBox.replaceChildren(...lines.map((l, idx) => lineEditor(l, idx)));
    updateTotal();
  }
  function updateTotal() {
    const sum = lines.reduce((a, l) => a + (l.amount_cents || 0), 0);
    totalEl.replaceChildren(h("b", {}, "Total"), h("b", { class: "num" }, fmt(sum)));
    if (receiptTotal !== null && receiptTotal !== undefined && sum !== receiptTotal) {
      totalEl.append(h("span", { class: "chip low" }, `receipt says ${fmt(receiptTotal)}`));
    }
  }

  function lineEditor(l, idx) {
    const item = l.item_id ? state.items.find((i) => i.id === l.item_id) : null;
    const desc = h("input", { value: l.description || item?.name || "", list: "item-names", placeholder: "Item or description" });
    const qty = h("input", { inputmode: "decimal", value: l.qty ?? 1 });
    const amt = h("input", { inputmode: "decimal", placeholder: "0.00", value: centsInput(l.amount_cents) });
    const cat = categorySelect(l.category_id);
    const save = h("input", { type: "checkbox", checked: !!l.save_item });
    const linkInfo = h("div", { class: "small" });
    const drawLink = () => {
      const it = l.item_id ? state.items.find((i) => i.id === l.item_id) : null;
      linkInfo.replaceChildren(it
        ? h("span", { class: "match" }, `✓ ${it.brand ? it.brand + " " : ""}${it.name}${it.category_name ? " · " + it.category_name : ""}`, l.match && l.match.how === "fuzzy" ? ` (guess, ${Math.round(l.match.score * 100)}%)` : "",
            " ", h("button", { type: "button", class: "btn small", onclick: () => { l.item_id = null; l.match = null; drawLink(); } }, "Unlink"))
        : h("label", { class: "check" }, save, "Save to item library (tracks stock & price)"));
      cat.parentElement && (cat.parentElement.style.display = it ? "none" : "");
    };
    desc.addEventListener("change", () => {
      l.description = desc.value;
      const hit = state.items.find((i) => i.name.toLowerCase() === desc.value.trim().toLowerCase());
      if (hit) { l.item_id = hit.id; l.match = null; }
      drawLink();
    });
    qty.addEventListener("input", () => { l.qty = parseFloat(qty.value) || 1; });
    amt.addEventListener("input", () => { l.amount_cents = toCents(amt.value); updateTotal(); });
    cat.addEventListener("change", () => { l.category_id = intOrNull(cat.value); });
    save.addEventListener("change", () => { l.save_item = save.checked; });
    const el = h("div", { class: "line stack" },
      l.raw ? h("div", { class: "raw" }, l.raw) : null,
      h("div", { class: "row" }, h("div", { class: "grow" }, desc),
        h("button", { type: "button", class: "iconbtn", "aria-label": "Remove line", onclick: () => { lines.splice(lines.indexOf(l), 1); drawLines(); }, html: ICON.x })),
      h("div", { class: "grid3" }, field("Qty", qty), field("Amount", amt), h("div", {}, field("Category", cat))),
      linkInfo);
    queueMicrotask(drawLink);
    return el;
  }

  const linesWrap = h("div", { class: "stack" }, linesBox,
    h("button", { type: "button", class: "btn block", onclick: () => { lines.push(blankLine()); drawLines(); } }, "+ Add line"),
    totalEl);

  const err = h("p", { class: "small", style: "color:var(--bad)" });
  const saveBtn = h("button", { class: "btn primary block", type: "submit" }, id ? "Save changes" : "Save");
  const form = h("form", { class: "stack", onsubmit: async (e) => {
    e.preventDefault(); err.textContent = "";
    const body = {
      tx_date: date.value, merchant: merchant.value || null, account_id: intOrNull(account.value),
      source: d.source, planned: planned.checked, note: note.value || null, image_path: d.image_path || null,
    };
    if (itemized) {
      body.lines = lines.filter((l) => l.amount_cents).map((l) => {
        const out = { item_id: l.item_id || null, description: l.description || null, raw: l.raw || null, qty: l.qty || 1, amount_cents: l.amount_cents, category_id: l.item_id ? null : l.category_id };
        if (!l.item_id && l.save_item && l.description) out.new_item = { name: l.description, brand: l.brand || null, upc: l.upc || null, category_id: l.category_id };
        return out;
      });
      if (!body.lines.length) { err.textContent = "Add at least one line with an amount."; return; }
    } else {
      body.amount_cents = toCents(amount.value);
      body.category_id = intOrNull(category.value);
      if (!body.amount_cents) { err.textContent = "Enter an amount."; return; }
      if (!body.category_id) { err.textContent = "Pick a category."; return; }
    }
    saveBtn.disabled = true;
    try {
      if (id) await api.put(`/api/transactions/${id}`, body); else await api.post("/api/transactions", body);
      s.close(); toast("Saved"); render();
    } catch (ex) { err.textContent = ex.message; saveBtn.disabled = false; }
  } },
    itemList,
    h("div", { class: "grid2" }, field("Date", date), field("Paid with", account)),
    field("Merchant", merchant),
    h("div", { class: "row between" }, modeHint, modeSeg),
    simpleBox, linesWrap,
    field("Note", note),
    h("label", { class: "check" }, planned, "Planned purchase"),
    d.image_path ? h("a", { href: `/api/uploads/${d.image_path}`, target: "_blank", class: "small" }, "View photo") : null,
    err, saveBtn,
    id ? h("button", { type: "button", class: "btn danger block", onclick: async () => {
      if (!confirm("Delete this transaction? Stock added by it will be removed too.")) return;
      try { await api.del(`/api/transactions/${id}`); s.close(); toast("Deleted"); render(); } catch (ex) { fail(ex); }
    } }, "Delete") : null);

  const s = sheet(title || (id ? "Edit transaction" : "Add expense"), form);
  refreshMode();
}

/* ---------------- add: choose a method ---------------- */
function openAdd() {
  const ai = state.user.ai_enabled;
  const method = (icon, name, desc, fn, disabled = false) => h("button", { class: `method ${disabled ? "disabled" : ""}`, onclick: () => {
    if (disabled) { toast("Set ANTHROPIC_API_KEY on the server to enable receipt reading.", 4000); return; }
    s.close(); fn();
  } },
    h("span", { html: icon }), h("b", {}, name), h("span", {}, desc));
  const s = sheet("Add", h("div", { class: "stack" },
    h("div", { class: "methods" },
      method(ICON.pen, "Manual", "Type an amount or itemize", () => openTxEditor()),
      method(ICON.barcode, "Scan barcode", "Look up or add an item", openBarcode),
      method(ICON.receipt, "Receipt photo", ai ? "Read every line with AI" : "Needs an API key", openReceipt, !ai),
      method(ICON.camera, "Product photo", ai ? "Identify an item with AI" : "Barcode only without a key", openProductPhoto)),
    h("button", { class: "btn block", onclick: () => { s.close(); openTxEditor({ category_id: state.cats.find((c) => c.name === "Paycheck")?.id }, { title: "Add income" }); } }, "Add income"),
    ai ? h("p", { class: "muted small" }, "Receipt and product photos are sent to Claude only when you choose them. Barcodes are decoded on your own server.") : null));
}

/* ---------------- barcode ---------------- */
function openBarcode() {
  const out = h("div", { class: "stack" });
  const code = h("input", { inputmode: "numeric", placeholder: "Type the barcode number" });
  let stream = null, stopLoop = false;
  const stop = () => { stopLoop = true; stream && stream.getTracks().forEach((t) => t.stop()); stream = null; };
  const video = h("video", { class: "scan hidden", playsinline: true, muted: true });
  const liveOK = "BarcodeDetector" in window && window.isSecureContext && navigator.mediaDevices?.getUserMedia;

  async function handle(result) {
    stop(); video.classList.add("hidden");
    out.replaceChildren(await barcodeResult(result, () => s.close()));
  }
  async function lookup(text) {
    out.replaceChildren(busy("Looking up…"));
    try { await handle(await api.get(`/api/barcode/${encodeURIComponent(text)}`)); } catch (e) { fail(e); out.replaceChildren(); }
  }
  async function live() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      video.srcObject = stream; video.classList.remove("hidden"); await video.play();
      const det = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] });
      stopLoop = false;
      const tick = async () => {
        if (stopLoop) return;
        try { const found = await det.detect(video); if (found.length) return lookup(found[0].rawValue); } catch {}
        setTimeout(tick, 250);
      };
      tick();
    } catch (e) { toast("Camera unavailable. Use a photo instead."); }
  }
  async function photo() {
    const f = await pickFile(); if (!f) return;
    out.replaceChildren(busy("Reading barcode…"));
    try {
      const r = await api.upload("/api/barcode/decode", f);
      if (!r.codes.length) { out.replaceChildren(h("div", { class: "insight warn" }, h("span", {}, "No barcode found. Try closer, flatter, and in good light, or type the number."))); return; }
      handle(r.result);
    } catch (e) { fail(e); out.replaceChildren(); }
  }
  const s = sheet("Scan barcode", h("div", { class: "stack" },
    video,
    h("div", { class: "grid2" },
      liveOK ? h("button", { class: "btn primary", onclick: live }, "Live scan") : null,
      h("button", { class: `btn ${liveOK ? "" : "primary"}`, onclick: photo }, "Take photo")),
    h("form", { class: "row", onsubmit: (e) => { e.preventDefault(); if (code.value.trim()) lookup(code.value.trim()); } }, h("div", { class: "grow" }, code), h("button", { class: "btn" }, "Look up")),
    !liveOK ? h("p", { class: "muted small" }, "Live scanning needs Chrome on Android over HTTPS. Photo scanning works everywhere.") : null,
    out), { onClose: stop });
}

async function barcodeResult(res, closeParent) {
  if (res.item) return knownItemActions(res.item, closeParent);
  const sug = res.suggestion;
  return h("div", { class: "stack" },
    h("div", { class: "insight" }, h("span", {}, sug ? `New to your library. Suggested: ${sug.brand ? sug.brand + " " : ""}${sug.name}${sug.size ? " (" + sug.size + ")" : ""} from ${sug.source}.` : `Barcode ${res.upc} isn't in your library yet.`)),
    h("button", { class: "btn primary block", onclick: () => { closeParent(); openItemEditor({ upc: res.upc, name: sug?.name || "", brand: sug?.brand || "", notes: sug?.size ? `Size: ${sug.size}` : "" }, { thenPurchase: true }); } }, "Add to library"));
}

async function knownItemActions(item, closeParent) {
  const f = (await api.get(`/api/items/${item.id}`)).forecast;
  const qty = h("input", { inputmode: "decimal", value: "1" });
  const price = h("input", { inputmode: "decimal", placeholder: f.unit_cost ? centsInput(f.unit_cost) : "0.00", value: f.unit_cost ? centsInput(f.unit_cost) : "" });
  return h("div", { class: "stack" },
    h("div", { class: "card" }, h("b", {}, `${item.brand ? item.brand + " " : ""}${item.name}`),
      h("div", { class: "muted small" }, `${f.on_hand} on hand${f.days_left !== null ? ` · ~${Math.round(f.days_left)} days left` : ""}${f.unit_cost ? ` · usually ${fmt(f.unit_cost)}` : ""}`)),
    h("h3", {}, "Bought it"),
    h("div", { class: "grid2" }, field("Qty", qty), field("Price each", price)),
    h("button", { class: "btn primary block", onclick: () => {
      const q = parseFloat(qty.value) || 1, each = toCents(price.value) || 0;
      closeParent();
      openTxEditor({ source: "barcode", lines: [{ item_id: item.id, description: item.name, qty: q, amount_cents: Math.round(q * each) }] }, { title: "Log purchase" });
    } }, "Log purchase"),
    h("h3", {}, "Used it"),
    h("div", { class: "grid2" },
      h("button", { class: "btn", onclick: async () => { await logUse(item.id, 1); closeParent(); } }, "Used one up"),
      h("button", { class: "btn", onclick: () => { closeParent(); openItemDetail(item.id); } }, "View item")));
}

async function logUse(itemId, n = 1) {
  try { const f = await api.post("/api/inventory/events", { item_id: itemId, delta: n, kind: "use" }); toast(`Logged. ${f.on_hand} left.`); if (state.view === "stock" || state.view === "home") render(); }
  catch (e) { fail(e); }
}

/* ---------------- receipt & product photos ---------------- */
async function openReceipt() {
  const f = await pickFile(); if (!f) return;
  const s = sheet("Reading receipt", busy("Reading every line… this takes a few seconds."));
  try {
    const r = await api.upload("/api/recognize/receipt", f);
    s.close();
    const draft = { ...r.draft, image_path: r.image_path };
    draft.lines = draft.lines.map((l) => ({ ...l, save_item: !l.item_id && l.description !== "Sales tax" }));
    openTxEditor(draft, { receiptTotal: r.receipt_total_cents, title: "Review receipt" });
    if (r.mismatch_cents) toast(`Lines differ from the receipt total by ${fmt(Math.abs(r.mismatch_cents))}. Check before saving.`, 5000);
  } catch (e) { s.close(); fail(e); }
}

async function openProductPhoto() {
  const f = await pickFile(); if (!f) return;
  const s = sheet("Identifying product", busy("Looking at the photo…"));
  try {
    const r = await api.upload("/api/recognize/product", f);
    if (r.item) { s.setBody(await knownItemActions(r.item, s.close)); return; }
    s.close();
    const sg = r.suggestion || {};
    openItemEditor({ name: sg.name || "", brand: sg.brand || "", upc: r.upc || "", category_id: sg.category_id, image_path: r.image_path,
      notes: [sg.size ? `Size: ${sg.size}` : "", sg.confidence ? `AI confidence: ${sg.confidence}` : ""].filter(Boolean).join(" · ") }, { thenPurchase: true });
  } catch (e) {
    s.close();
    if (e.status === 503) toast("No barcode found, and AI recognition is off. Add an API key or enter it manually.", 5000); else fail(e);
  }
}

/* ---------------- items ---------------- */
function openItemEditor(item = {}, { id = null, thenPurchase = false } = {}) {
  const name = h("input", { value: item.name || "", required: true });
  const brand = h("input", { value: item.brand || "" });
  const upc = h("input", { value: item.upc || "", inputmode: "numeric" });
  const cat = categorySelect(item.category_id);
  const unit = h("input", { value: item.unit || "each", placeholder: "each, bottle, bag…" });
  const track = h("input", { type: "checkbox", checked: item.track_inventory ?? true });
  const reorder = h("input", { inputmode: "numeric", value: item.reorder_days ?? 7 });
  const minq = h("input", { inputmode: "decimal", value: item.min_qty ?? 0 });
  const notes = h("input", { value: item.notes || "" });
  const err = h("p", { class: "small", style: "color:var(--bad)" });
  const form = h("form", { class: "stack", onsubmit: async (e) => {
    e.preventDefault();
    const body = { name: name.value, brand: brand.value || null, upc: upc.value || null, category_id: intOrNull(cat.value), unit: unit.value || "each",
      track_inventory: track.checked, reorder_days: parseInt(reorder.value) || 0, min_qty: parseFloat(minq.value) || 0, notes: notes.value || null };
    try {
      const saved = id ? await api.put(`/api/items/${id}`, body) : await api.post("/api/items", body);
      s.close(); toast("Item saved");
      if (thenPurchase) { await loadItems(); openTxEditor({ source: item.image_path ? "photo" : "barcode", image_path: item.image_path, lines: [{ item_id: saved.id, description: saved.name, qty: 1, amount_cents: null }] }, { title: "Log purchase" }); }
      else render();
    } catch (ex) { err.textContent = ex.message; }
  } },
    field("Name", name), h("div", { class: "grid2" }, field("Brand", brand), field("Barcode", upc)),
    field("Category", cat),
    h("label", { class: "check" }, track, "Track stock and forecast"),
    h("div", { class: "grid3" }, field("Counted in", unit), field("Warn at days left", reorder), field("…or at qty", minq)),
    field("Notes", notes), err,
    h("button", { class: "btn primary block" }, thenPurchase ? "Save & log purchase" : "Save"),
    id ? h("button", { type: "button", class: "btn danger block", onclick: async () => { if (confirm("Delete this item and its stock history?")) { await api.del(`/api/items/${id}`); s.close(); render(); } } }, "Delete item") : null);
  const s = sheet(id ? "Edit item" : "New item", form);
}

async function openItemDetail(id) {
  try {
    const it = await api.get(`/api/items/${id}`);
    const f = it.forecast;
    const count = h("input", { inputmode: "decimal", value: f.on_hand });
    const stat = (label, value) => h("div", { class: "tile" }, h("div", { class: "label" }, label), h("div", { class: "value", style: "font-size:1.05rem" }, value));
    const s = sheet(`${it.brand ? it.brand + " " : ""}${it.name}`, h("div", { class: "stack" },
      h("div", { class: "row" }, h("span", { class: `chip ${f.status}` }, statusLabel(f.status)), h("span", { class: "muted small" }, it.category_name || "")),
      h("div", { class: "tiles" },
        stat("On hand", `${f.on_hand} ${it.unit}`),
        stat("Days left", f.days_left !== null ? `~${Math.round(f.days_left)}` : "learning"),
        stat("Cost / month", f.monthly_cost ? fmt(f.monthly_cost) : "—"),
        stat("Usual price", f.unit_cost ? fmt(f.unit_cost) : "—")),
      f.reorder_on ? h("p", { class: "small muted" }, `Reorder by ${niceDate(f.reorder_on)}; runs out around ${niceDate(f.runs_out_on)}. Based on ${f.rate_method === "usage" ? "logged use" : "how often you buy it"}.`) :
        h("p", { class: "small muted" }, "Forecast starts after a couple of purchases or a few ‘used one up’ taps."),
      h("div", { class: "row" }, h("div", { class: "grow" }, field("Physical count", count)),
        h("button", { class: "btn", style: "align-self:flex-end", onclick: async () => { await api.post("/api/inventory/count", { item_id: id, on_hand: parseFloat(count.value) || 0 }); s.close(); toast("Count saved"); render(); } }, "Set")),
      h("div", { class: "grid2" },
        h("button", { class: "btn", onclick: async () => { await logUse(id, 1); s.close(); } }, "Used one up"),
        h("button", { class: "btn", onclick: () => { s.close(); openItemEditor(it, { id }); } }, "Edit item")),
      it.prices.length ? h("div", {}, h("h2", {}, "Price history"), h("div", { class: "list" }, it.prices.map((p) =>
        h("div", { class: "li" }, h("div", { class: "grow" }, h("div", { class: "title" }, p.merchant || "—"), h("div", { class: "meta" }, niceDate(p.date))),
          h("div", { class: "amt" }, fmt(Math.round(p.amount_cents / (p.qty || 1))), h("span", { class: "muted small" }, " ea")))))) : null,
      it.history.length ? h("div", {}, h("h2", {}, "Stock history"), h("div", { class: "list" }, it.history.slice(0, 12).map((e) =>
        h("div", { class: "li" }, h("div", { class: "grow" }, h("div", { class: "title" }, e.kind), h("div", { class: "meta" }, [niceDate(e.date), e.user_name, e.note].filter(Boolean).join(" · "))),
          h("div", { class: "amt" }, (e.delta > 0 ? "+" : "") + e.delta))))) : null));
  } catch (e) { fail(e); }
}

const statusLabel = (s) => ({ out: "Out", low: "Low", ok: "Stocked", learning: "Learning" }[s] || s);

function stockRow(i) {
  return h("div", { class: "li tap", onclick: () => openItemDetail(i.item_id || i.id) },
    h("div", { class: "grow" },
      h("div", { class: "title" }, `${i.brand ? i.brand + " " : ""}${i.name}`),
      h("div", { class: "meta" }, [`${i.on_hand} ${i.unit}`, i.days_left !== null ? `~${Math.round(i.days_left)} days` : null, i.monthly_cost ? `${fmt(i.monthly_cost)}/mo` : null].filter(Boolean).join(" · "))),
    h("span", { class: `chip ${i.status}` }, statusLabel(i.status)),
    h("button", { class: "btn small", "aria-label": "Used one", onclick: (e) => { e.stopPropagation(); logUse(i.item_id || i.id, 1); } }, "−1"));
}

/* ---------------- stock ---------------- */
async function viewStock() {
  const mode = state.stockMode || "all";
  const data = mode === "shop" ? await api.get("/api/inventory/shopping-list?days=14") : await api.get("/api/inventory");
  const seg = h("div", { class: "seg" },
    h("button", { class: mode === "all" ? "on" : "", onclick: () => { state.stockMode = "all"; render(); } }, "All items"),
    h("button", { class: mode === "shop" ? "on" : "", onclick: () => { state.stockMode = "shop"; render(); } }, "Shopping list"));
  const monthly = data.reduce((a, i) => a + (i.monthly_cost || 0), 0);
  shell("Stock", h("div", { class: "stack" },
    h("div", { class: "row between wrap" }, seg, monthly ? h("span", { class: "muted small num" }, `Consumables ≈ ${fmt0(monthly)}/month`) : null),
    data.length ? h("div", { class: "list" }, data.map(stockRow))
      : h("div", { class: "list" }, h("div", { class: "empty" }, mode === "shop" ? "Nothing to restock in the next two weeks." : "No items yet. Scan a barcode or save receipt lines to build your library."))),
    [h("button", { class: "btn small", onclick: () => openItemEditor() }, "New item")]);
}

/* ---------------- budget: budgets, recurring, debts ---------------- */
async function viewBudget() {
  const tab = state.budgetTab || "budgets";
  const seg = h("div", { class: "seg" }, [["budgets", "Budgets"], ["recurring", "Bills"], ["debts", "Debts"]].map(([k, l]) =>
    h("button", { class: tab === k ? "on" : "", onclick: () => { state.budgetTab = k; render(); } }, l)));
  let body;
  if (tab === "budgets") body = await budgetsPanel();
  else if (tab === "recurring") body = await recurringPanel();
  else body = await debtsPanel();
  shell("Budget", h("div", { class: "stack" }, seg, body));
}

async function budgetsPanel() {
  const [budgets, s] = await Promise.all([api.get("/api/budgets"), api.get(`/api/reports/summary?month=${thisMonth()}`)]);
  const byCat = Object.fromEntries(budgets.filter((b) => !b.month).map((b) => [b.category_id, b.amount_cents]));
  const actualTop = Object.fromEntries(s.categories.map((c) => [c.category_id, c.actual]));
  const parents = state.cats.filter((c) => !c.parent_id && c.kind === "expense");
  const input = (cid) => {
    const inp = h("input", { inputmode: "decimal", placeholder: "—", value: centsInput(byCat[cid]), style: "max-width:110px;text-align:right" });
    inp.addEventListener("change", async () => {
      try { await api.put("/api/budgets", { category_id: cid, amount_cents: toCents(inp.value) || 0 }); toast("Budget saved"); } catch (e) { fail(e); }
    });
    return inp;
  };
  const total = Object.entries(byCat).reduce((a, [cid, v]) => a + (state.cats.find((c) => c.id === +cid)?.kind === "expense" ? v : 0), 0);
  return h("div", { class: "stack" },
    h("p", { class: "muted small" }, `Monthly budgets apply to every month. Set a parent category for an overall cap, or subcategories for detail; they add up. Total budgeted: ${fmt0(total)}.`),
    parents.map((p) => h("div", { class: "list" },
      h("div", { class: "li" }, h("div", { class: "grow" }, h("div", { class: "title" }, p.name), h("div", { class: "meta" }, `This month: ${fmt0(actualTop[p.id] || 0)}`)), input(p.id)),
      state.cats.filter((c) => c.parent_id === p.id).map((c) => h("div", { class: "li" }, h("div", { class: "grow muted" }, c.name), input(c.id))))));
}

async function recurringPanel() {
  const rec = await api.get("/api/recurring");
  const sum = (k) => rec.filter((r) => r.active && state.cats.find((c) => c.id === r.category_id)?.kind !== "income").reduce((a, r) => a + r[k], 0);
  return h("div", { class: "stack" },
    h("div", { class: "tiles" },
      [["annual", "year"], ["monthly", "month"], ["weekly", "week"], ["daily", "day"]].map(([k, label]) => h("div", { class: "tile" }, h("div", { class: "label" }, `Per ${label}`), h("div", { class: "value" }, k === "daily" ? fmt(sum(k)) : fmt0(sum(k)))))),
    h("button", { class: "btn primary block", onclick: () => openRecurringEditor() }, "+ Add bill or subscription"),
    rec.length ? h("div", { class: "list" }, rec.map((r) => h("div", { class: "li tap", onclick: () => openRecurringEditor(r) },
      h("div", { class: "grow" }, h("div", { class: "title" }, r.name, r.active ? "" : " (paused)"),
        h("div", { class: "meta" }, [`${fmt(r.amount_cents)} ${r.frequency}`, `${fmt0(r.monthly)}/mo`, `${fmt(r.daily)}/day`, r.next_due ? `due ${niceDate(r.next_due)}` : null, r.essential ? null : "discretionary"].filter(Boolean).join(" · "))),
      h("button", { class: "btn small", onclick: async (e) => { e.stopPropagation(); try { const x = await api.post(`/api/recurring/${r.id}/post`, {}); toast(`Recorded. Next due ${niceDate(x.next_due)}.`); render(); } catch (ex) { fail(ex); } } }, "Paid")))) :
      h("div", { class: "list" }, h("div", { class: "empty" }, "Add your mortgage, car payment, student loans, Amazon membership and other subscriptions.")));
}

function openRecurringEditor(r = {}) {
  const name = h("input", { value: r.name || "", required: true });
  const amount = h("input", { inputmode: "decimal", value: centsInput(r.amount_cents), required: true });
  const freq = h("select", {}, ["weekly", "biweekly", "semimonthly", "monthly", "quarterly", "semiannual", "annual"].map((f) => h("option", { value: f }, f)));
  freq.value = r.frequency || "monthly";
  const cat = categorySelect(r.category_id);
  const acct = accountSelect(r.account_id);
  const due = h("input", { type: "date", value: r.next_due || "" });
  const fixed = h("input", { type: "checkbox", checked: r.fixed ?? true });
  const essential = h("input", { type: "checkbox", checked: r.essential ?? true });
  const active = h("input", { type: "checkbox", checked: r.active ?? true });
  const err = h("p", { class: "small", style: "color:var(--bad)" });
  const form = h("form", { class: "stack", onsubmit: async (e) => {
    e.preventDefault();
    const body = { name: name.value, amount_cents: toCents(amount.value), frequency: freq.value, category_id: intOrNull(cat.value), account_id: intOrNull(acct.value),
      next_due: due.value || null, fixed: fixed.checked, essential: essential.checked, active: active.checked };
    try { r.id ? await api.put(`/api/recurring/${r.id}`, body) : await api.post("/api/recurring", body); s.close(); toast("Saved"); render(); }
    catch (ex) { err.textContent = ex.message; }
  } },
    field("Name", name), h("div", { class: "grid2" }, field("Amount", amount), field("How often", freq)),
    field("Category", cat), h("div", { class: "grid2" }, field("Paid with", acct), field("Next due", due)),
    h("label", { class: "check" }, fixed, "Fixed amount"), h("label", { class: "check" }, essential, "Essential (uncheck for subscriptions you could cut)"),
    h("label", { class: "check" }, active, "Active"), err,
    h("button", { class: "btn primary block" }, "Save"),
    r.id ? h("button", { type: "button", class: "btn danger block", onclick: async () => { if (confirm("Delete this bill?")) { await api.del(`/api/recurring/${r.id}`); s.close(); render(); } } }, "Delete") : null);
  const s = sheet(r.id ? "Edit bill" : "New bill or subscription", form);
}

async function debtsPanel() {
  const debts = await api.get("/api/debts");
  return h("div", { class: "stack" },
    h("p", { class: "muted small" }, "Sorted by interest rate. Payoff estimates use the same math as Excel's NPER."),
    h("button", { class: "btn primary block", onclick: () => openDebtEditor() }, "+ Add debt"),
    debts.length ? h("div", { class: "list" }, debts.map((d) => h("div", { class: "li tap", onclick: () => openDebtEditor(d) },
      h("div", { class: "grow" }, h("div", { class: "title" }, d.name),
        h("div", { class: "meta" }, [`${d.apr}% APR`, `${fmt0(d.monthly_interest_cents)}/mo interest`,
          d.payoff_months !== null ? `paid off in ~${Math.ceil(d.payoff_months)} mo` : "payment doesn't cover interest",
          d.months_saved_by_extra ? `extra saves ${Math.round(d.months_saved_by_extra)} mo` : null].filter(Boolean).join(" · "))),
      h("div", { class: "amt" }, fmt0(d.balance_cents))))) :
      h("div", { class: "list" }, h("div", { class: "empty" }, "Add the mortgage, car loan and student loans to see payoff timelines.")));
}

function openDebtEditor(d = {}) {
  const name = h("input", { value: d.name || "", required: true });
  const bal = h("input", { inputmode: "decimal", value: centsInput(d.balance_cents) });
  const apr = h("input", { inputmode: "decimal", value: d.apr ?? "" });
  const min = h("input", { inputmode: "decimal", value: centsInput(d.min_payment_cents) });
  const extra = h("input", { inputmode: "decimal", value: centsInput(d.extra_payment_cents || 0) });
  const err = h("p", { class: "small", style: "color:var(--bad)" });
  const form = h("form", { class: "stack", onsubmit: async (e) => {
    e.preventDefault();
    const body = { name: name.value, balance_cents: toCents(bal.value) || 0, apr: parseFloat(apr.value) || 0, min_payment_cents: toCents(min.value) || 0, extra_payment_cents: toCents(extra.value) || 0 };
    try { d.id ? await api.put(`/api/debts/${d.id}`, body) : await api.post("/api/debts", body); s.close(); render(); } catch (ex) { err.textContent = ex.message; }
  } },
    field("Name", name), h("div", { class: "grid2" }, field("Balance", bal), field("APR %", apr)),
    h("div", { class: "grid2" }, field("Monthly payment", min), field("Extra per month", extra)), err,
    h("button", { class: "btn primary block" }, "Save"),
    d.id ? h("button", { type: "button", class: "btn danger block", onclick: async () => { if (confirm("Delete?")) { await api.del(`/api/debts/${d.id}`); s.close(); render(); } } }, "Delete") : null);
  const s = sheet(d.id ? "Edit debt" : "New debt", form);
}

/* ---------------- settings ---------------- */
async function viewSettings() {
  const users = await api.get("/api/users");
  const admin = !!state.user.is_admin;

  const uName = h("input", { placeholder: "Name" }), uUser = h("input", { placeholder: "Username", autocapitalize: "none" }), uPw = h("input", { type: "password", placeholder: "Temporary password (8+)" });
  const cName = h("input", { placeholder: "New category" }), cParent = h("select", {}, h("option", { value: "" }, "Top level"), state.cats.filter((c) => !c.parent_id).map((c) => h("option", { value: c.id }, c.name)));
  const aName = h("input", { placeholder: "e.g. Visa ending 1234" });
  const pwCur = h("input", { type: "password", placeholder: "Current" }), pwNew = h("input", { type: "password", placeholder: "New (8+)" });

  shell("Settings", h("div", { class: "stack" },
    h("div", { class: "card stack" },
      h("div", { class: "row between" }, h("div", {}, h("b", {}, state.user.name), h("div", { class: "muted small" }, `@${state.user.username}${admin ? " · admin" : ""}`)),
        h("button", { class: "btn small", onclick: async () => { await api.post("/api/logout"); state.user = null; render(); } }, "Sign out")),
      h("div", { class: "small muted" }, `Photo recognition: ${state.user.ai_enabled ? "on (opt-in per photo)" : "off (no API key set)"} · Barcode name lookup: ${state.user.product_lookup ? "on" : "off"}`)),

    h("h2", {}, "Household"),
    h("div", { class: "list" }, users.map((u) => h("div", { class: "li" }, h("div", { class: "grow" }, h("div", { class: "title" }, u.name), h("div", { class: "meta" }, `@${u.username}${u.is_admin ? " · admin" : ""}`))))),
    admin ? h("form", { class: "card stack", onsubmit: async (e) => { e.preventDefault(); try { await api.post("/api/users", { name: uName.value, username: uUser.value, password: uPw.value }); toast("Member added"); render(); } catch (ex) { fail(ex); } } },
      h("b", {}, "Add a household member"), h("div", { class: "grid2" }, uName, uUser), uPw, h("button", { class: "btn" }, "Add member")) : null,

    h("h2", {}, "Categories & accounts"),
    h("form", { class: "card stack", onsubmit: async (e) => { e.preventDefault(); try { await api.post("/api/categories", { name: cName.value, parent_id: intOrNull(cParent.value) }); await loadRefs(); toast("Category added"); render(); } catch (ex) { fail(ex); } } },
      h("div", { class: "grid2" }, cName, cParent), h("button", { class: "btn" }, "Add category")),
    h("form", { class: "card stack", onsubmit: async (e) => { e.preventDefault(); try { await api.post("/api/accounts", { name: aName.value }); await loadRefs(); toast("Account added"); render(); } catch (ex) { fail(ex); } } },
      h("div", { class: "small muted" }, `Payment methods: ${state.accounts.map((a) => a.name).join(", ")}`), aName, h("button", { class: "btn" }, "Add payment method")),

    h("h2", {}, "Data"),
    h("div", { class: "grid2" },
      h("a", { class: "btn", href: "/api/export/transactions.csv" }, "Export CSV"),
      admin ? h("button", { class: "btn", onclick: async () => { try { const r = await api.post("/api/backup"); toast(`Backup saved: ${r.path}`); } catch (e) { fail(e); } } }, "Back up now") : null),

    h("h2", {}, "Password"),
    h("form", { class: "card stack", onsubmit: async (e) => { e.preventDefault(); try { await api.post("/api/me/password", { current: pwCur.value, new: pwNew.value }); toast("Password changed. Sign in again."); state.user = null; render(); } catch (ex) { fail(ex); } } },
      h("div", { class: "grid2" }, pwCur, pwNew), h("button", { class: "btn" }, "Change password"))));
}

const VIEWS = { home: viewHome, activity: viewActivity, stock: viewStock, budget: viewBudget, settings: viewSettings };

/* ---------------- boot ---------------- */
(async function boot() {
  const v = location.hash.slice(1);
  if (VIEWS[v]) state.view = v;
  try {
    state.user = await api.get("/api/me");
    await loadRefs();
  } catch { state.user = null; }
  render();
  if ("serviceWorker" in navigator && window.isSecureContext) navigator.serviceWorker.register("/sw.js").catch(() => {});
})();
