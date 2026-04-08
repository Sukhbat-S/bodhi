import { useState } from "react";

interface Props {
  onDispatch: (goal: string, model: string) => void;
  disabled?: boolean;
}

export default function CommandBar({ onDispatch, disabled }: Props) {
  const [goal, setGoal] = useState("");
  const handleSubmit = () => {
    const trimmed = goal.trim();
    if (!trimmed) return;
    onDispatch(trimmed, "opus");
    setGoal("");
  };

  return (
    <div className="bg-stone-900/50 border border-stone-800/60 rounded-xl p-4">
      <textarea
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
        }}
        placeholder="What should BODHI work on? (Cmd+Enter to dispatch)"
        className="w-full bg-transparent text-stone-200 text-sm placeholder:text-stone-600 resize-none outline-none min-h-[60px]"
        rows={2}
        disabled={disabled}
      />
      <div className="flex items-center justify-between mt-3">
        <span className="text-[10px] text-stone-600">Opus 4.6 (1M) via Bridge</span>
        <button
          onClick={handleSubmit}
          disabled={disabled || !goal.trim()}
          className="px-4 py-1.5 text-sm font-medium bg-amber-600 text-stone-950 rounded-lg hover:bg-amber-500 disabled:opacity-40 transition-colors"
        >
          Dispatch
        </button>
      </div>
    </div>
  );
}
