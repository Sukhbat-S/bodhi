// ============================================================
// BODHI — Public Landing Page (v2)
// Reimagined to showcase 3D graph, gestures, voice, intelligence
// ============================================================

import { useEffect, useRef, useState, type ReactNode } from "react";
import { getStatus, type StatusResponse, type Memory } from "../api";
import { BodhiLogo } from "../components/BodhiLogo";

// --- Reusable: Fade-in on scroll ---
function FadeIn({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.15 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={`transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"} ${className}`}>
      {children}
    </div>
  );
}

// --- Reusable: Animated counter ---
function Counter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        let i = 0;
        const step = Math.max(1, Math.floor(target / 30));
        const timer = setInterval(() => { i = Math.min(i + step, target); setCount(i); if (i >= target) clearInterval(timer); }, 30);
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [target]);
  return <span ref={ref}>{count}{suffix}</span>;
}

// --- Reusable: Feature card ---
function FeatureCard({ title, description, icon }: { title: string; description: string; icon: ReactNode }) {
  return (
    <div className="rounded-xl border border-stone-800/60 bg-stone-900/40 p-6 hover:border-amber-500/30 transition-colors">
      <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-stone-100 mb-2">{title}</h3>
      <p className="text-sm text-stone-400 leading-relaxed">{description}</p>
    </div>
  );
}

// --- Compact feature (tier 2) ---
function CompactFeature({ title, description, color }: { title: string; description: string; color: string }) {
  return (
    <div className="p-4 rounded-lg border border-stone-800/40 bg-stone-900/20 hover:border-stone-700 transition-colors">
      <div className="flex items-center gap-2 mb-1">
        <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
        <h4 className="text-sm font-medium text-stone-200">{title}</h4>
      </div>
      <p className="text-xs text-stone-500 leading-relaxed">{description}</p>
    </div>
  );
}

// --- SVG: Static constellation illustration ---
function ConstellationSVG() {
  const nodes = [
    { x: 80, y: 40, r: 8, color: "#8b5cf6" },   // person — violet
    { x: 150, y: 60, r: 12, color: "#10b981" },  // project — emerald
    { x: 120, y: 110, r: 6, color: "#f59e0b" },  // topic — amber
    { x: 200, y: 90, r: 10, color: "#0ea5e9" },  // org — sky
    { x: 60, y: 100, r: 7, color: "#10b981" },   // project
    { x: 170, y: 140, r: 5, color: "#f43f5e" },  // place — rose
    { x: 240, y: 50, r: 9, color: "#8b5cf6" },   // person
    { x: 100, y: 160, r: 6, color: "#f59e0b" },  // topic
    { x: 220, y: 130, r: 8, color: "#10b981" },  // project
    { x: 40, y: 150, r: 5, color: "#0ea5e9" },   // org
    { x: 260, y: 110, r: 7, color: "#f59e0b" },  // topic
    { x: 140, y: 30, r: 5, color: "#f43f5e" },   // place
  ];
  const edges = [
    [0,1],[1,2],[1,3],[2,4],[3,6],[4,7],[5,8],[6,8],[7,9],[3,10],[0,11],[1,11],[2,5],[8,10],
  ];
  return (
    <svg viewBox="0 0 300 190" className="w-full max-w-sm mx-auto opacity-80">
      {edges.map(([a,b], i) => (
        <line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y}
          stroke="rgba(168,162,158,0.15)" strokeWidth="1" />
      ))}
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r={n.r * 1.8} fill={n.color} opacity={0.08} />
          <circle cx={n.x} cy={n.y} r={n.r} fill={n.color} opacity={0.7} />
        </g>
      ))}
    </svg>
  );
}

// --- SVG: Animated waveform for voice ---
function WaveformSVG() {
  return (
    <div className="flex items-center justify-center h-40">
      <div className="relative w-32 h-32">
        {[0, 1, 2].map((i) => (
          <div key={i} className="absolute inset-0 rounded-full border border-emerald-400/30 animate-ping"
            style={{ animationDelay: `${i * 0.4}s`, animationDuration: "2s" }} />
        ))}
        <div className="absolute inset-0 flex items-center justify-center">
          <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </div>
      </div>
    </div>
  );
}

// --- Gesture grid ---
function GestureGrid() {
  const gestures: [string, string][] = [
    ["\u270B", "Rotate"], ["\uD83E\uDD0F", "Zoom"], ["\u261D\uFE0F", "Select"],
    ["\u270A", "Pan"], ["\uD83D\uDC4D", "Confirm"], ["\uD83D\uDC4B", "Reset"],
    ["\uD83E\uDD0F\uD83E\uDD0F", "2H Zoom"], ["\u270A\u270A", "2H Rotate"], ["\uD83D\uDC50", "2H Expand"],
  ];
  return (
    <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
      {gestures.map(([icon, label]) => (
        <div key={label} className="flex flex-col items-center gap-1 py-3 rounded-lg bg-stone-800/40 border border-stone-800/60">
          <span className="text-lg">{icon}</span>
          <span className="text-[10px] text-stone-400">{label}</span>
        </div>
      ))}
    </div>
  );
}

// --- Mini dashboard mock ---
function DashboardMock() {
  return (
    <div className="rounded-xl border border-stone-800/60 bg-stone-950 overflow-hidden max-w-lg mx-auto shadow-2xl">
      <div className="flex">
        {/* Mini sidebar */}
        <div className="w-10 bg-stone-900 border-r border-stone-800/60 py-3 flex flex-col items-center gap-3">
          {["\u2302", "\u2709", "\u2637", "\uD83D\uDD0D", "\u2630"].map((icon, i) => (
            <span key={i} className={`text-[10px] ${i === 0 ? "text-amber-400" : "text-stone-600"}`}>{icon}</span>
          ))}
        </div>
        {/* Main area */}
        <div className="flex-1 p-4">
          <p className="text-[11px] text-stone-300 font-medium mb-3">Good morning, Sukhbat.</p>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="rounded-md bg-stone-900/60 border border-stone-800/40 p-2">
              <p className="text-[9px] text-stone-500">Calendar</p>
              <p className="text-[11px] text-stone-300 font-medium">3 events</p>
            </div>
            <div className="rounded-md bg-stone-900/60 border border-stone-800/40 p-2">
              <p className="text-[9px] text-stone-500">Inbox</p>
              <p className="text-[11px] text-stone-300 font-medium">12 unread</p>
            </div>
            <div className="rounded-md bg-stone-900/60 border border-stone-800/40 p-2">
              <p className="text-[9px] text-stone-500">GitHub</p>
              <p className="text-[11px] text-emerald-400 font-medium">PR merged</p>
            </div>
          </div>
          <div className="space-y-1.5">
            {["Architecture decision: chose SSE over WebSocket", "Gesture system shipped — 9 gestures working", "Morning briefing delivered to Telegram"].map((m, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className={`w-1 h-1 rounded-full ${["bg-emerald-400", "bg-violet-400", "bg-amber-400"][i]}`} />
                <p className="text-[9px] text-stone-500 truncate">{m}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- SVG Icons ---
const icons = {
  memory: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg>,
  context: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>,
  briefing: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
};

// --- Live search demo ---
const DEMO_QUERIES = ["gesture control", "entity graph", "voice mode", "morning briefing", "cross-session bridge"];

const TYPE_COLORS: Record<string, string> = {
  fact: "text-blue-400",
  decision: "text-emerald-400",
  pattern: "text-violet-400",
  preference: "text-amber-400",
  event: "text-rose-400",
};

const SAMPLE_RESULTS: Record<string, Memory[]> = {
  "gesture control": [
    { id: "s1", content: "Hand gesture Entity Graph via MediaPipe Tasks Vision — tracks 1-2 hands at 30fps on M3 Pro GPU. 9 gestures: palm=rotate, point=select, pinch=zoom, fist=pan, thumbsup=confirm, wave=reset, plus 3 two-hand combos.", type: "fact", importance: 0.9, confidence: 0.95, similarity: 0.96, createdAt: "2026-04-07", tags: ["gesture", "mediapipe"] },
    { id: "s2", content: "Three.js useFrame() must NOT call React setState — it fires 60x/sec. Use refs for position and visibility. Only useState for things that change outside the frame loop.", type: "pattern", importance: 0.85, confidence: 0.9, similarity: 0.88, createdAt: "2026-04-07", tags: ["gesture", "three.js"] },
  ],
  "entity graph": [
    { id: "s3", content: "Entity Graph rewritten as 3D constellation with react-three-fiber. Each memory is a glowing orb, connections form between related entities. d3-force-3d handles physics layout.", type: "fact", importance: 0.9, confidence: 0.95, similarity: 0.95, createdAt: "2026-04-07", tags: ["entity-graph", "three.js"] },
    { id: "s4", content: "377 entities across 5 types: project (150), organization (95), topic (80), person (26), place (26). Each entity links to shared memories.", type: "fact", importance: 0.8, confidence: 0.9, similarity: 0.87, createdAt: "2026-04-07", tags: ["entity-graph", "data"] },
  ],
  "voice mode": [
    { id: "s5", content: "Jarvis voice assistant: double-clap activation via sox audio analysis, Groq Whisper transcription, BODHI AI response, macOS TTS output. Total cost: $0.", type: "fact", importance: 0.85, confidence: 0.95, similarity: 0.94, createdAt: "2026-04-06", tags: ["voice", "jarvis"] },
    { id: "s6", content: "Quick commands bypass AI: status check, calendar query, inbox count, morning briefing, play music, open apps, volume control, timer, screenshot.", type: "fact", importance: 0.7, confidence: 0.9, similarity: 0.82, createdAt: "2026-04-06", tags: ["voice", "commands"] },
  ],
  "morning briefing": [
    { id: "s7", content: "Morning briefings synthesize calendar, inbox highlights, GitHub activity, active goals, and patterns BODHI noticed. Delivered to Telegram on schedule.", type: "fact", importance: 0.8, confidence: 0.9, similarity: 0.93, createdAt: "2026-03-15", tags: ["briefing", "scheduler"] },
    { id: "s8", content: "Briefing prompts must explicitly instruct the agent to include each data section, or it may ignore context. Learned the hard way.", type: "pattern", importance: 0.75, confidence: 0.85, similarity: 0.80, createdAt: "2026-03-20", tags: ["briefing", "prompt"] },
  ],
  "cross-session bridge": [
    { id: "s9", content: "Cross-session bridge: each Claude Code tab registers as an active session. Changes broadcast via SSE (EventEmitter → Server-Sent Events). Browser reconnects automatically via native EventSource.", type: "fact", importance: 0.85, confidence: 0.95, similarity: 0.95, createdAt: "2026-04-07", tags: ["session", "sse"] },
    { id: "s10", content: "File conflict detection: sessions track currentFile. If two sessions edit the same file, BODHI warns on session-start.", type: "fact", importance: 0.8, confidence: 0.9, similarity: 0.86, createdAt: "2026-04-07", tags: ["session", "coordination"] },
  ],
};

function LiveSearchDemo() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [autoPlayed, setAutoPlayed] = useState(false);
  const [userTookOver, setUserTookOver] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const doSearch = async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setSearched(false); return; }
    setLoading(true);
    setSearched(true);
    await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
    const key = Object.keys(SAMPLE_RESULTS).find(k => q.toLowerCase().includes(k) || k.includes(q.toLowerCase()));
    setResults(key ? SAMPLE_RESULTS[key] : SAMPLE_RESULTS["gesture control"]);
    setLoading(false);
  };

  const handleChange = (val: string) => {
    setUserTookOver(true);
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 400);
  };

  useEffect(() => {
    if (autoPlayed || userTookOver) return;
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !autoPlayed && !userTookOver) {
        setAutoPlayed(true);
        const text = DEMO_QUERIES[Math.floor(Math.random() * DEMO_QUERIES.length)];
        let i = 0;
        const type = () => {
          if (userTookOver) return;
          i++;
          setQuery(text.slice(0, i));
          if (i < text.length) setTimeout(type, 50 + Math.random() * 30);
          else doSearch(text);
        };
        setTimeout(type, 600);
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [autoPlayed, userTookOver]);

  return (
    <div ref={containerRef}>
      <div className="relative">
        <input
          type="text" value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setUserTookOver(true)}
          placeholder="Search BODHI's memory..."
          className="w-full bg-stone-900 text-stone-100 px-5 py-4 rounded-xl border border-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/40 placeholder-stone-500 text-sm"
        />
        {loading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-stone-600 border-t-amber-400 rounded-full animate-spin" />
          </div>
        )}
      </div>
      {!searched && (
        <div className="flex flex-wrap justify-center gap-2 mt-4">
          {DEMO_QUERIES.map((q) => (
            <button key={q} onClick={() => { setQuery(q); doSearch(q); }}
              className="text-xs px-3 py-1.5 rounded-full bg-stone-800/60 text-stone-400 hover:text-stone-200 hover:bg-stone-700 transition-colors">
              {q}
            </button>
          ))}
        </div>
      )}
      {searched && (
        <div className="mt-4 space-y-2">
          {results.length === 0 && !loading ? (
            <p className="text-sm text-stone-500 text-center py-4">No results found</p>
          ) : (
            results.map((m) => {
              const pct = m.similarity ? Math.round(m.similarity * 100) : 0;
              return (
                <div key={m.id} className="bg-stone-900/80 border border-stone-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-[11px] font-medium ${TYPE_COLORS[m.type] || "text-stone-400"}`}>{m.type}</span>
                    {pct > 0 && <span className="text-[10px] text-stone-600">{pct}% match</span>}
                  </div>
                  <p className="text-sm text-stone-300 leading-relaxed line-clamp-2">{m.content}</p>
                </div>
              );
            })
          )}
          {results.length > 0 && (
            <p className="text-[11px] text-stone-600 text-center mt-2">
              Showing {results.length} of 2,200+ memories — semantic similarity via Voyage AI + pgvector
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Main Page
// ============================================================

export default function AboutPage() {
  const [scrolled, setScrolled] = useState(false);
  const [live, setLive] = useState<StatusResponse | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { getStatus().then(setLive).catch(() => {}); }, []);

  return (
    <div className="min-h-screen bg-stone-950 text-stone-300">
      {/* ---- Nav ---- */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "bg-stone-950/90 backdrop-blur-md border-b border-stone-800/60" : ""}`}>
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BodhiLogo className="w-6 h-6 text-amber-600" />
            <span className="font-bold text-stone-100">BODHI</span>
            <span className="text-[10px] text-stone-600 bg-stone-800/60 px-1.5 py-0.5 rounded">v0.9</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="https://github.com/Sukhbat-S/bodhi" target="_blank" rel="noreferrer" className="text-sm text-stone-400 hover:text-stone-200 transition-colors">GitHub</a>
            <a href="https://x.com/SukhbatSosorba3" target="_blank" rel="noreferrer" className="text-sm text-stone-400 hover:text-stone-200 transition-colors">X</a>
          </div>
        </div>
      </nav>

      {/* ---- 1. Hero ---- */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(217,119,6,0.08)_0%,_transparent_70%)]" />
        <div className="max-w-3xl mx-auto text-center relative">
          <div className="flex justify-center mb-8">
            <BodhiLogo className="w-16 h-16 text-amber-600" />
          </div>
          <p className="text-xs uppercase tracking-widest text-amber-500 mb-4">Your AI doesn't know you yet</p>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-6 tracking-tight leading-tight">
            Memories. Gestures.<br />Voice. Vision.
          </h1>
          <p className="text-lg md:text-xl text-stone-400 mb-3 max-w-xl mx-auto leading-relaxed">
            I built a personal AI that remembers every decision, learns from every conversation, and adapts to how I work. Open source so you can build yours.
          </p>
          <p className="text-sm text-stone-600 mb-10">Built by Sukhbat Sosorbaram / 21 / Ulaanbaatar, Mongolia</p>
          <div className="flex items-center justify-center gap-4 mb-14">
            <a href="https://github.com/Sukhbat-S/bodhi" target="_blank" rel="noreferrer"
              className="px-6 py-3 rounded-lg bg-stone-800 text-stone-200 font-medium hover:bg-stone-700 transition-colors text-sm">
              View on GitHub
            </a>
            <a href="https://x.com/SukhbatSosorba3" target="_blank" rel="noreferrer"
              className="px-6 py-3 rounded-lg bg-amber-500/10 text-amber-400 font-medium hover:bg-amber-500/20 transition-colors text-sm border border-amber-500/20">
              Follow the build
            </a>
          </div>
          {/* Stats ribbon */}
          <div className="flex flex-wrap justify-center gap-8 md:gap-12">
            {[
              { value: 15, suffix: "", label: "Packages" },
              { value: 23, suffix: "", label: "Phases" },
              { value: 2200, suffix: "+", label: "Memories" },
              { value: 17, suffix: "", label: "Pages" },
              { value: 9, suffix: "", label: "Gestures" },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className="text-2xl md:text-3xl font-bold text-white"><Counter target={s.value} suffix={s.suffix} /></div>
                <div className="text-[10px] text-stone-500 uppercase tracking-wider mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- 2. Feature Showcase (flagship) ---- */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto space-y-12">
          {/* Card 1: 3D Entity Graph */}
          <FadeIn>
            <div className="rounded-2xl border border-stone-800/40 bg-stone-900/30 p-8 md:p-12 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <p className="text-xs uppercase tracking-wider text-amber-500 mb-3">Spatial Memory</p>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">Navigate your knowledge in three dimensions</h2>
                <p className="text-sm text-stone-400 leading-relaxed mb-6">
                  Every person, project, and idea becomes a glowing node in a 3D constellation. Connections form between related memories. Drag to orbit, scroll to zoom, click to explore. 377 entities across 5 types.
                </p>
                <div className="flex flex-wrap gap-2">
                  {["Three.js", "React Three Fiber", "d3-force-3d", "Real-time connections"].map(t => (
                    <span key={t} className="text-[10px] px-2.5 py-1 rounded-full border border-stone-700 text-stone-400">{t}</span>
                  ))}
                </div>
              </div>
              <ConstellationSVG />
            </div>
          </FadeIn>

          {/* Card 2: Hand Gesture Control */}
          <FadeIn>
            <div className="rounded-2xl border border-stone-800/40 bg-stone-900/30 p-8 md:p-12 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="md:order-2">
                <p className="text-xs uppercase tracking-wider text-violet-400 mb-3">Gesture Control</p>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">Control your data with your hands</h2>
                <p className="text-sm text-stone-400 leading-relaxed mb-6">
                  Turn on your webcam and BODHI tracks your hands via MediaPipe at 30fps. Open palm to rotate. Pinch to zoom. Point to select with a 3D cursor. Nine gestures total — no mouse needed.
                </p>
                <div className="flex flex-wrap gap-2">
                  {["MediaPipe WASM", "WebGL", "30fps tracking", "2-hand support"].map(t => (
                    <span key={t} className="text-[10px] px-2.5 py-1 rounded-full border border-stone-700 text-stone-400">{t}</span>
                  ))}
                </div>
              </div>
              <div className="md:order-1">
                <GestureGrid />
              </div>
            </div>
          </FadeIn>

          {/* Card 3: Voice Mode */}
          <FadeIn>
            <div className="rounded-2xl border border-stone-800/40 bg-stone-900/30 p-8 md:p-12 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <p className="text-xs uppercase tracking-wider text-emerald-400 mb-3">Voice Assistant</p>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">Double clap. Start talking.</h2>
                <p className="text-sm text-stone-400 leading-relaxed mb-6">
                  Clap twice and BODHI wakes up. Speak naturally — Groq Whisper transcribes in real-time, BODHI thinks, and macOS native TTS reads the response aloud. Calendar, inbox, status — all voice-accessible. Total cost: $0.
                </p>
                <div className="flex flex-wrap gap-2">
                  {["Groq Whisper STT", "macOS TTS", "Clap detection (sox)", "$0 cost"].map(t => (
                    <span key={t} className="text-[10px] px-2.5 py-1 rounded-full border border-stone-700 text-stone-400">{t}</span>
                  ))}
                </div>
              </div>
              <WaveformSVG />
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ---- 3. Command Center Mock ---- */}
      <FadeIn>
        <section className="py-16 px-6">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-xs uppercase tracking-wider text-amber-500 mb-3">Command Center</p>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">My entire digital life, one screen</h2>
            <p className="text-sm text-stone-500 mb-10">15+ data sources. Real-time. No tab switching.</p>
            <DashboardMock />
            <div className="flex flex-wrap justify-center gap-2 mt-8">
              {["Gmail", "Calendar", "GitHub", "Vercel", "Supabase", "Notion", "Telegram", "CLI", "MCP"].map(s => (
                <span key={s} className="text-[10px] px-3 py-1 rounded-full border border-stone-800 text-stone-500">{s}</span>
              ))}
            </div>
          </div>
        </section>
      </FadeIn>

      {/* ---- 4. Intelligence Engine ---- */}
      <FadeIn>
        <section className="py-16 px-6">
          <div className="max-w-5xl mx-auto">
            <p className="text-xs uppercase tracking-wider text-amber-500 mb-8 text-center">Intelligence</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-stone-800/60 bg-stone-900/40 p-6">
                <h3 className="text-lg font-semibold text-stone-100 mb-2">Intent-Aware Context</h3>
                <p className="text-sm text-stone-400 leading-relaxed">Every message is classified into 4 intents. Only relevant providers fire — 75% less tokens. A schedule question gets your calendar, not your git history.</p>
              </div>
              <div className="rounded-xl border border-stone-800/60 bg-stone-900/40 p-6">
                <h3 className="text-lg font-semibold text-stone-100 mb-2">Smart Synthesis</h3>
                <p className="text-sm text-stone-400 leading-relaxed">Every 12 hours, BODHI reviews new memories. Duplicates merge. Patterns promote. Stale facts decay. A 3-gate trigger prevents over-synthesis.</p>
              </div>
              <div className="rounded-xl border border-stone-800/60 bg-stone-900/40 p-6">
                <h3 className="text-lg font-semibold text-stone-100 mb-2">Background Watcher</h3>
                <p className="text-sm text-stone-400 leading-relaxed">A 5-minute loop checks Vercel deploys, GitHub PRs, and Gmail spikes. If something needs attention, BODHI surfaces it. If not, silence.</p>
              </div>
              <div className="rounded-xl border border-stone-800/60 bg-stone-900/40 p-6">
                <h3 className="text-lg font-semibold text-stone-100 mb-2">Cross-Session Bridge</h3>
                <p className="text-sm text-stone-400 leading-relaxed">Open three Claude Code tabs on different packages. They coordinate via SSE — sharing messages, file ownership, and conflict detection. No stepping on each other.</p>
              </div>
            </div>
          </div>
        </section>
      </FadeIn>

      {/* ---- 5. Live Search Demo ---- */}
      <FadeIn>
        <section className="py-16 px-6">
          <div className="max-w-3xl mx-auto">
            <p className="text-xs uppercase tracking-wider text-amber-500 mb-4 text-center">Semantic Search</p>
            <p className="text-sm text-stone-500 text-center mb-6">
              Type a query and watch BODHI find meaning-matched memories. Powered by Voyage AI embeddings + pgvector cosine similarity.
            </p>
            <LiveSearchDemo />
          </div>
        </section>
      </FadeIn>

      {/* ---- 6. Feature Grid ---- */}
      <FadeIn>
        <section className="py-16 px-6">
          <div className="max-w-5xl mx-auto">
            <p className="text-xs uppercase tracking-wider text-amber-500 mb-8 text-center">Everything BODHI Does</p>
            {/* Tier 1 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <FeatureCard icon={icons.memory} title="Persistent Memory" description="Every conversation is mined for facts, decisions, and patterns. Stored with semantic search — meaning matching, not keywords." />
              <FeatureCard icon={icons.context} title="Context Engine" description="Connects to my Gmail, Calendar, GitHub, Notion, and more. Every response is informed by my real world — not just the chat." />
              <FeatureCard icon={icons.briefing} title="Proactive Briefings" description="Morning briefings with calendar, inbox, and patterns. Delivered to Telegram — insights that come to you." />
            </div>
            {/* Tier 2 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <CompactFeature color="bg-violet-400" title="Entity Graph" description="377 entities in a 3D constellation with relationship edges" />
              <CompactFeature color="bg-sky-400" title="Multi-Channel" description="Telegram, web dashboard, CLI, MCP — same brain everywhere" />
              <CompactFeature color="bg-amber-400" title="Content Engine" description="Auto-generate build logs and social posts from real work" />
              <CompactFeature color="bg-emerald-400" title="Workflow Engine" description="Multi-step AI workflows with pause, resume, and model override" />
              <CompactFeature color="bg-rose-400" title="Feedback Loops" description="Thumbs up/down on chat feeds into nightly synthesis" />
              <CompactFeature color="bg-blue-400" title="Self-Assessment" description="AI rates its own responses 1-5 for continuous improvement" />
              <CompactFeature color="bg-pink-400" title="Mossy" description="Pet companion with moods and emotive speech on your dashboard" />
              <CompactFeature color="bg-teal-400" title="Voice Mode" description="Clap-activated Jarvis with Groq Whisper and macOS TTS" />
            </div>
          </div>
        </section>
      </FadeIn>

      {/* ---- 7. Architecture ---- */}
      <FadeIn>
        <section className="py-16 px-6">
          <div className="max-w-4xl mx-auto">
            <p className="text-xs uppercase tracking-wider text-amber-500 mb-8 text-center">Architecture</p>
            <div className="rounded-xl border border-stone-800/60 bg-stone-900/30 p-8 font-mono text-sm space-y-5">
              <div className="text-center">
                <span className="text-amber-400">Channels</span>
                <div className="flex justify-center gap-2 mt-2 flex-wrap">
                  {["Telegram", "Web Dashboard", "CLI / MCP", "Voice (Jarvis)", "Hand Gestures"].map(c => (
                    <span key={c} className="px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-400 text-xs">{c}</span>
                  ))}
                </div>
              </div>
              <div className="flex justify-center text-stone-700">|</div>
              <div className="text-center">
                <span className="text-cyan-400">Interface</span>
                <div className="flex justify-center gap-2 mt-2 flex-wrap">
                  {["Command Center", "3D Entity Graph", "Chat", "Workflows", "Mossy"].map(c => (
                    <span key={c} className="px-2.5 py-1 rounded-md bg-cyan-500/10 text-cyan-400 text-xs">{c}</span>
                  ))}
                </div>
              </div>
              <div className="flex justify-center text-stone-700">|</div>
              <div className="text-center">
                <span className="text-violet-400">Intelligence</span>
                <div className="flex justify-center gap-2 mt-2 flex-wrap">
                  {["Bridge (Claude)", "Intent Classifier", "Memory Extractor", "Context Engine", "Self-Assessor"].map(c => (
                    <span key={c} className="px-2.5 py-1 rounded-md bg-violet-500/10 text-violet-400 text-xs">{c}</span>
                  ))}
                </div>
              </div>
              <div className="flex justify-center text-stone-700">|</div>
              <div className="text-center">
                <span className="text-teal-400">Coordination</span>
                <div className="flex justify-center gap-2 mt-2 flex-wrap">
                  {["Session Bridge", "KAIROS Watcher", "Feedback Loops", "Synthesis", "Scheduler"].map(c => (
                    <span key={c} className="px-2.5 py-1 rounded-md bg-teal-500/10 text-teal-400 text-xs">{c}</span>
                  ))}
                </div>
              </div>
              <div className="flex justify-center text-stone-700">|</div>
              <div className="text-center">
                <span className="text-blue-400">Data</span>
                <div className="flex justify-center gap-2 mt-2 flex-wrap">
                  {["Supabase (pgvector)", "Voyage AI Embeddings", "Drizzle ORM"].map(c => (
                    <span key={c} className="px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-400 text-xs">{c}</span>
                  ))}
                </div>
              </div>
              <div className="flex justify-center text-stone-700">|</div>
              <div className="text-center">
                <span className="text-rose-400">Integrations</span>
                <div className="flex justify-center gap-2 mt-2 flex-wrap">
                  {["Gmail", "Calendar", "GitHub", "Vercel", "Supabase", "Notion", "MediaPipe", "Groq"].map(c => (
                    <span key={c} className="px-2.5 py-1 rounded-md bg-rose-500/10 text-rose-400 text-xs">{c}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </FadeIn>

      {/* ---- 8. Tech Stack + Timeline ---- */}
      <FadeIn>
        <section className="py-16 px-6">
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12">
            <div>
              <p className="text-xs uppercase tracking-wider text-amber-500 mb-6">Tech Stack</p>
              <div className="flex flex-wrap gap-2">
                {["TypeScript", "React 19", "Tailwind CSS", "Vite 6", "Hono", "Drizzle ORM", "Supabase", "pgvector", "Voyage AI", "Claude Code", "Three.js", "React Three Fiber", "MediaPipe", "Groq Whisper", "d3-force-3d", "Telegraf", "node-cron"].map(tech => (
                  <span key={tech} className="px-3 py-1.5 rounded-full border border-stone-700 text-stone-400 text-xs hover:border-stone-600 transition-colors">{tech}</span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-amber-500 mb-6">Build Timeline</p>
              <div className="space-y-3">
                {[
                  { phases: "1-5", label: "Foundation", desc: "Memory, API, Dashboard", color: "bg-amber-400" },
                  { phases: "6-10", label: "Intelligence", desc: "Context, Briefings, Synthesis", color: "bg-violet-400" },
                  { phases: "11-15", label: "Integration", desc: "Gmail, GitHub, Vercel, Notion", color: "bg-emerald-400" },
                  { phases: "16-19", label: "Interface", desc: "3D Graph, Voice, Gestures", color: "bg-blue-400" },
                  { phases: "20-23", label: "Autonomy", desc: "Workflows, Self-Assessment, KAIROS", color: "bg-rose-400" },
                ].map(p => (
                  <div key={p.phases} className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${p.color} shrink-0`} />
                    <span className="text-xs text-stone-500 w-8">{p.phases}</span>
                    <span className="text-sm text-stone-300 font-medium">{p.label}</span>
                    <span className="text-xs text-stone-600">{p.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </FadeIn>

      {/* ---- 9. Live Status ---- */}
      <FadeIn>
        <section className="py-16 px-6">
          <div className="max-w-4xl mx-auto">
            {live && (
              <div className="flex items-center justify-center gap-2 mb-8">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                <span className="text-xs text-emerald-400 font-medium">
                  BODHI is online — uptime {Math.floor((live.uptime || 0) / 3600)}h {Math.floor(((live.uptime || 0) % 3600) / 60)}m
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              {(() => {
                const integrationCount = live
                  ? [live.gmail, live.calendar, live.github, live.vercel, live.supabase, live.notion]
                      .filter(v => v && v !== "not configured").length
                  : 9;
                return [
                  { value: 15, suffix: "+", label: "Packages" },
                  { value: 2200, suffix: "+", label: "Memories" },
                  { value: integrationCount, suffix: "", label: "Integrations Live" },
                  { value: 23, suffix: "", label: "Phases Shipped" },
                ];
              })().map(s => (
                <div key={s.label}>
                  <div className="text-3xl md:text-4xl font-bold text-white"><Counter target={s.value} suffix={s.suffix} /></div>
                  <div className="text-sm text-stone-500 mt-1">{s.label}</div>
                </div>
              ))}
            </div>
            {live && (
              <div className="mt-8 flex flex-wrap justify-center gap-2">
                {Object.entries(live)
                  .filter(([k, v]) => typeof v === "string" && k !== "ownerName" && k !== "bridge")
                  .map(([key, value]) => {
                    const isUp = value === "online" || value === "active" || value === "connected" || value === "running" || value === "available";
                    return (
                      <span key={key} className={`text-[11px] px-3 py-1 rounded-full border ${isUp ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5" : "border-stone-700 text-stone-500"}`}>
                        {key}
                      </span>
                    );
                  })}
              </div>
            )}
          </div>
        </section>
      </FadeIn>

      {/* ---- 10. The Builder ---- */}
      <FadeIn>
        <section className="py-16 px-6">
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-xs uppercase tracking-wider text-amber-500 mb-6">The Builder</p>
            <p className="text-stone-400 leading-relaxed mb-6">
              I'm Sukhbat — a 21-year-old developer in Ulaanbaatar, Mongolia. I built BODHI because I needed it. Every tool I tried forgot me after the session ended. So I built one that doesn't. It's my personal AI companion first — open source so others can build theirs too.
            </p>
            <a href="https://x.com/SukhbatSosorba3" target="_blank" rel="noreferrer"
              className="inline-block px-6 py-3 rounded-lg bg-amber-500/10 text-amber-400 font-medium hover:bg-amber-500/20 transition-colors text-sm border border-amber-500/20">
              Follow @SukhbatSosorba3 on X
            </a>
          </div>
        </section>
      </FadeIn>

      {/* ---- 11. Footer ---- */}
      <footer className="py-16 px-6 border-t border-stone-800/60">
        <div className="max-w-3xl mx-auto text-center">
          <div className="flex justify-center mb-4">
            <BodhiLogo className="w-8 h-8 text-amber-600" opacity={0.5} />
          </div>
          <p className="text-sm text-stone-500 mb-4">Built with obsession in Ulaanbaatar, Mongolia</p>
          <div className="flex justify-center gap-6">
            <a href="https://github.com/Sukhbat-S/bodhi" target="_blank" rel="noreferrer" className="text-sm text-stone-500 hover:text-stone-300 transition-colors">GitHub</a>
            <a href="https://x.com/SukhbatSosorba3" target="_blank" rel="noreferrer" className="text-sm text-stone-500 hover:text-stone-300 transition-colors">X</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
