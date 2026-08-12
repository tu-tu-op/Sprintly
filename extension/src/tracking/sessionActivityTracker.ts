import * as vscode from 'vscode';
import { CodingCategory, DailyStateStore } from './dailyStateStore';

export const SESSION_GAP_MS = 900_000;
const HEARTBEAT_INTERVAL_MS = 120_000;

interface Heartbeat {
  uri: string;
  time: number;
  category: CodingCategory;
}

export class SessionActivityTracker implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly lastHeartbeats = new Map<string, Heartbeat>();
  private readonly lastEditCategories = new Map<string, CodingCategory>();
  private readonly forceNextHeartbeat = new Set<string>();
  private lastSessionHeartbeat: Heartbeat | undefined;
  private lifecycleKey: string;

  constructor(private readonly store: DailyStateStore) {
    this.lifecycleKey = getLifecycleKey(store);
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (!this.store.isCapturing()) {
          return;
        }
        const uri = event.document.uri.toString();
        for (const change of event.contentChanges) {
          if (change.text === '' && change.rangeLength > 0) {
            this.recordNeutralEdit(uri);
            continue;
          }
          const category = classifyChange(change.text);
          this.lastEditCategories.set(uri, category);
          this.recordTextHeartbeat(uri, category, Date.now());
        }
      }),
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (!this.store.isCapturing()) {
          return;
        }
        this.recordForcedHeartbeat(document.uri.toString(), Date.now());
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && this.store.isCapturing()) {
          this.recordForcedHeartbeat(editor.document.uri.toString(), Date.now());
        }
      }),
      this.store.onDidUpdate(() => this.handleSessionLifecycleChange()),
    );
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private recordNeutralEdit(uri: string): void {
    this.lastEditCategories.delete(uri);
    this.forceNextHeartbeat.add(uri);
    if (this.lastSessionHeartbeat?.uri === uri) {
      this.lastSessionHeartbeat = undefined;
    }
  }

  private recordTextHeartbeat(uri: string, category: CodingCategory, now: number): void {
    const previous = this.lastHeartbeats.get(uri);
    const shouldHeartbeat = !previous
      || this.forceNextHeartbeat.has(uri)
      || now - previous.time >= HEARTBEAT_INTERVAL_MS
      || previous.category !== category;
    if (!shouldHeartbeat) {
      return;
    }
    this.forceNextHeartbeat.delete(uri);
    this.commitHeartbeat({ uri, time: now, category });
  }

  private recordForcedHeartbeat(uri: string, now: number): void {
    const previous = this.lastHeartbeats.get(uri);
    // ASSUMPTION: a save or first activation without a classified edit is hardcode,
    // because the required heartbeat must carry one of the two duration categories.
    const category = this.lastEditCategories.get(uri) ?? previous?.category ?? 'hardcode';
    this.forceNextHeartbeat.delete(uri);
    this.commitHeartbeat({ uri, time: now, category });
  }

  private commitHeartbeat(heartbeat: Heartbeat): void {
    if (!this.store.isCapturing(heartbeat.time)) {
      return;
    }
    const previous = this.lastSessionHeartbeat;
    if (previous && previous.category === heartbeat.category) {
      const rawGap = heartbeat.time - previous.time;
      if (rawGap >= 0 && rawGap <= SESSION_GAP_MS) {
        this.store.addSessionDuration(heartbeat.category, rawGap, heartbeat.time);
      }
    }
    this.lastHeartbeats.set(heartbeat.uri, heartbeat);
    this.lastSessionHeartbeat = heartbeat;
  }

  private handleSessionLifecycleChange(): void {
    const nextLifecycleKey = getLifecycleKey(this.store);
    if (nextLifecycleKey === this.lifecycleKey) {
      return;
    }
    this.lifecycleKey = nextLifecycleKey;
    this.lastHeartbeats.clear();
    this.lastEditCategories.clear();
    this.forceNextHeartbeat.clear();
    this.lastSessionHeartbeat = undefined;
  }
}

export function classifyChange(text: string): CodingCategory {
  const newlineCount = text.match(/\n/g)?.length ?? 0;
  return text.length >= 50 || newlineCount >= 2 ? 'vibecode' : 'hardcode';
}

function getLifecycleKey(store: DailyStateStore): string {
  const session = store.get().session;
  return `${session.id ?? ''}:${session.isActive}:${session.isPaused}`;
}
