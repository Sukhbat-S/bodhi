import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { ColorScheme } from '../ecosystemConfig';

export interface FeatureNodeData {
  label: string;
  colorScheme: ColorScheme;
  stat?: string;
  visible: boolean;
  [key: string]: unknown;
}

const featureColors: Record<ColorScheme, { border: string; text: string }> = {
  violet: { border: 'border-violet-800/30', text: 'text-violet-300/80' },
  emerald: { border: 'border-emerald-800/30', text: 'text-emerald-300/80' },
  amber: { border: 'border-amber-800/30', text: 'text-amber-300/80' },
  stone: { border: 'border-stone-800/40', text: 'text-stone-400' },
};

export default function FeatureNode({ data }: NodeProps) {
  const d = data as unknown as FeatureNodeData;
  const colors = featureColors[d.colorScheme] ?? featureColors.stone;

  return (
    <div
      className={`bg-stone-900/50 ${colors.border} border rounded-lg px-3 py-2 min-w-[130px] backdrop-blur-sm transition-all duration-300 ${
        d.visible ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-stone-600 !w-1 !h-1 !border-0 !opacity-0" />
      <div className={`text-xs font-medium ${colors.text}`}>{d.label}</div>
      {d.stat && <div className="text-[10px] text-stone-500 mt-0.5">{d.stat}</div>}
    </div>
  );
}
