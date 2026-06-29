import * as vscode from 'vscode';
import { CodingCategory, DailyStateStore, localDayBounds } from './dailyStateStore';

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

  constructor(private readonly store: DailyStateStore) {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
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
        this.recordForcedHeartbeat(document.uri.toString(), Date.now());
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          this.recordForcedHeartbeat(editor.document.uri.toString(), Date.now());
        }
      }),
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
    const previous = this.lastSessionHeartbeat;
    if (previous && previous.category === heartbeat.category) {
      const rawGap = heartbeat.time - previous.time;
      if (rawGap >= 0 && rawGap <= SESSION_GAP_MS) {
        const durationToday = heartbeat.time - Math.max(previous.time, localDayBounds().start);
        this.store.addSessionDuration(heartbeat.category, durationToday);
      }
    }
    this.lastHeartbeats.set(heartbeat.uri, heartbeat);
    this.lastSessionHeartbeat = heartbeat;
  }
}

export function classifyChange(text: string): CodingCategory {
  const newlineCount = text.match(/\n/g)?.length ?? 0;
  return text.length >= 50 || newlineCount >= 2 ? 'vibecode' : 'hardcode';
}
