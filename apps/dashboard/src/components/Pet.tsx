import { useState, useEffect } from "react";
import { usePetBrain } from "../hooks/usePetBrain";

type Mood = "neutral" | "happy" | "alert" | "sleepy" | "snarky";

function Dragon({ minimized, mood }: { minimized: boolean; mood: Mood }) {
  const eyeColor = {
    neutral: "#d97706",
    happy: "#fbbf24",
    alert: "#ef4444",
    sleepy: "#78716c",
    snarky: "#d97706",
  }[mood];

  const eyeSize = mood === "sleepy" ? 1.5 : 3;
  const mouthD = {
    neutral: "M44 40 Q50 44 56 40",
    happy: "M43 39 Q50 45 57 39",
    alert: "M45 41 Q50 39 55 41",
    sleepy: "M44 40 Q50 42 56 40",
    snarky: "M44 41 Q48 38 56 41",
  }[mood];

  return (
    <svg
      width={minimized ? 28 : 44}
      height={minimized ? 28 : 44}
      viewBox="0 0 100 100"
      className={`transition-all duration-500 ${minimized ? "opacity-40" : mood === "sleepy" ? "animate-bob-slow" : "animate-bob"}`}
    >
      {/* Wings */}
      <path d="M25 48 Q10 28 18 44 Q8 32 20 48" fill="#a8a29e" opacity="0.5">
        {mood === "happy" && <animateTransform attributeName="transform" type="rotate" values="-5 25 48;5 25 48;-5 25 48" dur="1s" repeatCount="indefinite" />}
      </path>
      <path d="M75 48 Q90 28 82 44 Q92 32 80 48" fill="#a8a29e" opacity="0.5">
        {mood === "happy" && <animateTransform attributeName="transform" type="rotate" values="5 75 48;-5 75 48;5 75 48" dur="1s" repeatCount="indefinite" />}
      </path>
      {/* Body */}
      <ellipse cx="50" cy="58" rx="24" ry="19" fill="#78716c" />
      {/* Belly scales */}
      <ellipse cx="50" cy="62" rx="13" ry="11" fill="#d6d3d1" opacity="0.25" />
      <path d="M42 55 Q50 52 58 55" stroke="#a8a29e" strokeWidth="0.5" fill="none" opacity="0.4" />
      <path d="M40 60 Q50 57 60 60" stroke="#a8a29e" strokeWidth="0.5" fill="none" opacity="0.4" />
      {/* Head */}
      <circle cx="50" cy="34" r="17" fill="#a8a29e" />
      {/* Snout */}
      <ellipse cx="50" cy="38" rx="8" ry="5" fill="#8a8580" opacity="0.5" />
      {/* Nostrils */}
      <circle cx="46" cy="37" r="1" fill="#57534e" />
      <circle cx="54" cy="37" r="1" fill="#57534e" />
      {/* Smoke from nostrils when snarky */}
      {mood === "snarky" && (
        <>
          <circle cx="44" cy="33" r="2" fill="#a8a29e" opacity="0.3">
            <animate attributeName="cy" values="33;26" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.3;0" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx="56" cy="33" r="1.5" fill="#a8a29e" opacity="0.2">
            <animate attributeName="cy" values="33;28" dur="2.5s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.2;0" dur="2.5s" repeatCount="indefinite" />
          </circle>
        </>
      )}
      {/* Eyes */}
      <ellipse cx="42" cy="31" rx="4" ry={eyeSize} fill={eyeColor}>
        {mood === "alert" && <animate attributeName="rx" values="4;3;4" dur="0.3s" repeatCount="3" />}
      </ellipse>
      <ellipse cx="58" cy="31" rx="4" ry={eyeSize} fill={eyeColor}>
        {mood === "alert" && <animate attributeName="rx" values="4;3;4" dur="0.3s" repeatCount="3" />}
      </ellipse>
      {/* Pupils */}
      <circle cx="43" cy="30.5" r="1.8" fill="#1c1917" />
      <circle cx="57" cy="30.5" r="1.8" fill="#1c1917" />
      {/* Eye shine */}
      <circle cx="44" cy="29.5" r="0.8" fill="white" opacity="0.6" />
      <circle cx="58" cy="29.5" r="0.8" fill="white" opacity="0.6" />
      {/* Horns */}
      <path d="M36 20 L30 6 L39 18" fill="#57534e" />
      <path d="M64 20 L70 6 L61 18" fill="#57534e" />
      {/* Spines */}
      <path d="M50 18 L50 12" stroke="#57534e" strokeWidth="2" strokeLinecap="round" />
      <path d="M45 19 L43 14" stroke="#57534e" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M55 19 L57 14" stroke="#57534e" strokeWidth="1.5" strokeLinecap="round" />
      {/* Mouth */}
      <path d={mouthD} stroke="#57534e" strokeWidth="1.5" fill="none" />
      {/* Tail */}
      <path d="M28 64 Q14 68 10 60 Q7 54 12 58" fill="#78716c" />
      <path d="M10 60 L6 56" stroke="#d97706" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      {/* Feet */}
      <ellipse cx="37" cy="76" rx="7" ry="3.5" fill="#78716c" />
      <ellipse cx="63" cy="76" rx="7" ry="3.5" fill="#78716c" />
      {/* Claws */}
      <circle cx="32" cy="76" r="1" fill="#57534e" />
      <circle cx="37" cy="77" r="1" fill="#57534e" />
      <circle cx="42" cy="76" r="1" fill="#57534e" />
      <circle cx="58" cy="76" r="1" fill="#57534e" />
      <circle cx="63" cy="77" r="1" fill="#57534e" />
      <circle cx="68" cy="76" r="1" fill="#57534e" />
    </svg>
  );
}

const MOOD_PREFIXES: Record<Mood, string[]> = {
  neutral: ["", ""],
  happy: ["*scales shimmer*\n", "*wings flutter*\n", "*eyes brighten*\n"],
  alert: ["*eyes narrow*\n", "*scales shift to red*\n", "*tail flicks*\n"],
  sleepy: ["*yawns wide*\n", "*eyes half-close*\n", "*curls tighter*\n"],
  snarky: ["*smoke curls*\n", "*golden eyes narrow*\n", "*scales dim*\n"],
};

export default function Pet() {
  const { message, mood, dismiss } = usePetBrain();
  const [minimized, setMinimized] = useState(() => {
    return localStorage.getItem("bodhi-pet-minimized") === "true";
  });
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const [showStats, setShowStats] = useState(false);

  useEffect(() => {
    localStorage.setItem("bodhi-pet-minimized", String(minimized));
  }, [minimized]);

  useEffect(() => {
    if (message) setBubbleVisible(true);
    else setBubbleVisible(false);
  }, [message]);

  // Build display text with mood prefix
  const displayText = message
    ? (() => {
        const prefixes = MOOD_PREFIXES[mood] || [""];
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        return prefix + message;
      })()
    : null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {/* Speech bubble */}
      {bubbleVisible && displayText && !minimized && (
        <div
          onClick={dismiss}
          className="max-w-64 px-3 py-2.5 bg-stone-800/95 border border-stone-700/80 rounded-xl rounded-br-sm text-xs shadow-xl cursor-pointer animate-fade-in backdrop-blur-sm"
        >
          {displayText.split("\n").map((line, i) =>
            line.startsWith("*") ? (
              <p key={i} className="text-stone-500 italic text-[10px] mb-1">{line}</p>
            ) : (
              <p key={i} className="text-stone-300">{line}</p>
            )
          )}
        </div>
      )}

      {/* Dragon + name */}
      <div className="flex items-end gap-1.5">
        {!minimized && (
          <span
            className="text-[9px] text-stone-600 mb-1 cursor-pointer hover:text-stone-400 select-none"
            onClick={() => setShowStats(!showStats)}
          >
            Mossy
          </span>
        )}
        <button
          onClick={() => setMinimized(!minimized)}
          className={`rounded-full transition-all duration-300 hover:scale-110 ${
            minimized
              ? "p-1 bg-stone-900/40 hover:bg-stone-800"
              : "p-1.5 bg-stone-900/80 hover:bg-stone-800 shadow-lg shadow-stone-900/50 ring-1 ring-stone-800"
          }`}
          title={minimized ? "Wake Mossy" : "Minimize Mossy"}
        >
          <Dragon minimized={minimized} mood={mood} />
        </button>
      </div>
    </div>
  );
}
