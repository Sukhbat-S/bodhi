import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useHandGesture } from '../hooks/useHandGesture';
import { HandOverlay } from '../components/HandOverlay';
import { GestureController } from '../components/GestureController';
import { GestureIndicatorOverlay } from '../components/GestureIndicatorOverlay';
// @ts-expect-error — d3-force-3d has no types
import { forceSimulation, forceLink, forceManyBody, forceCenter } from 'd3-force-3d';

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

interface Node3D {
  id: string;
  name: string;
  type: string;
  mentionCount: number;
  x: number;
  y: number;
  z: number;
}

// ---- Colors ----

const TYPE_COLORS: Record<string, string> = {
  person: '#8b5cf6',
  project: '#10b981',
  topic: '#f59e0b',
  organization: '#0ea5e9',
  place: '#f43f5e',
};

const typeColorsDot: Record<string, string> = {
  person: 'bg-violet-400',
  project: 'bg-emerald-400',
  topic: 'bg-amber-400',
  organization: 'bg-sky-400',
  place: 'bg-rose-400',
};

// ---- 3D Entity Sphere ----

function EntitySphere({
  node,
  isHovered,
  isConnected,
  isDimmed,
  onHover,
  onClick,
}: {
  node: Node3D;
  isHovered: boolean;
  isConnected: boolean;
  isDimmed: boolean;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const color = TYPE_COLORS[node.type] || '#f59e0b';
  const size = Math.max(0.5, Math.min(2.0, 0.5 + node.mentionCount * 0.08));
  const emissiveIntensity = isHovered ? 3 : isConnected ? 2 : isDimmed ? 0.1 : 0.8;
  const scale = isHovered ? 1.5 : isConnected ? 1.2 : isDimmed ? 0.7 : 1;

  useFrame(() => {
    if (meshRef.current) {
      const target = scale;
      const current = meshRef.current.scale.x;
      const lerped = current + (target - current) * 0.15;
      meshRef.current.scale.setScalar(lerped);
    }
  });

  return (
    <group position={[node.x, node.y, node.z]}>
      <mesh
        ref={meshRef}
        onPointerOver={(e) => { e.stopPropagation(); onHover(node.id); }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => { e.stopPropagation(); onClick(node.id); }}
      >
        <sphereGeometry args={[size, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
          transparent
          opacity={isDimmed ? 0.15 : 1}
          toneMapped={false}
        />
      </mesh>

      {/* Outer glow sphere — child of group, not sibling of animated mesh */}
      <mesh scale={isHovered ? 2.0 : 1.5}>
        <sphereGeometry args={[size, 8, 8]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isDimmed ? 0.01 : isHovered ? 0.15 : isConnected ? 0.08 : 0.04}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>

      {/* Label — always visible, brighter on hover */}
      <Billboard position={[0, size + 0.6, 0]}>
        <Text
          fontSize={isHovered ? 0.55 : isConnected ? 0.45 : 0.3}
          color={isHovered || isConnected ? color : '#a8a29e'}
          anchorX="center"
          anchorY="middle"
          outlineColor="black"
          outlineWidth={0.06}
          fillOpacity={isDimmed ? 0.1 : isHovered ? 1 : isConnected ? 0.9 : 0.5}
        >
          {node.name}
        </Text>
      </Billboard>
    </group>
  );
}

// ---- Connection Lines ----

function ConnectionLines({
  edges,
  nodeMap,
  hoveredId,
}: {
  edges: EntityEdge[];
  nodeMap: Map<string, Node3D>;
  hoveredId: string | null;
  connectedIds: Set<string>;
}) {
  // Default lines (faint)
  const defaultGeo = useMemo(() => {
    const positions: number[] = [];
    for (const edge of edges) {
      const source = nodeMap.get(edge.sourceId);
      const target = nodeMap.get(edge.targetId);
      if (!source || !target) continue;
      if (hoveredId && (edge.sourceId === hoveredId || edge.targetId === hoveredId)) continue;
      positions.push(source.x, source.y, source.z, target.x, target.y, target.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [edges, nodeMap, hoveredId]);

  // Highlighted lines (bright, colored)
  const highlightGeo = useMemo(() => {
    if (!hoveredId) return null;
    const positions: number[] = [];
    const colors: number[] = [];
    for (const edge of edges) {
      const source = nodeMap.get(edge.sourceId);
      const target = nodeMap.get(edge.targetId);
      if (!source || !target) continue;
      if (edge.sourceId !== hoveredId && edge.targetId !== hoveredId) continue;
      positions.push(source.x, source.y, source.z, target.x, target.y, target.z);
      const c = new THREE.Color(TYPE_COLORS[source.type] || '#f59e0b');
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geo;
  }, [edges, nodeMap, hoveredId]);

  return (
    <>
      <lineSegments geometry={defaultGeo}>
        <lineBasicMaterial color="#ffffff" transparent opacity={hoveredId ? 0.02 : 0.06} toneMapped={false} />
      </lineSegments>
      {highlightGeo && (
        <lineSegments geometry={highlightGeo}>
          <lineBasicMaterial vertexColors transparent opacity={0.5} toneMapped={false} />
        </lineSegments>
      )}
    </>
  );
}

// ---- Camera Fly-To ----

function CameraFly({ target }: { target: [number, number, number] | null }) {
  const { camera } = useThree();
  const targetRef = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    if (target) {
      targetRef.current = new THREE.Vector3(target[0], target[1], target[2] + 15);
    }
  }, [target]);

  useFrame(() => {
    if (targetRef.current) {
      camera.position.lerp(targetRef.current, 0.05);
      if (camera.position.distanceTo(targetRef.current) < 0.5) {
        targetRef.current = null;
      }
    }
  });

  return null;
}

// ---- Scene ----

function Scene({
  nodes,
  edges,
  hoveredId,
  selectedId,
  flyTarget,
  setHoveredId,
  onNodeClick,
}: {
  nodes: Node3D[];
  edges: EntityEdge[];
  hoveredId: string | null;
  selectedId: string | null;
  flyTarget: [number, number, number] | null;
  setHoveredId: (id: string | null) => void;
  onNodeClick: (id: string) => void;
}) {
  // Selected takes priority over hovered for highlighting
  const activeId = selectedId || hoveredId;

  const connectedIds = useMemo(() => {
    if (!activeId) return new Set<string>();
    const set = new Set<string>();
    set.add(activeId);
    for (const e of edges) {
      if (e.sourceId === activeId) set.add(e.targetId);
      if (e.targetId === activeId) set.add(e.sourceId);
    }
    return set;
  }, [activeId, edges]);

  const nodeMap = useMemo(() => {
    const map = new Map<string, Node3D>();
    for (const n of nodes) map.set(n.id, n);
    return map;
  }, [nodes]);

  return (
    <>
      <ambientLight intensity={0.1} />
      <pointLight position={[0, 0, 0]} intensity={0.5} color="#f59e0b" />

      <ConnectionLines
        edges={edges}
        nodeMap={nodeMap}
        hoveredId={activeId}
        connectedIds={connectedIds}
      />

      {nodes.map((node) => (
        <EntitySphere
          key={node.id}
          node={node}
          isHovered={activeId === node.id}
          isConnected={activeId ? connectedIds.has(node.id) : false}
          isDimmed={activeId ? !connectedIds.has(node.id) : false}
          onHover={setHoveredId}
          onClick={onNodeClick}
        />
      ))}

      <CameraFly target={flyTarget} />
      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        rotateSpeed={0.5}
        zoomSpeed={0.3}
        minDistance={10}
        maxDistance={500}
      />
    </>
  );
}

// ---- Detail Panel (kept from 2D version) ----

const typeColors: Record<string, { text: string; dot: string }> = {
  person: { text: 'text-violet-100', dot: 'bg-violet-400' },
  project: { text: 'text-emerald-100', dot: 'bg-emerald-400' },
  topic: { text: 'text-amber-100', dot: 'bg-amber-400' },
  organization: { text: 'text-sky-100', dot: 'bg-sky-400' },
  place: { text: 'text-rose-100', dot: 'bg-rose-400' },
};

function DetailPanel({ entity, onClose, onNavigate }: { entity: EntityDetail | null; onClose: () => void; onNavigate: (id: string) => void }) {
  if (!entity) return null;
  const colors = typeColors[entity.type] || typeColors.topic;

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

        {entity.description && <p className="text-xs text-stone-400 mb-3">{entity.description}</p>}

        {entity.relatedEntities.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-stone-300 mb-2">Related Entities</h3>
            <div className="space-y-1">
              {entity.relatedEntities.map((re) => (
                <button
                  key={re.id}
                  onClick={() => onNavigate(re.id)}
                  className="flex items-center gap-2 text-xs w-full text-left hover:bg-stone-800/50 rounded px-1 py-0.5 -mx-1 transition-colors"
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${typeColorsDot[re.type] || 'bg-amber-400'}`} />
                  <span className="text-stone-300 hover:text-white">{re.name}</span>
                  <span className="text-stone-600">{re.sharedMemoryCount} shared</span>
                </button>
              ))}
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

// ---- Main Page ----

export default function EntityGraphPage() {
  const [graphData, setGraphData] = useState<{ nodes: EntityData[]; edges: EntityEdge[] }>({ nodes: [], edges: [] });
  const [stats, setStats] = useState<{ total: number; byType: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EntityDetail | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<[number, number, number] | null>(null);
  const [gestureEnabled, setGestureEnabled] = useState(false);
  const gestureState = useHandGesture(gestureEnabled);
  const gestureOverlayRef = useRef<HTMLDivElement>(null);

  // Fetch data
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

  // Filter
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

  // 3D layout via d3-force-3d
  const nodes3D = useMemo<Node3D[]>(() => {
    if (filteredData.nodes.length === 0) return [];

    const simNodes = filteredData.nodes.map(n => ({
      id: n.id,
      name: n.name,
      type: n.type,
      mentionCount: n.mentionCount,
      x: (Math.random() - 0.5) * 50,
      y: (Math.random() - 0.5) * 50,
      z: (Math.random() - 0.5) * 50,
    }));

    const simLinks = filteredData.edges.map(e => ({
      source: e.sourceId,
      target: e.targetId,
    }));

    const sim = forceSimulation(simNodes, 3)
      .force('charge', forceManyBody().strength(-8))
      .force('link', forceLink(simLinks).id((d: any) => d.id).distance(8).strength(0.2))
      .force('center', forceCenter(0, 0, 0).strength(0.02))
      .stop();

    // Run 300 ticks to settle
    for (let i = 0; i < 300; i++) sim.tick();

    return simNodes.map((n: any) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      mentionCount: n.mentionCount,
      x: n.x || 0,
      y: n.y || 0,
      z: n.z || 0,
    }));
  }, [filteredData]);

  // Navigate to entity (fly camera + select)
  const handleNavigate = useCallback(async (nodeId: string) => {
    const node = nodes3D.find(n => n.id === nodeId);
    if (node) {
      setFlyTarget([node.x, node.y, node.z]);
    }
    // Also select it and load details
    setSelectedId(nodeId);
    try {
      const res = await fetch(`/api/entities/${nodeId}`);
      const data = await res.json();
      setDetail(data);
    } catch { setDetail(null); }
  }, [nodes3D]);

  // Click handler
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
    <div className="h-full flex flex-col" style={{ background: '#050505' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-stone-800/40 bg-black/60 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-stone-100 tracking-tight">Entity Graph</h1>
          <div className="flex items-center gap-1.5 text-xs text-stone-500">
            <span className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
            {stats ? `${stats.total} entities` : 'Loading...'}
          </div>
          <span className="text-[10px] text-stone-600 bg-stone-800/60 px-2 py-0.5 rounded">3D</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setTypeFilter(null)}
            className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${
              !typeFilter ? 'bg-amber-500/20 text-amber-400' : 'text-stone-500 bg-stone-800/60 hover:bg-stone-800'
            }`}
          >
            All
          </button>
          {entityTypes.map(([type, count]) => (
            <button
              key={type}
              onClick={() => setTypeFilter(typeFilter === type ? null : type)}
              className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors flex items-center gap-1 ${
                typeFilter === type
                  ? 'text-white bg-stone-700'
                  : 'text-stone-500 bg-stone-800/60 hover:bg-stone-800'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full`} style={{ background: TYPE_COLORS[type] }} />
              {type} ({count})
            </button>
          ))}

          <div className="w-px h-4 bg-stone-800 mx-1" />
          <button
            onClick={() => setGestureEnabled(!gestureEnabled)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              gestureEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'text-stone-400 bg-stone-800/60 hover:bg-stone-800 hover:text-stone-200'
            }`}
            title="Toggle hand gesture control"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            {gestureEnabled ? 'Hand On' : 'Hand'}
          </button>
          <button
            onClick={loadGraph}
            className="px-3 py-1.5 text-xs font-medium text-stone-400 bg-stone-800/60 rounded-md hover:bg-stone-800 hover:text-stone-200 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* 3D Canvas */}
      <div className="flex-1 relative">
        {nodes3D.length > 0 && (
          <Canvas
            camera={{ position: [0, 0, 100], fov: 50 }}
            gl={{ antialias: true, alpha: true, toneMapping: THREE.NoToneMapping }}
            style={{ background: '#050505' }}
          >
            <Scene
              nodes={nodes3D}
              edges={filteredData.edges}
              hoveredId={hoveredId}
              selectedId={selectedId}
              flyTarget={flyTarget}
              setHoveredId={setHoveredId}
              onNodeClick={handleNodeClick}
            />
            {gestureEnabled && gestureState.isActive && (
              <GestureController
                gesture={gestureState}
                nodes={nodes3D}
                onHover={setHoveredId}
                onClick={handleNodeClick}
                overlayRef={gestureOverlayRef}
              />
            )}
          </Canvas>
        )}

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-stone-600 text-sm">Loading constellation...</span>
          </div>
        )}

        {/* Gesture directional indicators */}
        {gestureEnabled && <GestureIndicatorOverlay ref={gestureOverlayRef} />}

        <DetailPanel entity={detail} onClose={() => { setDetail(null); setSelectedId(null); setFlyTarget(null); }} onNavigate={handleNavigate} />

        {/* Hand gesture overlay */}
        {gestureEnabled && (
          <HandOverlay
            videoRef={gestureState.videoRef}
            landmarks={gestureState.landmarks}
            gesture={gestureState.gesture}
            isActive={gestureState.isActive}
            hands={gestureState.hands}
            pinchDistance={gestureState.pinchDistance}
            palmPosition={gestureState.palmPosition}
          />
        )}

        {/* Controls hint */}
        <div className={`absolute bottom-4 ${gestureEnabled ? 'left-56' : 'left-4'} text-[10px] text-stone-700`}>
          {gestureEnabled
            ? 'Palm: rotate / Pinch: zoom / Point: select / Fist: pan / Thumbs up: confirm / Wave: reset'
            : 'Drag to orbit / Scroll to zoom / Click node for details'}
        </div>
      </div>
    </div>
  );
}
