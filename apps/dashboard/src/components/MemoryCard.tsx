import { useState } from "react";
import type { Memory } from "../api";

interface Props {
  memory: Memory;
  onDelete: (id: string) => void;
  onTagClick?: (tag: string) => void;
}

export default function MemoryCard({ memory, onDelete, onTagClick }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const preview =
    memory.content.length > 150 && !expanded
      ? memory.content.slice(0, 150) + "..."
      : memory.content;

  const date = new Date(memory.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-xl p-5 group">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-stone-800 text-stone-400">
            {memory.type}
          </span>
          <span className="text-xs text-stone-500">{date}</span>
        </div>

        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {confirming ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  onDelete(memory.id);
                  setConfirming(false);
                }}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded bg-red-500/10"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="text-xs text-stone-400 hover:text-stone-300 px-2 py-1"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="text-xs text-stone-500 hover:text-red-400 px-2 py-1"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <p
        className="text-sm text-stone-300 leading-relaxed cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {preview}
      </p>

      {/* Footer */}
      <div className="flex items-center gap-3 mt-3">
        {memory.tags && memory.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {memory.tags.map((tag) => (
              <span
                key={tag}
                onClick={() => onTagClick?.(tag)}
                className="text-xs bg-stone-800 text-stone-400 px-2 py-0.5 rounded-full cursor-pointer hover:bg-stone-700 hover:text-stone-300 transition-colors"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        <span className="text-xs text-stone-600 ml-auto">
          imp: {(memory.importance * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );
}
