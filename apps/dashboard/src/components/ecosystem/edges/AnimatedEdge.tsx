import { BaseEdge, getSmoothStepPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import type { EdgeType } from '../ecosystemConfig';

const edgeStyles: Record<EdgeType, React.CSSProperties> = {
  core: {
    stroke: 'rgba(139, 92, 246, 0.4)',
    strokeWidth: 2,
  },
  monitors: {
    stroke: 'rgba(120, 113, 108, 0.5)',
    strokeWidth: 1.5,
    strokeDasharray: '6 4',
  },
  proves: {
    stroke: 'rgba(217, 119, 6, 0.3)',
    strokeWidth: 1,
    strokeDasharray: '3 3',
  },
  child: {
    stroke: 'rgba(87, 83, 78, 0.4)',
    strokeWidth: 1,
  },
};

export interface AnimatedEdgeData {
  edgeType: EdgeType;
  [key: string]: unknown;
}

export default function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const edgeType = (data as AnimatedEdgeData | undefined)?.edgeType ?? 'child';
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 16,
  });

  const style = edgeStyles[edgeType];
  const animated = edgeType === 'monitors';

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={style}
      className={animated ? 'ecosystem-edge-animated' : ''}
    />
  );
}
