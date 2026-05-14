import { useState, useCallback } from "react";

const MODEL = "claude-sonnet-4-6";

const KPI_CONFIG = [
  {
    id: "SP500", label: "S&P 500", ticker: "SPY", type: "equity", icon: "📈",
    what: "The 500 biggest US companies. When people say 'the market', this is what they mean.",
    why: "Price vs 200D MA is the most-watched line in investing. Above it = bull market. Below it = damaged trend.",
    goodLabel: "Above 200D MA — bull trend intact",
    badLabel: "Below 200D MA — trend is broken",
  },
  {
    id: "NASDAQ", label: "NASDAQ / Tech", ticker: "QQQ", type: "equity", icon: "💻",
    what: "Top 100 tech companies — Apple, Microsoft, Nvidia, Google, Amazon.",
    why: "Tech leads the market up and down. If QQQ is overbought (RSI > 70), a pullback is likely.",
    goodLabel: "Above 50D MA — tech momentum strong",
    badLabel: "Below 50D MA — tech losing momentum",
  },
  {
    id: "RUSSELL", label: "Russell 2000", ticker: "IWM", type: "equity", icon: "🚀",
    what: "2000 small US companies. These are growth-stage businesses that need cheap borrowing.",
    why: "When IWM lags SPY/QQQ, the rally is narrow — only big tech winning, not the whole economy.",
    goodLabel: "Running strong — broad market healthy",
    badLabel: "Lagging large caps — rally is narrow",
  },
  {
    id: "TREASURY", label: "10-Year Treasury", ticker: "^TNX", type: "yield", icon: "🏦",
    what: "The interest rate the US gov't pays to borrow money for 10 years. Affects everything.",
    why: "Higher yield = more expensive borrowing for everyone. Also makes bonds compete with stocks. < 4.1% = good. > 4.5% = headwind.",
    goodLabel: "< 4.1% — favorable for stocks",
    badLabel: "> 4.5% — expensive money, pressure on stocks",
  },
  {
    id: "VIX", label: "VIX — Fear Index", ticker: "^VIX", type: "volatility", icon: "⚡",
    what: "Measures how much 'insurance' traders are buying against a market drop. High VIX = high fear.",
    why: "< 15 is calm. 15–25 is normal worry. > 25 means real fear. > 35 is panic. Extreme VIX spikes often mark bottoms.",
    goodLabel: "< 15 — calm, low fear",
    badLabel: "> 25 — elevated fear, expect volatility",
  },
  {
    id: "CPI", label: "CPI — Inflation", ticker: null, type: "macro", icon: "📊",
    what: "How much consumer prices rose vs last year. The Fed's main target is 2%.",
    why: "Hot CPI = Fed keeps rates high = expensive borrowing = pressure on stocks. Cool CPI = Fed can cut = cheap money = rally fuel.",
    goodLabel: "≤ 2.5% — Fed can ease, good for markets",
    badLabel: "> 3.5% — Fed stays aggressive, markets struggle",
  },
  {
    id: "RSI_SP500", label: "S&P 500 RSI", ticker: null, type: "indicator", icon: "📉",
    what: "Relative Strength Index — measures if the market is overbought (too high too fast) or oversold (too low too fast).",
    why: "Above 70 = overbought, pullback likely. Below 30 = oversold, bounce likely. 40–60 = healthy range with room to run.",
    goodLabel: "40–70 — healthy momentum range",
    badLabel: "> 70 — overbought, risk of pullback",
  },
  {
    id: "FEDRATE", label: "Fed Funds Rate", ticker: null, type: "macro", icon: "🏛️",
    what: "The interest rate banks charge each other overnight. The Fed controls this to manage the economy.",
    why: "High rates slow the economy and pressure stock valuations. Low rates = cheap money = rocket fuel for growth stocks.",
    goodLabel: "Cutting or on hold — accommodative",
    badLabel: "Hiking — tightening, headwind for stocks",
  },
];

function getSignal(kpi, data) {
  if (!data) return "loading";
  if (kpi.type === "macro" && kpi.id === "CPI") {
    const v = parseFloat(data.value);
    if (v <= 2.5) return "bullish"; if (v <= 3.5) return "neutral"; return "bearish";
  }
  if (kpi.type === "macro" && kpi.id === "FEDRATE") {
    return data.trend === "cutting" ? "bullish" : data.trend === "hiking" ? "bearish" : "neutral";
  }
  if (kpi.type === "indicator") {
    const v = parseFloat(data.value);
    if (v < 40) return "neutral"; if (v <= 70) return "bullish"; return "bearish";
  }
  if (kpi.type === "yield") {
    const v = parseFloat(data.price);
    if (v < 4.1) return "bullish"; if (v < 4.5) return "neutral"; return "bearish";
  }
  if (kpi.type === "volatility") {
    const v = parseFloat(data.price);
    if (v < 15) return "bullish"; if (v < 25) return "neutral"; return "bearish";
  }
  if (kpi.type === "equity") {
    if (data.aboveMa200 && data.aboveMa50) return "bullish";
    if (data.aboveMa200) return "neutral";
    return "bearish";
  }
  return "neutral";
}

const C = {
  bullish: { border: "#00d496", bg: "rgba(0,212,150,0.06)", accent: "#00d496", label: "BULLISH" },
  neutral: { border: "#ffc400", bg: "rgba(255,196,0,0.06)", accent: "#ffc400", label: "NEUTRAL" },
  bearish: { border: "#ff4664", bg: "rgba(255,70,100,0.06)", accent: "#ff4664", label: "BEARISH" },
  loading: { border: "#1e2235", bg: "rgba(255,255,255,0.015)", accent: "#333", label: "—" },
};

async function fetchMarketData(onStatus) {
  onStatus("Searching for live market data…");

  const prompt = `Search the web for today's current market data and return ONLY a raw JSON object with no markdown, no explanation, no backticks.

Search for: SPY QQQ IWM current price and moving averages, VIX level, 10-year treasury yield, latest US CPI, current Fed funds rate, S&P 500 RSI.

Return exactly this structure with real current values:
{
  "timestamp": "<today date time>",
  "marketContext": "<one sentence summary of markets right now, max 20 words>",
  "crashRisk": "<low|moderate|elevated|high>",
  "crashNote": "<one sentence on biggest current risk, max 20 words>",
  "SP500":    { "price": "000.00", "changePct": "0.00", "aboveMa50": true, "aboveMa200": true, "ma50": "000.00", "ma200": "000.00" },
  "NASDAQ":   { "price": "000.00", "changePct": "0.00", "aboveMa50": true, "aboveMa200": true, "ma50": "000.00", "ma200": "000.00" },
  "RUSSELL":  { "price": "000.00", "changePct": "0.00", "aboveMa50": true, "aboveMa200": true, "ma50": "000.00", "ma200": "000.00" },
  "TREASURY": { "price": "0.00", "changePct": "0.00" },
  "VIX":      { "price": "00.00", "changePct": "0.00" },
  "CPI":      { "value": "0.0", "previous": "0.0", "period": "Month YYYY", "nextRelease": "Month DD YYYY" },
  "RSI_SP500":{ "value": "00.0" },
  "FEDRATE":  { "value": "0.00–0.00%", "trend": "holding", "nextMeeting": "Month YYYY" }
}`;

  const res = await fetch("/api/chat", {
    method: "POST",
  
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  const textBlocks = (data.content || []).filter(b => b.type === "text");
  if (!textBlocks.length) throw new Error("No text in response");

  const raw = textBlocks[textBlocks.length - 1].text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON found:\n" + raw.slice(0, 200));

  return JSON.parse(raw.slice(start, end + 1));
}

function KPICard({ kpi, data, expanded, onToggle }) {
  const signal = getSignal(kpi, data);
  const c = C[signal];
  const isUp = data ? parseFloat(data.changePct ?? 0) >= 0 : true;

  const displayValue = () => {
    if (!data) return "—";
    if (kpi.type === "macro" && kpi.id === "CPI") return `${data.value}%`;
    if (kpi.type === "macro" && kpi.id === "FEDRATE") return data.value;
    if (kpi.type === "indicator") return data.value;
    if (kpi.type === "yield") return `${data.price}%`;
    if (kpi.type === "volatility") return data.price;
    return `$${data.price}`;
  };

  const statusLabel = () => {
    if (!data) return null;
    if (signal === "bullish") return kpi.goodLabel;
    if (signal === "bearish") return kpi.badLabel;
    return "Mixed signals — watch closely";
  };

  return (
    <div
      style={{
        background: c.bg, border: `1px solid ${c.border}28`,
        borderLeft: `3px solid ${c.border}`,
        borderRadius: "10px", padding: "16px 18px",
        display: "flex", flexDirection: "column", gap: "8px",
        cursor: "pointer",
      }}
      onClick={onToggle}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "14px" }}>{kpi.icon}</span>
          <div>
            <div style={{ fontSize: "13px", fontWeight: "700", color: "#d0d4e8" }}>{kpi.label}</div>
            <div style={{ fontSize: "9px", color: "#444", fontFamily: "monospace", letterSpacing: "1px" }}>{kpi.ticker || "MACRO DATA"}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "8px", fontFamily: "monospace", letterSpacing: "1.5px", color: c.accent, border: `1px solid ${c.accent}40`, borderRadius: "4px", padding: "2px 7px", background: `${c.accent}12` }}>{c.label}</span>
          <span style={{ fontSize: "10px", color: "#333" }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
        <span style={{ fontSize: "32px", fontWeight: "900", color: "#e8eaf0", letterSpacing: "-1.5px", lineHeight: 1 }}>
          {displayValue()}
        </span>
        {data?.changePct !== undefined && (
          <span style={{ fontSize: "11px", fontFamily: "monospace", color: isUp ? "#00d496" : "#ff4664" }}>
            {isUp ? "▲" : "▼"} {Math.abs(parseFloat(data.changePct))}%
          </span>
        )}
      </div>

      {data && (
        <div style={{ fontSize: "10px", color: c.accent, fontWeight: "600" }}>{statusLabel()}</div>
      )}

      {kpi.type === "equity" && data && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {[{ l: "50D MA", a: data.aboveMa50, v: data.ma50 }, { l: "200D MA", a: data.aboveMa200, v: data.ma200 }].map(ma => (
            <span key={ma.l} style={{ fontSize: "9px", fontFamily: "monospace", color: ma.a ? "#00d496" : "#ff4664", border: `1px solid ${ma.a ? "#00d49630" : "#ff466430"}`, borderRadius: "4px", padding: "2px 7px", background: ma.a ? "#00d49610" : "#ff466410" }}>
              {ma.a ? "▲ above" : "▼ below"} {ma.l} {ma.v ? `($${ma.v})` : ""}
            </span>
          ))}
        </div>
      )}

      {(kpi.type === "yield" || kpi.type === "volatility") && data && (
        <div style={{ height: "3px", background: "#1a1d2e", borderRadius: "2px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(100, (parseFloat(data.price) / (kpi.type === "yield" ? 6 : 40)) * 100)}%`, background: c.accent }} />
        </div>
      )}

      {expanded && (
        <div style={{ borderTop: "1px solid #111520", paddingTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ fontSize: "10px", color: "#888", lineHeight: "1.5" }}>
            <span style={{ color: "#555", fontFamily: "monospace", fontSize: "9px", letterSpacing: "1px" }}>WHAT IT IS  </span>{kpi.what}
          </div>
          <div style={{ fontSize: "10px", color: "#888", lineHeight: "1.5" }}>
            <span style={{ color: "#555", fontFamily: "monospace", fontSize: "9px", letterSpacing: "1px" }}>WHY IT MATTERS  </span>{kpi.why}
          </div>
          {kpi.id === "CPI" && data && (
            <div style={{ fontSize: "10px", color: "#555", fontFamily: "monospace" }}>
              Prev: {data.previous}% · Period: {data.period} · Next: {data.nextRelease}
            </div>
          )}
          {kpi.id === "FEDRATE" && data && (
            <div style={{ fontSize: "10px", color: "#555", fontFamily: "monospace" }}>
              Next meeting: {data.nextMeeting} · Trend: {data.trend}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CrashRiskBar({ level, note }) {
  const levels = ["low", "moderate", "elevated", "high"];
  const idx = levels.indexOf(level?.toLowerCase());
  const colors = ["#00d496", "#ffc400", "#ff8c42", "#ff4664"];
  const color = colors[idx >= 0 ? idx : 1] || "#ffc400";
  const pct = ((idx >= 0 ? idx + 1 : 2) / 4) * 100;

  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${color}22`, borderLeft: `3px solid ${color}`, borderRadius: "10px", padding: "16px 20px", marginBottom: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <div style={{ fontSize: "9px", fontFamily: "monospace", letterSpacing: "2px", color: "#444" }}>CRASH RISK ASSESSMENT</div>
          <div style={{ fontSize: "20px", fontWeight: "900", color, marginTop: "2px", textTransform: "uppercase" }}>{level || "—"}</div>
        </div>
        <div style={{ fontSize: "11px", color: "#555", maxWidth: "340px", lineHeight: "1.5", textAlign: "right" }}>{note}</div>
      </div>
      <div style={{ height: "4px", background: "#1a1d2e", borderRadius: "2px", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, #00d496, ${color})`, borderRadius: "2px" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
        {levels.map((l, i) => (
          <span key={l} style={{ fontSize: "8px", fontFamily: "monospace", color: i === idx ? color : "#333", textTransform: "uppercase" }}>{l}</span>
        ))}
      </div>
    </div>
  );
}

function SummaryBar({ d }) {
  const signals = KPI_CONFIG.map(k => getSignal(k, d[k.id]));
  const bullish = signals.filter(s => s === "bullish").length;
  const bearish = signals.filter(s => s === "bearish").length;

  let regime = "NEUTRAL", color = "#ffc400";
  if (bullish >= 5) { regime = "RISK ON"; color = "#00d496"; }
  else if (bearish >= 4) { regime = "RISK OFF"; color = "#ff4664"; }
  else if (bullish > bearish) { regime = "CAUTIOUS BULL"; color = "#7fffd4"; }
  else if (bearish > bullish) { regime = "CAUTIOUS BEAR"; color = "#ff8c42"; }

  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid #131620", borderRadius: "10px", padding: "16px 20px", display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
      <div>
        <div style={{ fontSize: "9px", letterSpacing: "2px", color: "#444", fontFamily: "monospace" }}>MARKET REGIME</div>
        <div style={{ fontSize: "22px", fontWeight: "900", color, letterSpacing: "-0.5px", marginTop: "2px" }}>{regime}</div>
        <div style={{ fontSize: "10px", color: "#555", marginTop: "2px" }}>{bullish} bullish · {signals.filter(s => s === "neutral").length} neutral · {bearish} bearish</div>
      </div>
      {d.marketContext && (
        <div style={{ fontSize: "11px", color: "#666", maxWidth: "340px", lineHeight: "1.5", fontStyle: "italic" }}>"{d.marketContext}"</div>
      )}
      {d.timestamp && (
        <div style={{ fontSize: "9px", color: "#2e3248", fontFamily: "monospace" }}>As of {d.timestamp}</div>
      )}
    </div>
  );
}

function CrashPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: "rgba(255,70,100,0.04)", border: "1px solid #ff466422", borderRadius: "10px", marginTop: "16px", overflow: "hidden" }}>
      <div onClick={() => setOpen(o => !o)} style={{ padding: "14px 20px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: "11px", fontWeight: "700", color: "#ff8899" }}>💡 If there's a crash — should you sell?</div>
        <span style={{ color: "#444", fontSize: "11px" }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div style={{ padding: "0 20px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
          {[
            { label: "The short answer", text: "Almost never, if you're a long-term investor. Selling locks in your loss and forces you to be right twice — when to sell AND when to buy back. Almost nobody gets both right.", color: "#ff8899" },
            { label: "What history shows", text: "The S&P 500 has recovered from every single crash in history — 1929, 1987, 2000, 2008, 2020. People who stayed invested recovered. People who sold often bought back higher or never got back in.", color: "#ffc400" },
            { label: "Index ETFs specifically", text: "Selling a broad market ETF during a crash means betting against hundreds of the world's most powerful companies surviving. That's a low-probability bet.", color: "#7fffd4" },
            { label: "When selling CAN make sense", text: "1) You need the money within 1–2 years. 2) You're holding individual stocks with broken fundamentals. 3) Your position size is causing emotional decision-making. Otherwise — hold.", color: "#00d496" },
            { label: "The actual pro move", text: "Crashes are buying opportunities. A 30% drop isn't a loss — it's a 30% discount on the same companies. Dollar-cost averaging on the way down is how long-term wealth is built.", color: "#00d496" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", gap: "10px" }}>
              <div style={{ width: "3px", background: item.color, borderRadius: "2px", flexShrink: 0, marginTop: "2px" }} />
              <div>
                <div style={{ fontSize: "10px", fontFamily: "monospace", color: item.color, marginBottom: "2px" }}>{item.label}</div>
                <div style={{ fontSize: "11px", color: "#666", lineHeight: "1.6" }}>{item.text}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [marketData, setMarketData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("");
  const [expanded, setExpanded] = useState({});

  const toggleExpand = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  const load = useCallback(async () => {
    setLoading(true); setError(null); setMarketData(null);
    try {
      const data = await fetchMarketData(setStatus);
      setMarketData(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false); setStatus("");
    }
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#080a12", color: "#d0d4e8", fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif", padding: "28px 20px", maxWidth: "1100px", margin: "0 auto" }}>
      <style>{`* { box-sizing: border-box; } @keyframes spin { to { transform: rotate(360deg); } } @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ fontSize: "9px", fontFamily: "monospace", letterSpacing: "3px", color: "#444", marginBottom: "4px" }}>PRE-MARKET INTELLIGENCE</div>
          <h1 style={{ margin: 0, fontSize: "26px", fontWeight: "900", color: "#e8eaf0", letterSpacing: "-0.5px" }}>Market Dashboard</h1>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#444" }}>8 signals · tap any card to understand what it means</p>
        </div>
        <button onClick={load} disabled={loading} style={{ background: loading ? "transparent" : "#e8eaf0", color: loading ? "#555" : "#080a12", border: loading ? "1px solid #1e2235" : "none", borderRadius: "8px", padding: "10px 22px", fontSize: "12px", fontWeight: "800", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
          {loading
            ? <><span style={{ width: "10px", height: "10px", borderRadius: "50%", border: "2px solid #333", borderTopColor: "#888", display: "inline-block", animation: "spin 0.8s linear infinite" }} />Searching…</>
            : marketData ? "↻ REFRESH" : "▶ LOAD LIVE DATA"}
        </button>
      </div>

      {status && <div style={{ fontSize: "11px", color: "#555", fontFamily: "monospace", marginBottom: "14px", padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderRadius: "6px", border: "1px solid #131620" }}>↻ {status}</div>}
      {error && <div style={{ background: "rgba(255,70,100,0.07)", border: "1px solid #ff466430", borderLeft: "3px solid #ff4664", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px", fontSize: "11px", color: "#ff8899", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>⚠ {error}</div>}

      {!marketData && !loading && !error && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#333", border: "1px dashed #1a1d2e", borderRadius: "12px", marginBottom: "20px" }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>📊</div>
          <div style={{ fontSize: "14px", color: "#555", marginBottom: "6px" }}>No data loaded</div>
          <div style={{ fontSize: "11px", color: "#333" }}>Hit Load — Claude searches the web for current prices & macro data</div>
        </div>
      )}

      {marketData && (
        <div style={{ animation: "fadeIn 0.4s ease" }}>
          <SummaryBar d={marketData} />
          {marketData.crashRisk && <CrashRiskBar level={marketData.crashRisk} note={marketData.crashNote} />}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "12px" }}>
            {KPI_CONFIG.map(kpi => (
              <KPICard key={kpi.id} kpi={kpi} data={marketData[kpi.id]} expanded={!!expanded[kpi.id]} onToggle={() => toggleExpand(kpi.id)} />
            ))}
          </div>
        </div>
      )}

      <CrashPanel />

      <div style={{ marginTop: "14px", fontSize: "9px", color: "#1e2132", textAlign: "center", fontFamily: "monospace" }}>
        Powered by Claude · Data via web search · Not financial advice · Refresh for latest
      </div>
    </div>
  );
}
