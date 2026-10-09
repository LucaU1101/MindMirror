import { useState, useEffect, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";
import jsPDF from "jspdf";
import Auth from "./Auth";
import { supabase, apiFetch } from "./supabaseClient";

const AXES = [
  { key: "meaning", label: "Meaning", pos: "Meaning", neg: "Nihilism", color: "#6366f1" },
  { key: "agency", label: "Agency", pos: "Agency", neg: "Determinism", color: "#10b981" },
  { key: "rationalism", label: "Rationalism", pos: "Rationalism", neg: "Spiritualism", color: "#f59e0b" },
  { key: "individualism", label: "Individualism", pos: "Individualism", neg: "Collectivism", color: "#ef4444" },
];

const PRESETS = [
  { id: "all", label: "All time" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "month", label: "This month" },
  { id: "year", label: "This year" },
  { id: "custom", label: "Custom" },
];

const fmtDate = (ts) => {
  try { return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
  catch { return ""; }
};
const toISO = (d) => d.toISOString().slice(0, 10);

function startOfToday() { const d = new Date(); d.setHours(0,0,0,0); return d; }

function rangeForPreset(preset, custom) {
  const now = new Date();
  switch (preset) {
    case "7d":   return { from: new Date(now.getTime() - 7*864e5), to: now };
    case "30d":  return { from: new Date(now.getTime() - 30*864e5), to: now };
    case "90d":  return { from: new Date(now.getTime() - 90*864e5), to: now };
    case "month":return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
    case "year": return { from: new Date(now.getFullYear(), 0, 1), to: now };
    case "custom": {
      const from = custom.from ? new Date(custom.from + "T00:00:00") : null;
      const to   = custom.to   ? new Date(custom.to   + "T23:59:59") : null;
      return { from, to };
    }
    default: return { from: null, to: null };
  }
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!authReady) return <div className="loader">Loading…</div>;
  if (!session) return <Auth />;
  return <Dashboard user={session.user} />;
}

function Dashboard({ user }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [recs, setRecs] = useState(null);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);

  // Filtering
  const [preset, setPreset] = useState("all");
  const [custom, setCustom] = useState({ from: toISO(startOfToday()), to: toISO(new Date()) });

  const { from, to } = rangeForPreset(preset, custom);

  const filtered = useMemo(() => {
    return history.filter((h) => {
      const ts = new Date(h.created_at ?? h.entries?.created_at).getTime();
      if (from && ts < from.getTime()) return false;
      if (to && ts > to.getTime()) return false;
      return true;
    });
  }, [history, from, to]);

  async function fetchHistory() {
    try { setHistory(await apiFetch("/entries")); }
    catch (err) { setError(err.message); }
  }

  async function fetchRecommendations() {
    setLoadingRecs(true);
    try { setRecs(await apiFetch("/recommendations")); }
    catch (err) { setError(err.message); }
    finally { setLoadingRecs(false); }
  }

  useEffect(() => { fetchHistory(); }, []);

  async function handleAnalyze() {
    if (!text.trim()) return;
    setAnalyzing(true); setError(null);
    try {
      const data = await apiFetch("/analyze", {
        method: "POST",
        body: JSON.stringify({ content: text }),
      });
      setResult(data);
      setText("");
      fetchHistory();
    } catch (err) { setError(err.message); }
    finally { setAnalyzing(false); }
  }

  async function signOut() { await supabase.auth.signOut(); }

  // Derived data
  const timeSeries = useMemo(
    () => filtered.map((h, i) => ({
      idx: i + 1,
      date: fmtDate(h.created_at ?? h.entries?.created_at),
      meaning: h.meaning,
      agency: h.agency,
      rationalism: h.rationalism,
      individualism: h.individualism,
    })),
    [filtered]
  );

  const averages = useMemo(() => {
    if (!filtered.length) return AXES.map((a) => ({ axis: a.label, value: 0 }));
    return AXES.map((a) => ({
      axis: a.label,
      value: filtered.reduce((s, h) => s + (h[a.key] ?? 0), 0) / filtered.length,
    }));
  }, [filtered]);

  const latest = filtered.length ? filtered[filtered.length - 1] : null;
  const latestRadar = useMemo(() => {
    if (!latest) return AXES.map((a) => ({ axis: a.label, value: 0 }));
    return AXES.map((a) => ({ axis: a.label, value: latest[a.key] ?? 0 }));
  }, [latest]);

  function generatePDFReport() {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 48;
    let y = margin;
    doc.setFont("helvetica","bold"); doc.setFontSize(22);
    doc.text("MindMirror — Philosophical Profile Report", margin, y); y += 28;
    doc.setFont("helvetica","normal"); doc.setFontSize(10);
    doc.text(`Generated ${new Date().toLocaleString()}`, margin, y); y += 14;
    doc.text(`User: ${user.email}`, margin, y); y += 14;
    doc.text(`Entries in range: ${filtered.length} (of ${history.length} total)`, margin, y); y += 24;

    doc.setFont("helvetica","bold"); doc.setFontSize(14);
    doc.text("Summary", margin, y); y += 18;
    doc.setFont("helvetica","normal"); doc.setFontSize(11);
    const summary = recs?.summary || "Generate recommendations to include a personalised summary.";
    const sl = doc.splitTextToSize(summary, 500); doc.text(sl, margin, y); y += sl.length*14 + 10;

    doc.setFont("helvetica","bold"); doc.setFontSize(14);
    doc.text("Axis Profile (filtered range)", margin, y); y += 18;
    doc.setFont("helvetica","normal"); doc.setFontSize(11);
    AXES.forEach((a) => {
      const v = averages.find((x) => x.axis === a.label)?.value ?? 0;
      const pole = v >= 0 ? a.pos : a.neg;
      doc.text(`${a.label}: ${v.toFixed(3)}  →  ${pole}`, margin, y); y += 16;
    });
    y += 8;

    if (recs?.drift) {
      doc.setFont("helvetica","bold"); doc.setFontSize(14);
      doc.text("Recent Drift (all time)", margin, y); y += 18;
      doc.setFont("helvetica","normal"); doc.setFontSize(11);
      AXES.forEach((a) => {
        const d = recs.drift[a.key] ?? 0;
        const arrow = d > 0.05 ? "↑" : d < -0.05 ? "↓" : "→";
        doc.text(`${a.label}: ${d >= 0 ? "+" : ""}${d.toFixed(3)} ${arrow}`, margin, y); y += 16;
      });
      y += 8;
    }

    if (recs?.recommendations?.length) {
      if (y > 650) { doc.addPage(); y = margin; }
      doc.setFont("helvetica","bold"); doc.setFontSize(14);
      doc.text("Recommended Reading", margin, y); y += 18;
      doc.setFont("helvetica","normal"); doc.setFontSize(11);
      recs.recommendations.forEach((r, i) => {
        if (y > 760) { doc.addPage(); y = margin; }
        doc.setFont("helvetica","bold");
        doc.text(`${i+1}. ${r.title} — ${r.author}`, margin, y); y += 14;
        doc.setFont("helvetica","normal");
        const why = doc.splitTextToSize(r.why || "", 500);
        doc.text(why, margin + 12, y); y += why.length*14 + 6;
      });
    }

    if (recs?.practice) {
      if (y > 700) { doc.addPage(); y = margin; }
      y += 8;
      doc.setFont("helvetica","bold"); doc.setFontSize(14);
      doc.text("Reflective Practice", margin, y); y += 18;
      doc.setFont("helvetica","normal"); doc.setFontSize(11);
      const p = doc.splitTextToSize(recs.practice, 500); doc.text(p, margin, y);
    }

    doc.save("mindmirror-report.pdf");
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-small">
          <div className="brand-logo">M</div>
          <span>MindMirror</span>
        </div>
        <div className="topbar-right">
          <span className="muted small">{user.email}</span>
          <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <main className="container">
        {error && <div className="note note-err" onClick={() => setError(null)}>{error} — click to dismiss</div>}

        {/* Entry composer */}
        <section className="card composer">
          <h2 className="section-title">New entry</h2>
          <textarea
            rows={5}
            className="textarea"
            placeholder="What would you like to reflect on today?"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="row end gap">
            <button className="btn btn-primary" onClick={handleAnalyze} disabled={analyzing}>
              {analyzing ? "Analysing…" : "Analyze entry"}
            </button>
          </div>

          {result && (
            <div className="mini-result">
              {AXES.map((a) => (
                <div key={a.key} className="axis-chip" style={{ "--c": a.color }}>
                  <span className="axis-chip-label">{a.label}</span>
                  <strong>{Number(result[a.key]).toFixed(2)}</strong>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Filter bar */}
        <section className="card">
          <div className="row between wrap gap">
            <div>
              <h2 className="section-title">Range</h2>
              <p className="muted small">Compare axis scores across a specific time window.</p>
            </div>
            <div className="chips">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  className={`chip ${preset === p.id ? "chip-active" : ""}`}
                  onClick={() => setPreset(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {preset === "custom" && (
            <div className="row gap wrap" style={{ marginTop: 12 }}>
              <label className="label inline">
                <span>From</span>
                <input type="date" className="input small" value={custom.from}
                       onChange={(e) => setCustom({ ...custom, from: e.target.value })}/>
              </label>
              <label className="label inline">
                <span>To</span>
                <input type="date" className="input small" value={custom.to}
                       onChange={(e) => setCustom({ ...custom, to: e.target.value })}/>
              </label>
            </div>
          )}
          <div className="muted small" style={{ marginTop: 8 }}>
            {filtered.length} of {history.length} entries in view
          </div>
        </section>

        {/* Charts */}
        <section className="grid-2">
          <div className="card">
            <h2 className="section-title">Axis scores over time</h2>
            {timeSeries.length === 0 ? (
              <p className="muted">No entries in the selected range.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={timeSeries} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
                  <XAxis dataKey="date" fontSize={12} stroke="#6b7280" />
                  <YAxis domain={[-1, 1]} fontSize={12} stroke="#6b7280" />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }} />
                  <Legend />
                  {AXES.map((a) => (
                    <Line key={a.key} type="monotone" dataKey={a.key}
                          stroke={a.color} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false}/>
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="card">
            <h2 className="section-title">Profile radar</h2>
            {filtered.length === 0 ? (
              <p className="muted">No entries in the selected range.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={latestRadar}>
                  <PolarGrid stroke="#e5e7eb"/>
                  <PolarAngleAxis dataKey="axis" fontSize={12}/>
                  <PolarRadiusAxis domain={[-1, 1]} tick={false} />
                  <Radar name="Latest in range" dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.35} />
                  <Radar name="Average in range" data={averages} dataKey="value" stroke="#10b981" fill="#10b981" fillOpacity={0.15} />
                  <Legend />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* Recommendations */}
        <section className="card">
          <div className="row between center">
            <h2 className="section-title">Recommendations</h2>
            <div className="row gap">
              <button className="btn btn-ghost" onClick={fetchRecommendations} disabled={!history.length || loadingRecs}>
                {loadingRecs ? "Thinking…" : recs ? "Refresh" : "Generate"}
              </button>
              <button className="btn btn-ghost" onClick={generatePDFReport} disabled={!history.length}>
                Export PDF
              </button>
            </div>
          </div>
          {!recs && <p className="muted">Click <em>Generate</em> to get personalised reading & practice suggestions based on your all-time profile.</p>}
          {recs?.summary && (
            <>
              <p style={{ marginTop: 8 }}>{recs.summary}</p>
              {recs.dominant_pole && (
                <p className="muted small">Dominant orientation: <strong>{recs.dominant_pole}</strong></p>
              )}
              <div className="reading-list">
                {recs.recommendations?.map((r, i) => (
                  <div key={i} className="reading-item">
                    <div className="reading-head">
                      <strong>{r.title}</strong>
                      <span className="muted"> — {r.author}</span>
                    </div>
                    <div className="muted small">{r.why}</div>
                  </div>
                ))}
              </div>
              {recs.practice && (
                <div className="practice">
                  <strong>Reflective practice —</strong> {recs.practice}
                </div>
              )}
            </>
          )}
        </section>

        {/* History */}
        <section className="card">
          <h2 className="section-title">History</h2>
          {filtered.length === 0 ? (
            <p className="muted">No entries in the selected range.</p>
          ) : (
            <div className="entries">
              {[...filtered].reverse().map((item) => (
                <div key={item.id} className="entry">
                  <p className="entry-text">{item.entries?.content}</p>
                  <div className="entry-scores">
                    {AXES.map((a) => (
                      <span key={a.key} className="score-tag" style={{ "--c": a.color }}>
                        {a.label} {Number(item[a.key]).toFixed(2)}
                      </span>
                    ))}
                  </div>
                  <div className="muted small">{fmtDate(item.created_at ?? item.entries?.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
