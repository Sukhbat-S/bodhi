import { useState, useRef, useEffect } from "react";

interface Props {
  onDispatch: (goal: string, model: string) => void;
  disabled?: boolean;
}

export default function CommandBar({ onDispatch, disabled }: Props) {
  const [goal, setGoal] = useState("");
  const [model, setModel] = useState("sonnet");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [goal]);

  const handleSubmit = () => {
    const trimmed = goal.trim();
    if (!trimmed) return;
    onDispatch(trimmed, model);
    setGoal("");
  };

  return (
    <div className="relative group">
      {/* Gold glow on focus */}
      <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-steppe-gold/20 via-steppe-amber/10 to-steppe-gold/20 opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 blur-sm" />

      <div className="relative bg-steppe-sky/30 border border-steppe-shadow/60 rounded-2xl p-5 backdrop-blur-sm">
        <textarea
          ref={textareaRef}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
          }}
          placeholder="What should BODHI work on?"
          className="w-full bg-transparent text-steppe-cream text-base placeholder:text-steppe-smoke/50 resize-none outline-none min-h-[48px] leading-relaxed"
          rows={1}
          disabled={disabled}
        />
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-3">
            {/* Segmented model selector */}
            <div className="flex bg-steppe-night/60 rounded-lg p-0.5 border border-steppe-shadow/40">
              {(["sonnet", "opus"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setModel(m)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all duration-200 ${
                    model === m
                      ? "bg-steppe-sky text-steppe-cream shadow-sm"
                      : "text-steppe-smoke hover:text-steppe-cream"
                  }`}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-steppe-smoke/40 hidden sm:inline">Cmd+Enter to dispatch</span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={disabled || !goal.trim()}
            className="px-5 py-2 text-sm font-semibold bg-gradient-to-r from-steppe-gold to-steppe-amber text-steppe-night rounded-xl hover:shadow-lg hover:shadow-steppe-gold/20 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 disabled:hover:scale-100 transition-all duration-200"
          >
            Dispatch
          </button>
        </div>
      </div>
    </div>
  );
}
