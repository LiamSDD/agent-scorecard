"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Run } from "@/lib/transcript/types";

export type StoredRun = { id: string; fileName: string; run: Run; addedAt: number };

type RunStore = {
  runs: StoredRun[];
  addRun: (run: Run, fileName: string) => void;
  getRun: (id: string) => StoredRun | undefined;
  removeRun: (id: string) => void;
};

const RunStoreContext = createContext<RunStore | null>(null);

export function RunStoreProvider({ children, initialRuns = [] }: { children: ReactNode; initialRuns?: StoredRun[] }) {
  const [runs, setRuns] = useState<StoredRun[]>(initialRuns);

  const addRun = useCallback((run: Run, fileName: string) => {
    setRuns((current) => [...current.filter((item) => item.id !== run.id), { id: run.id, fileName, run, addedAt: Date.now() }]);
  }, []);

  const removeRun = useCallback((id: string) => {
    setRuns((current) => current.filter((item) => item.id !== id));
  }, []);

  const getRun = useCallback((id: string) => runs.find((item) => item.id === id), [runs]);

  const value = useMemo(() => ({ runs, addRun, getRun, removeRun }), [runs, addRun, getRun, removeRun]);
  return <RunStoreContext.Provider value={value}>{children}</RunStoreContext.Provider>;
}

export function useRunStore(): RunStore {
  const store = useContext(RunStoreContext);
  if (!store) throw new Error("useRunStore must be used inside RunStoreProvider");
  return store;
}
