"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SprintlyViewProvider = void 0;
const vscode = require("vscode");
const crypto = require("crypto");
const webviewHtml_1 = require("./webviewHtml");
const consentFlow_1 = require("./consentFlow");
class SprintlyViewProvider {
    constructor(tracker, context, callbacks) {
        this._tracker = tracker;
        this._context = context;
        this._onStart = callbacks.onStart;
        this._onPause = callbacks.onPause;
        this._onResume = callbacks.onResume;
        this._onStop = callbacks.onStop;
        this._onReset = callbacks.onReset;
        // Push state updates to the webview whenever tracker fires
        tracker.onDidChangeState(() => this.postState(), null, context.subscriptions);
    }
    // ──────────────────────────────────────────────────────────────────────────
    // WebviewViewProvider contract
    // ──────────────────────────────────────────────────────────────────────────
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [],
        };
        const nonce = crypto.randomBytes(16).toString('hex');
        webviewView.webview.html = (0, webviewHtml_1.getWebviewHtml)(webviewView.webview, nonce);
        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage((msg) => this._handleMessage(msg), null, this._context.subscriptions);
        // Clean up reference when view is disposed
        webviewView.onDidDispose(() => {
            this._view = undefined;
        }, null, this._context.subscriptions);
    }
    // ──────────────────────────────────────────────────────────────────────────
    // Public API
    // ──────────────────────────────────────────────────────────────────────────
    /** Focus/reveal the docked panel. */
    reveal() {
        if (this._view) {
            this._view.show(true);
        }
        else {
            vscode.commands.executeCommand(`${SprintlyViewProvider.viewId}.focus`);
        }
    }
    /** Push the current tracker snapshot to the webview. */
    postState() {
        if (!this._view)
            return;
        const consent = (0, consentFlow_1.hasConsent)(this._context);
        const state = this._tracker.getSnapshot(consent);
        const msg = { type: 'stateUpdate', state };
        this._view.webview.postMessage(msg);
    }
    // ──────────────────────────────────────────────────────────────────────────
    // Message handler
    // ──────────────────────────────────────────────────────────────────────────
    _handleMessage(msg) {
        switch (msg.type) {
            case 'ready':
            case 'requestState':
                this.postState();
                break;
            case 'start':
                (0, consentFlow_1.runConsentFlow)(this._context, () => {
                    this._onStart?.();
                    this.postState();
                });
                break;
            case 'pause':
                this._onPause?.();
                this.postState();
                break;
            case 'resume':
                this._onResume?.();
                this.postState();
                break;
            case 'stop':
                this._onStop?.();
                this.postState();
                break;
            case 'reset':
                this._onReset?.();
                this.postState();
                break;
            case 'openSettings':
                vscode.commands.executeCommand('workbench.action.openSettings', 'sprintly');
                break;
        }
    }
}
exports.SprintlyViewProvider = SprintlyViewProvider;
SprintlyViewProvider.viewId = 'sprintly.dashboard';
//# sourceMappingURL=sprintlyViewProvider.js.map