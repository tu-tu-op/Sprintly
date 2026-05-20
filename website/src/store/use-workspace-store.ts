"use client";

import { create } from "zustand";

import { mockTasks } from "@/mock";
import type { Task, TaskSortMode, WorkspaceFilters, WorkspaceViewMode } from "@/types";

interface WorkspaceState {
  tasks: Task[];
  filters: WorkspaceFilters;
  sortMode: TaskSortMode;
  viewMode: WorkspaceViewMode;
  setTasks: (tasks: Task[]) => void;
  setFilters: (filters: Partial<WorkspaceFilters>) => void;
  setSortMode: (sortMode: TaskSortMode) => void;
  setViewMode: (viewMode: WorkspaceViewMode) => void;
}

const defaultFilters: WorkspaceFilters = {
  query: "",
  statuses: [],
  priorities: [],
  tags: [],
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  tasks: mockTasks,
  filters: defaultFilters,
  sortMode: "priority",
  viewMode: "board",
  setTasks: (tasks) => set({ tasks }),
  setFilters: (filters) =>
    set((state) => ({
      filters: {
        ...state.filters,
        ...filters,
      },
    })),
  setSortMode: (sortMode) => set({ sortMode }),
  setViewMode: (viewMode) => set({ viewMode }),
}));
