import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { ColorScheme } from '../ecosystemConfig';

export interface ProjectNodeData {
  label: string;
  subtitle?: string;
  colorScheme: ColorScheme;
  stat?: string;
  statColor?: string;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  [key: string]: unknown;
}

const colorMap: Record<ColorScheme, { bg: string; border: string; text: string; subtitleText: string }> = {
  violet: {
    bg: 'bg-violet-950/60',
    border: 'border-violet-700/40',
    text: 'text-violet-100',
    subtitleText: 'text-violet-400/60',
  },
  emerald: {
    bg: 'bg-emerald-950/60',
    border: 'border-emerald-700/40',
    text: 'text-emerald-100',
    subtitleText: 'text-emerald-400/60',
  },
  amber: {
    bg: 'bg-amber-950/60',
    border: 'border-amber-700/40',
    text: 'text-amber-100',
    subtitleText: 'text-amber-400/60',
  },
  stone: {
    bg: 'bg-stone-900/80',
    border: 'border-stone-700/40',
    text: 'text-stone-200',
    subtitleText: 'text-stone-500',
  },
};

export default function ProjectNode({ data }: NodeProps) {
  const d = data as unknown as ProjectNodeData;
  const colors = colorMap[d.colorScheme] ?? colorMap.stone;

  return (
    <div className={`${colors.bg} ${colors.border} border rounded-xl px-4 py-3 min-w-[170px] backdrop-blur-sm transition-all duration-200 hover:brightness-110`}>
      <Handle type="target" position={Position.Top} className="!bg-stone-500 !w-1.5 !h-1.5 !border-0 !opacity-0" />

      <div className="flex items-center justify-between gap-2">
        <span className={`text-sm font-semibold ${colors.text}`}>{d.label}</span>
        {d.expandable && (
          <button
            onClick={(e) => { e.stopPropagation(); d.onToggle?.(); }}
            className="nodrag nopan text-stone-500 hover:text-stone-300 text-xs w-5 h-5 flex items-center justify-center rounded hover:bg-stone-800/50 transition-colors"
          >
            {d.expanded ? '\u2212' : '+'}
          </button>
        )}
      </div>

      {d.subtitle && (
        <div className={`text-[11px] ${colors.subtitleText} mt-0.5`}>{d.subtitle}</div>
      )}

      {d.stat && (
        <div className={`text-xs mt-1.5 font-medium ${d.statColor || 'text-stone-400'}`}>
          {d.stat}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-stone-500 !w-1.5 !h-1.5 !border-0 !opacity-0" />
    </div>
  );
}
