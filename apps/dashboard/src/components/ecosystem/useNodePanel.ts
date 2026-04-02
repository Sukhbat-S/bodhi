import { useState, useCallback } from 'react';
import { getPanelDef } from './nodePanelConfig';
import type { PanelDataType, NodePanelDef } from './nodePanelConfig';
import { nodeDefs } from './ecosystemConfig';

export interface PanelState {
  nodeId: string;
  def: NodePanelDef;
  data: PanelDataType | null;
  loading: boolean;
  error: string | null;
}

export function useNodePanel() {
  const [panel, setPanel] = useState<PanelState | null>(null);

  const openPanel = useCallback(async (nodeId: string) => {
    // Look up config — skip feature nodes by building a fallback
    let def = getPanelDef(nodeId);

    if (!def) {
      // Feature node — show generic info from ecosystemConfig
      const nodeCfg = nodeDefs.find((n) => n.id === nodeId);
      if (!nodeCfg) return;

      def = {
        title: nodeCfg.label,
        subtitle: nodeCfg.subtitle ?? '',
        colorScheme: nodeCfg.colorScheme,
        fetchData: async () => ({
          kind: 'static' as const,
          description: `${nodeCfg.label} — part of the ${nodeCfg.parentId ?? 'ecosystem'} subsystem.`,
        }),
        chatHint: `The user is looking at ${nodeCfg.label}. Provide relevant information about this component.`,
      };
    }

    // Set panel immediately with loading state
    setPanel({ nodeId, def, data: null, loading: true, error: null });

    try {
      const data = await def.fetchData();
      setPanel((prev) =>
        prev?.nodeId === nodeId ? { ...prev, data, loading: false } : prev,
      );
    } catch (err) {
      setPanel((prev) =>
        prev?.nodeId === nodeId
          ? { ...prev, loading: false, error: (err as Error).message }
          : prev,
      );
    }
  }, []);

  const closePanel = useCallback(() => {
    setPanel(null);
  }, []);

  return { panel, openPanel, closePanel };
}
