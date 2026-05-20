export type TaskStatus = "backlog" | "ready" | "in_progress" | "review" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskSortMode = "priority" | "due_date" | "created_at" | "updated_at";
export type WorkspaceViewMode = "board" | "list";

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  assigneeId?: string;
  estimateMinutes?: number;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceFilters {
  query: string;
  statuses: TaskStatus[];
  priorities: TaskPriority[];
  tags: string[];
}
