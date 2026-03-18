import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

export interface HubNodeData {
  label: string;
  subtitle: string;
  services?: { name: string; ok: boolean }[];
  memoryCount?: number;
  [key: string]: unknown;
}

export default function HubNode({ data }: NodeProps) {
  const d = data as unknown as HubNodeData;
  return (
    <div className="hub-pulse bg-violet-950/80 border-2 border-violet-500/50 rounded-2xl px-6 py-4 shadow-lg shadow-violet-500/20 min-w-[220px] backdrop-blur-sm">
      <Handle type="target" position={Position.Top} className="!bg-violet-500 !w-2 !h-2 !border-0 !opacity-0" />

      <div className="text-lg font-bold text-violet-100 tracking-tight">{d.label}</div>
      <div className="text-[11px] text-violet-400/70 mt-0.5">{d.subtitle}</div>

      {d.services && d.services.length > 0 && (
        <div className="flex items-center gap-1.5 mt-3">
          {d.services.map(svc => (
            <div key={svc.name} className="flex items-center gap-1" title={svc.name}>
              <span className={`w-1.5 h-1.5 rounded-full ${svc.ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span className="text-[9px] text-violet-400/50">{svc.name}</span>
            </div>
          ))}
        </div>
      )}

      {d.memoryCount != null && (
        <div className="mt-2 text-xs font-medium text-violet-300/80">
          {d.memoryCount.toLocaleString()} memories
        </div>
      )}

      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-violet-500 !w-2 !h-2 !border-0 !opacity-0" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-violet-500 !w-2 !h-2 !border-0 !opacity-0" />
      <Handle type="source" position={Position.Left} id="left" className="!bg-violet-500 !w-2 !h-2 !border-0 !opacity-0" />
    </div>
  );
}
