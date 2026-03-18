import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import type { Node } from '@xyflow/react';

import EcosystemGraph from '../components/ecosystem/EcosystemGraph';
import NodeDetailPanel from '../components/ecosystem/NodeDetailPanel';
import { nodeDefs, edgeDefs } from '../components/ecosystem/ecosystemConfig';
import { useEcosystemData } from '../components/ecosystem/useEcosystemData';
import { useNodePanel } from '../components/ecosystem/useNodePanel';
import type { NodeLiveData } from '../components/ecosystem/useEcosystemData';

function buildNodes(
  expanded: Set<string>,
  toggleExpand: (id: string) => void,
  nodeData: Record<string, NodeLiveData>,
): Node[] {
  return nodeDefs
    .filter((def) => {
      // Only include feature nodes when their parent is expanded
      if (def.type === 'feature' && def.parentId) {
        return expanded.has(def.parentId);
      }
      return true;
    })
    .map((def) => {
      const live = nodeData[def.id];

      const data: Record<string, unknown> = {
        label: def.label,
        subtitle: def.subtitle,
        colorScheme: def.colorScheme,
        visible: true,
      };

      if (def.type === 'hub') {
        data.services = live?.services;
        data.memoryCount = live?.memoryCount;
      }

      if (def.type === 'project') {
        data.expandable = def.expandable ?? false;
        data.expanded = expanded.has(def.id);
        data.onToggle = () => toggleExpand(def.id);
        data.stat = live?.stat;
        data.statColor = live?.statColor;
      }

      if (def.type === 'feature') {
        data.stat = live?.stat;
      }

      return {
        id: def.id,
        type: def.type,
        position: def.initialPosition,
        data,
      };
    });
}


export default function EcosystemPage() {
  const { nodeData, loading, reload } = useEcosystemData();
  const { panel, openPanel, closePanel } = useNodePanel();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [simulationRunning, setSimulationRunning] = useState(true);
  const initializedRef = useRef(false);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const expandable = nodeDefs.filter((n) => n.expandable).map((n) => n.id);
    setExpanded(new Set(expandable));
  }, []);

  const collapseAll = useCallback(() => {
    setExpanded(new Set());
  }, []);

  const [nodes, setNodes] = useState<Node[]>(() =>
    buildNodes(new Set(), () => {}, {}),
  );

  // When topology changes (expand/collapse), rebuild with new nodes but preserve existing positions
  useEffect(() => {
    const freshNodes = buildNodes(expanded, toggleExpand, nodeData);

    setNodes((prev) => {
      if (!initializedRef.current) {
        initializedRef.current = true;
        return freshNodes;
      }

      // Merge: keep positions from prev, update data from freshNodes
      const prevMap = new Map(prev.map((n) => [n.id, n]));
      const merged = freshNodes.map((fn) => {
        const existing = prevMap.get(fn.id);
        if (existing) {
          return { ...fn, position: existing.position };
        }
        return fn;
      });

      return merged;
    });
  }, [expanded, toggleExpand, nodeData]);

  // Derive edges from actual rendered nodes to stay in sync
  const edges = useMemo(() => {
    const nodeIds = new Set(nodes.map((n) => n.id));
    return edgeDefs
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'animated' as const,
        data: { edgeType: e.edgeType },
      }));
  }, [nodes]);

  return (
    <div className="h-full flex flex-col bg-stone-950">
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-stone-800/60 bg-stone-900/60 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-stone-100 tracking-tight">Ecosystem</h1>
          <div className="flex items-center gap-1.5 text-xs text-stone-500">
            <span className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
            {loading ? 'Loading...' : 'Live'}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="px-3 py-1.5 text-xs font-medium text-stone-400 bg-stone-800/60 rounded-md hover:bg-stone-800 hover:text-stone-200 transition-colors"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="px-3 py-1.5 text-xs font-medium text-stone-400 bg-stone-800/60 rounded-md hover:bg-stone-800 hover:text-stone-200 transition-colors"
          >
            Collapse
          </button>
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
            onClick={reload}
            className="px-3 py-1.5 text-xs font-medium text-stone-400 bg-stone-800/60 rounded-md hover:bg-stone-800 hover:text-stone-200 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Graph canvas */}
      <div className="flex-1 relative">
        <ReactFlowProvider>
          <EcosystemGraph
            nodes={nodes}
            edges={edges}
            setNodes={setNodes}
            simulationRunning={simulationRunning}
            onNodeClick={openPanel}
          />
        </ReactFlowProvider>
        <NodeDetailPanel panel={panel} onClose={closePanel} />
      </div>
    </div>
  );
}
