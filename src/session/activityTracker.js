const crypto = require('crypto');
const vscode = require('vscode');

class ActivityTracker {
  /**
   * @param {import('./sessionManager').SessionManager} sessionManager
   */
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
    this.disposables = [];
  }

  start() {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.scheme !== 'file') {
          return;
        }

        this.sessionManager.recordEditorEdit({
          fileKey: hashValue(event.document.uri.toString()),
          languageId: event.document.languageId,
          changeCount: event.contentChanges.length,
          isUndoRedo: typeof event.reason === 'number'
        });
      }),
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (document.uri.scheme !== 'file') {
          return;
        }

        this.sessionManager.recordSave({
          fileKey: hashValue(document.uri.toString()),
          languageId: document.languageId
        });
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (!editor || editor.document.uri.scheme !== 'file') {
          return;
        }

        this.sessionManager.recordFileSwitch({
          fileKey: hashValue(editor.document.uri.toString()),
          languageId: editor.document.languageId
        });
      }),
      vscode.debug.onDidStartDebugSession(() => {
        this.sessionManager.recordDebugSession();
      })
    );

    if (vscode.tasks && typeof vscode.tasks.onDidEndTaskProcess === 'function') {
      this.disposables.push(vscode.tasks.onDidEndTaskProcess((event) => {
        if (event.exitCode === 0) {
          return;
        }

        const taskName = `${event.execution.task.name} ${event.execution.task.source}`.toLowerCase();
        this.sessionManager.recordFailedRun({
          isTestFailure: taskName.includes('test') || taskName.includes('spec') || taskName.includes('jest') || taskName.includes('vitest')
        });
      }));
    }

    if (typeof vscode.window.onDidStartTerminalShellExecution === 'function') {
      this.disposables.push(
        vscode.window.onDidStartTerminalShellExecution(() => {
          this.sessionManager.recordTerminalCommand();
        })
      );
    }

    if (typeof vscode.window.onDidEndTerminalShellExecution === 'function') {
      this.disposables.push(
        vscode.window.onDidEndTerminalShellExecution((event) => {
          if (event.exitCode && event.exitCode !== 0) {
            this.sessionManager.recordTerminalFailure();
          }
        })
      );
    }
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }

    this.disposables = [];
  }
}

function hashValue(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

module.exports = {
  ActivityTracker
};
