import { useState } from "react";

interface Props {
  onDispatch: (goal: string, model: string) => void;
  disabled?: boolean;
}

export default function CommandBar({ onDispatch, disabled }: Props) {
  const [goal, setGoal] = useState("");
  const [model, setModel] = useState("sonnet");

  const handleSubmit = () => {
    const trimmed = goal.trim();
    if (!trimmed) return;
    onDispatch(trimmed, model);
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
        <div className="flex items-center gap-2">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="bg-stone-800/60 text-stone-400 text-xs rounded-lg px-2 py-1.5 border border-stone-700/50 outline-none"
          >
            <option value="sonnet">Sonnet</option>
            <option value="opus">Opus</option>
          </select>
          <span className="text-[10px] text-stone-600">via Bridge</span>
        </div>
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
