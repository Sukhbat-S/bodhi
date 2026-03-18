import { useCallback } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useReactFlow,
  applyNodeChanges,
} from '@xyflow/react';
import type { Node, Edge, OnNodesChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import HubNode from './nodes/HubNode';
import ProjectNode from './nodes/ProjectNode';
import FeatureNode from './nodes/FeatureNode';
import AnimatedEdge from './edges/AnimatedEdge';
import { useForceLayout } from './useForceLayout';

const nodeTypes = {
  hub: HubNode,
  project: ProjectNode,
  feature: FeatureNode,
};

const edgeTypes = {
  animated: AnimatedEdge,
};

interface EcosystemGraphProps {
  nodes: Node[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  simulationRunning: boolean;
  onNodeClick?: (nodeId: string) => void;
}

export default function EcosystemGraph({
  nodes,
  edges,
  setNodes,
  simulationRunning,
  onNodeClick,
}: EcosystemGraphProps) {
  const { fitView } = useReactFlow();
  const { onNodeDragStart, onNodeDrag, onNodeDragStop } = useForceLayout(
    nodes,
    edges,
    setNodes,
    simulationRunning,
  );

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes],
  );

  const onInit = useCallback(() => {
    setTimeout(() => fitView({ padding: 0.15, duration: 600 }), 800);
  }, [fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStart={onNodeDragStart}
      onNodeDrag={onNodeDrag}
      onNodeDragStop={onNodeDragStop}
      onNodeClick={onNodeClick ? (_, node) => onNodeClick(node.id) : undefined}
      onInit={onInit}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      panOnScroll
      minZoom={0.2}
      maxZoom={2}
      defaultEdgeOptions={{ type: 'animated' }}
      proOptions={{ hideAttribution: true }}
      className="ecosystem-canvas"
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={24}
        size={1}
        color="rgba(120, 113, 108, 0.15)"
      />
      <Controls
        showInteractive={false}
        className="!bg-stone-800/90 !border-stone-700 !rounded-lg !shadow-lg [&>button]:!bg-stone-800 [&>button]:!border-stone-700 [&>button]:!text-stone-300 [&>button:hover]:!bg-stone-700"
      />
      <MiniMap
        nodeColor={(node) => {
          const scheme = (node.data as Record<string, unknown>)?.colorScheme as string;
          if (scheme === 'violet') return 'rgba(139, 92, 246, 0.6)';
          if (scheme === 'emerald') return 'rgba(52, 211, 153, 0.6)';
          if (scheme === 'amber') return 'rgba(245, 158, 11, 0.6)';
          return 'rgba(120, 113, 108, 0.6)';
        }}
        maskColor="rgba(12, 10, 9, 0.85)"
        className="!bg-stone-900/90 !border-stone-700 !rounded-lg"
      />
    </ReactFlow>
  );
}
