import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  useReactFlow,
  applyNodeChanges,
} from '@xyflow/react';
import type { Node, Edge, NodeProps, OnNodesChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
} from 'd3-force';
import type { SimulationNodeDatum, SimulationLinkDatum } from 'd3-force';

// ---- Types ----

interface EntityData {
  id: string;
  name: string;
  type: string;
  mentionCount: number;
  importance: number;
  aliases: string[] | null;
  description: string | null;
}

interface EntityEdge {
  sourceId: string;
  targetId: string;
  sharedMemoryCount: number;
}

interface EntityDetail extends EntityData {
  memories: Array<{ id: string; content: string; type: string; importance: number; createdAt: string }>;
  relatedEntities: Array<EntityData & { sharedMemoryCount: number }>;
}

// ---- Color Schemes ----

const typeColors: Record<string, { bg: string; border: string; text: string; dot: string; minimap: string }> = {
  person: { bg: 'bg-violet-950/60', border: 'border-violet-700/40', text: 'text-violet-100', dot: 'bg-violet-400', minimap: 'rgba(139,92,246,0.6)' },
  project: { bg: 'bg-emerald-950/60', border: 'border-emerald-700/40', text: 'text-emerald-100', dot: 'bg-emerald-400', minimap: 'rgba(52,211,153,0.6)' },
  topic: { bg: 'bg-amber-950/60', border: 'border-amber-700/40', text: 'text-amber-100', dot: 'bg-amber-400', minimap: 'rgba(245,158,11,0.6)' },
  organization: { bg: 'bg-sky-950/60', border: 'border-sky-700/40', text: 'text-sky-100', dot: 'bg-sky-400', minimap: 'rgba(56,189,248,0.6)' },
  place: { bg: 'bg-rose-950/60', border: 'border-rose-700/40', text: 'text-rose-100', dot: 'bg-rose-400', minimap: 'rgba(251,113,133,0.6)' },
};

const fallbackColor = typeColors.topic;

// ---- Entity Node Component ----

function EntityNode({ data }: NodeProps) {
  const d = data as unknown as { label: string; entityType: string; mentionCount: number; selected: boolean };
  const colors = typeColors[d.entityType] || fallbackColor;
  const size = Math.max(140, Math.min(200, 140 + d.mentionCount * 3));

  return (
    <div
      className={`${colors.bg} ${colors.border} border rounded-xl px-3 py-2 backdrop-blur-sm transition-all duration-200 hover:brightness-110 ${d.selected ? 'ring-2 ring-amber-500/60' : ''}`}
      style={{ minWidth: size }}
    >
      <Handle type="target" position={Position.Top} className="!bg-stone-500 !w-1.5 !h-1.5 !border-0 !opacity-0" />
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${colors.dot} shrink-0`} />
        <span className={`text-sm font-semibold ${colors.text} truncate`}>{d.label}</span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-[10px] text-stone-500 uppercase tracking-wider">{d.entityType}</span>
        {d.mentionCount > 0 && (
          <span className="text-[10px] text-stone-400">{d.mentionCount} mentions</span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-stone-500 !w-1.5 !h-1.5 !border-0 !opacity-0" />
    </div>
  );
}

const nodeTypes = { entity: EntityNode };

// ---- Force Layout Hook (reused pattern from EcosystemPage) ----

interface SimNode extends SimulationNodeDatum {
  id: string;
  fx?: number | null;
  fy?: number | null;
}

function useForceLayout(
  nodes: Node[],
  edges: Edge[],
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  running: boolean,
) {
  const simulationRef = useRef<ReturnType<typeof forceSimulation<SimNode>> | null>(null);
  const simNodesRef = useRef<SimNode[]>([]);

  useEffect(() => {
    if (!running || nodes.length === 0) return;

    const simNodes: SimNode[] = nodes.map(n => ({
      id: n.id,
      x: n.position.x,
      y: n.position.y,
    }));
    simNodesRef.current = simNodes;

    const nodeIds = new Set(simNodes.map(n => n.id));
    const simLinks: SimulationLinkDatum<SimNode>[] = edges
      .filter(e => nodeIds.has(e.source as string) && nodeIds.has(e.target as string))
      .map(e => ({ source: e.source as string, target: e.target as string }));

    const sim = forceSimulation<SimNode>(simNodes)
      .force('charge', forceManyBody<SimNode>().strength(-300))
      .force(
        'link',
        forceLink<SimNode, SimulationLinkDatum<SimNode>>(simLinks)
          .id(d => d.id)
          .distance(180)
          .strength(0.5),
      )
      .force('center', forceCenter(0, 0).strength(0.05))
      .force('collide', forceCollide<SimNode>().radius(80).strength(0.7))
      .force('x', forceX<SimNode>(0).strength(0.03))
      .force('y', forceY<SimNode>(0).strength(0.03))
      .alphaDecay(0.015)
      .velocityDecay(0.3)
      .on('tick', () => {
        setNodes(prev =>
          prev.map(node => {
            const simNode = simNodes.find(sn => sn.id === node.id);
            if (!simNode || simNode.fx != null) return node;
            const x = simNode.x;
            const y = simNode.y;
            if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) return node;
            return { ...node, position: { x, y } };
          }),
        );
      });

    simulationRef.current = sim;
    return () => { sim.stop(); };
  }, [nodes.length, edges.length, running]);

  const onNodeDragStart = useCallback((_: unknown, node: Node) => {
    const sim = simulationRef.current;
    const simNode = simNodesRef.current.find(sn => sn.id === node.id);
    if (sim && simNode) {
      sim.alphaTarget(0.05).restart();
      simNode.fx = node.position.x;
      simNode.fy = node.position.y;
    }
  }, []);

  const onNodeDrag = useCallback((_: unknown, node: Node) => {
    const simNode = simNodesRef.current.find(sn => sn.id === node.id);
    if (simNode) {
      simNode.fx = node.position.x;
      simNode.fy = node.position.y;
    }
  }, []);

  const onNodeDragStop = useCallback((_: unknown, node: Node) => {
    const sim = simulationRef.current;
    const simNode = simNodesRef.current.find(sn => sn.id === node.id);
    if (sim && simNode) {
      sim.alphaTarget(0);
      simNode.fx = null;
      simNode.fy = null;
    }
  }, []);

  return { onNodeDragStart, onNodeDrag, onNodeDragStop };
}

// ---- Detail Panel ----

function DetailPanel({ entity, onClose }: { entity: EntityDetail | null; onClose: () => void }) {
  if (!entity) return null;
  const colors = typeColors[entity.type] || fallbackColor;

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-stone-900/95 backdrop-blur-sm border-l border-stone-800/60 overflow-y-auto z-10">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
            <h2 className={`text-base font-bold ${colors.text}`}>{entity.name}</h2>
          </div>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-300 text-lg">&times;</button>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] uppercase tracking-wider text-stone-500 bg-stone-800 px-2 py-0.5 rounded">{entity.type}</span>
          <span className="text-xs text-stone-400">{entity.mentionCount} mentions</span>
        </div>

        {entity.description && (
          <p className="text-xs text-stone-400 mb-3">{entity.description}</p>
        )}

        {entity.aliases && entity.aliases.length > 0 && (
          <div className="mb-3">
            <span className="text-[10px] uppercase tracking-wider text-stone-500">Also known as:</span>
            <p className="text-xs text-stone-300 mt-0.5">{entity.aliases.join(', ')}</p>
          </div>
        )}

        {entity.relatedEntities.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-stone-300 mb-2">Related Entities</h3>
            <div className="space-y-1">
              {entity.relatedEntities.map((re) => {
                const rc = typeColors[re.type] || fallbackColor;
                return (
                  <div key={re.id} className="flex items-center gap-2 text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full ${rc.dot}`} />
                    <span className="text-stone-300">{re.name}</span>
                    <span className="text-stone-600">{re.sharedMemoryCount} shared</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {entity.memories.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-stone-300 mb-2">Linked Memories ({entity.memories.length})</h3>
            <div className="space-y-2">
              {entity.memories.slice(0, 20).map((m) => (
                <div key={m.id} className="bg-stone-800/50 rounded-lg p-2">
                  <p className="text-xs text-stone-300 leading-relaxed">{m.content}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-stone-500">{m.type}</span>
                    <span className="text-[10px] text-stone-600">{new Date(m.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Graph Component (with React Flow) ----

function EntityGraphInner({
  nodes,
  edges,
  setNodes,
  simulationRunning,
  onNodeClick,
}: {
  nodes: Node[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  simulationRunning: boolean;
  onNodeClick: (nodeId: string) => void;
}) {
  const { fitView } = useReactFlow();
  const { onNodeDragStart, onNodeDrag, onNodeDragStop } = useForceLayout(nodes, edges, setNodes, simulationRunning);

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
      onNodesChange={onNodesChange}
      onNodeDragStart={onNodeDragStart}
      onNodeDrag={onNodeDrag}
      onNodeDragStop={onNodeDragStop}
      onNodeClick={(_, node) => onNodeClick(node.id)}
      onInit={onInit}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      panOnScroll
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(120,113,108,0.15)" />
      <Controls
        showInteractive={false}
        className="!bg-stone-800/90 !border-stone-700 !rounded-lg !shadow-lg [&>button]:!bg-stone-800 [&>button]:!border-stone-700 [&>button]:!text-stone-300 [&>button:hover]:!bg-stone-700"
      />
      <MiniMap
        nodeColor={(node) => {
          const t = (node.data as Record<string, unknown>)?.entityType as string;
          return typeColors[t]?.minimap || 'rgba(120,113,108,0.6)';
        }}
        maskColor="rgba(12,10,9,0.85)"
        className="!bg-stone-900/90 !border-stone-700 !rounded-lg"
      />
    </ReactFlow>
  );
}

// ---- Main Page ----

export default function EntityGraphPage() {
  const [graphData, setGraphData] = useState<{ nodes: EntityData[]; edges: EntityEdge[] }>({ nodes: [], edges: [] });
  const [stats, setStats] = useState<{ total: number; byType: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulationRunning, setSimulationRunning] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EntityDetail | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  // Fetch graph data
  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      const [graphRes, statsRes] = await Promise.all([
        fetch('/api/entities/graph').then(r => r.json()),
        fetch('/api/entities/stats').then(r => r.json()),
      ]);
      setGraphData(graphRes);
      setStats(statsRes);
    } catch (err) {
      console.error('Failed to load entity graph:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGraph(); }, [loadGraph]);

  // Build React Flow nodes + edges from API data
  const filteredData = useMemo(() => {
    const filteredNodes = typeFilter
      ? graphData.nodes.filter(n => n.type === typeFilter)
      : graphData.nodes;
    const nodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredEdges = graphData.edges.filter(
      e => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId)
    );
    return { nodes: filteredNodes, edges: filteredEdges };
  }, [graphData, typeFilter]);

  const [rfNodes, setRfNodes] = useState<Node[]>([]);

  useEffect(() => {
    // Spread nodes in a circle initially
    const count = filteredData.nodes.length;
    const radius = Math.max(200, count * 15);
    setRfNodes(
      filteredData.nodes.map((entity, i) => ({
        id: entity.id,
        type: 'entity',
        position: {
          x: Math.cos((2 * Math.PI * i) / count) * radius,
          y: Math.sin((2 * Math.PI * i) / count) * radius,
        },
        data: {
          label: entity.name,
          entityType: entity.type,
          mentionCount: entity.mentionCount,
          selected: entity.id === selectedId,
        },
      })),
    );
  }, [filteredData.nodes, selectedId]);

  const rfEdges = useMemo<Edge[]>(() =>
    filteredData.edges.map((e) => ({
      id: `${e.sourceId}-${e.targetId}`,
      source: e.sourceId,
      target: e.targetId,
      style: {
        stroke: 'rgba(120,113,108,0.3)',
        strokeWidth: Math.min(3, e.sharedMemoryCount),
      },
      animated: e.sharedMemoryCount >= 3,
    })),
  [filteredData.edges]);

  // Load entity detail on click
  const handleNodeClick = useCallback(async (nodeId: string) => {
    setSelectedId(nodeId);
    try {
      const res = await fetch(`/api/entities/${nodeId}`);
      const data = await res.json();
      setDetail(data);
    } catch {
      setDetail(null);
    }
  }, []);

  const entityTypes = useMemo(() =>
    Object.entries(stats?.byType || {}).sort(([, a], [, b]) => b - a),
  [stats]);

  return (
    <div className="h-full flex flex-col bg-stone-950">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-stone-800/60 bg-stone-900/60 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-stone-100 tracking-tight">Entity Graph</h1>
          <div className="flex items-center gap-1.5 text-xs text-stone-500">
            <span className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
            {stats ? `${stats.total} entities` : 'Loading...'}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Type filter pills */}
          <button
            onClick={() => setTypeFilter(null)}
            className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${
              !typeFilter ? 'bg-amber-500/20 text-amber-400' : 'text-stone-500 bg-stone-800/60 hover:bg-stone-800'
            }`}
          >
            All
          </button>
          {entityTypes.map(([type, count]) => {
            const c = typeColors[type] || fallbackColor;
            return (
              <button
                key={type}
                onClick={() => setTypeFilter(typeFilter === type ? null : type)}
                className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors flex items-center gap-1 ${
                  typeFilter === type
                    ? `${c.bg} ${c.text}`
                    : 'text-stone-500 bg-stone-800/60 hover:bg-stone-800'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                {type} ({count})
              </button>
            );
          })}

          <div className="w-px h-4 bg-stone-800 mx-1" />

          <button
            onClick={() => setSimulationRunning((r) => !r)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              simulationRunning
                ? 'text-violet-300 bg-violet-900/40 hover:bg-violet-900/60'
                : 'text-stone-400 bg-stone-800/60 hover:bg-stone-800'
            }`}
          >
            {simulationRunning ? 'Physics On' : 'Physics Off'}
          </button>
          <button
            onClick={loadGraph}
            className="px-3 py-1.5 text-xs font-medium text-stone-400 bg-stone-800/60 rounded-md hover:bg-stone-800 hover:text-stone-200 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Graph */}
      <div className="flex-1 relative">
        <ReactFlowProvider>
          <EntityGraphInner
            nodes={rfNodes}
            edges={rfEdges}
            setNodes={setRfNodes}
            simulationRunning={simulationRunning}
            onNodeClick={handleNodeClick}
          />
        </ReactFlowProvider>
        <DetailPanel entity={detail} onClose={() => { setDetail(null); setSelectedId(null); }} />
      </div>
    </div>
  );
}
