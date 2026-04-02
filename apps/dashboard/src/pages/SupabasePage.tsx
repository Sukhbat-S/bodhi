import { useEffect, useState, useCallback } from "react";
import {
  getSupabaseStatus,
  getSupabaseHealth,
  type SupabaseProjectHealth,
  type SupabaseTableInfo,
} from "../api";

const statusColors: Record<string, string> = {
  ACTIVE_HEALTHY: "text-emerald-400",
  COMING_UP: "text-amber-400",
  PAUSED: "text-stone-500",
  INACTIVE: "text-red-400",
  UNKNOWN: "text-stone-500",
};

export default function SupabasePage() {
  const [health, setHealth] = useState<SupabaseProjectHealth | null>(null);
  const [tables, setTables] = useState<SupabaseTableInfo[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const status = await getSupabaseStatus().catch(() => ({
        connected: false,
        reason: "Server unreachable",
      }));
      setConnected(status.connected);
      if (!status.connected) {
        setReason(status.reason || "Not connected");
        setLoading(false);
        return;
      }

      const data = await getSupabaseHealth().catch(() => ({
        health: null as unknown as SupabaseProjectHealth,
        tables: [] as SupabaseTableInfo[],
      }));
      if (data.health) setHealth(data.health);
      setTables(data.tables || []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Supabase data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 300000); // 5 minutes
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-stone-500 animate-pulse">Loading...</div>
      </div>
    );
  }

  if (connected === false) {
    return (
      <div className="p-8 max-w-4xl">
        <h2 className="text-2xl font-bold text-stone-100 mb-6">Supabase</h2>
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-8 text-center">
          <div className="text-4xl mb-4">⚡</div>
          <h3 className="text-lg font-medium text-stone-200 mb-2">
            Supabase Not Connected
          </h3>
          <p className="text-sm text-stone-400 mb-4">
            {reason || "SUPABASE_ACCESS_TOKEN not configured"}
          </p>
          <p className="text-xs text-stone-500">
            Set{" "}
            <code className="bg-stone-800 px-1.5 py-0.5 rounded">
              SUPABASE_ACCESS_TOKEN
            </code>{" "}
            and{" "}
            <code className="bg-stone-800 px-1.5 py-0.5 rounded">
              SUPABASE_PROJECT_REF
            </code>{" "}
            in your .env file
          </p>
        </div>
      </div>
    );
  }

  const totalRows = tables.reduce((sum, t) => sum + t.rowCount, 0);

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-stone-100">Supabase</h2>
        <p className="text-sm text-stone-400 mt-1">Infrastructure Health</p>
      </div>

      {error && (
        <div className="text-red-400 bg-red-500/10 px-4 py-3 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}

      {/* Project Health Card */}
      {health && (
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-stone-100">
                {health.name}
              </h3>
              <p className="text-xs text-stone-500 mt-1">
                Ref: {health.ref} &middot; Region: {health.region}
              </p>
            </div>
            <div className="text-right">
              <p
                className={`text-sm font-medium ${statusColors[health.status] || "text-stone-400"}`}
              >
                {health.status === "ACTIVE_HEALTHY" ? "HEALTHY" : health.status}
              </p>
              <p className="text-xs text-stone-600 mt-1">
                Postgres {health.dbVersion}
              </p>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-stone-800">
            <div>
              <p className="text-2xl font-bold text-stone-100">
                {tables.length}
              </p>
              <p className="text-xs text-stone-500">Tables</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-stone-100">
                {totalRows.toLocaleString()}
              </p>
              <p className="text-xs text-stone-500">Total Rows</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-stone-100">
                {health.region}
              </p>
              <p className="text-xs text-stone-500">Region</p>
            </div>
          </div>
        </div>
      )}

      {/* Table List */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-stone-100 mb-4">
          Database Tables
          {tables.length > 0 && (
            <span className="ml-2 text-sm font-normal text-stone-500">
              ({tables.length})
            </span>
          )}
        </h3>
        {tables.length === 0 ? (
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 text-center">
            <p className="text-sm text-stone-400">No tables found</p>
          </div>
        ) : (
          <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-800">
                  <th className="text-left text-xs font-medium text-stone-500 px-4 py-3">
                    Table
                  </th>
                  <th className="text-left text-xs font-medium text-stone-500 px-4 py-3">
                    Schema
                  </th>
                  <th className="text-right text-xs font-medium text-stone-500 px-4 py-3">
                    Rows
                  </th>
                </tr>
              </thead>
              <tbody>
                {tables.map((table) => (
                  <tr
                    key={`${table.schema}.${table.name}`}
                    className="border-b border-stone-800/50 last:border-0"
                  >
                    <td className="px-4 py-2.5">
                      <span className="text-sm font-medium text-stone-200">
                        {table.name}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-stone-500">
                        {table.schema}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="text-sm text-stone-300 font-mono">
                        {table.rowCount.toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-6 text-xs text-stone-600 text-center">
        {tables.length} tables · {totalRows.toLocaleString()} total rows · Auto-refreshes every 5m
      </div>
    </div>
  );
}
