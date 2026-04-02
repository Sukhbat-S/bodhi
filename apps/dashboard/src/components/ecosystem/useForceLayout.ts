import { useEffect, useRef, useCallback } from 'react';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
} from 'd3-force';
import type { Node, Edge } from '@xyflow/react';
import type { SimulationNodeDatum, SimulationLinkDatum } from 'd3-force';

interface SimNode extends SimulationNodeDatum {
  id: string;
  fx?: number | null;
  fy?: number | null;
}

export function useForceLayout(
  nodes: Node[],
  edges: Edge[],
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  running: boolean,
) {
  const simulationRef = useRef<ReturnType<typeof forceSimulation<SimNode>> | null>(null);
  const simNodesRef = useRef<SimNode[]>([]);

  useEffect(() => {
    if (!running || nodes.length === 0) return;

    // Only init simulation once (or when node count changes)
    const simNodes: SimNode[] = nodes.map(n => ({
      id: n.id,
      x: n.position.x,
      y: n.position.y,
    }));
    simNodesRef.current = simNodes;

    const nodeIds = new Set(simNodes.map(n => n.id));
    const simLinks: SimulationLinkDatum<SimNode>[] = edges
      .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map(e => ({
        source: e.source,
        target: e.target,
      }));

    const sim = forceSimulation<SimNode>(simNodes)
      .force('charge', forceManyBody<SimNode>().strength(-400))
      .force(
        'link',
        forceLink<SimNode, SimulationLinkDatum<SimNode>>(simLinks)
          .id(d => d.id)
          .distance(160)
          .strength(0.6),
      )
      .force('center', forceCenter(0, 0).strength(0.05))
      .force('collide', forceCollide<SimNode>().radius(90).strength(0.7))
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
            // Guard against NaN/Infinity — keep previous position if corrupt
            if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) {
              return node;
            }
            return {
              ...node,
              position: { x, y },
            };
          }),
        );
      });

    simulationRef.current = sim;

    return () => {
      sim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const reheat = useCallback(() => {
    const sim = simulationRef.current;
    if (sim) {
      sim.alpha(1).restart();
    }
  }, []);

  return { onNodeDragStart, onNodeDrag, onNodeDragStop, reheat };
}
