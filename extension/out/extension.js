"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const sessionTracker_1 = require("./sessionTracker");
const statusBar_1 = require("./statusBar");
const commands_1 = require("./commands");
const consentFlow_1 = require("./consentFlow");
function activate(context) {
    const tracker = new sessionTracker_1.SessionTracker();
    const statusBar = new statusBar_1.SprintlyStatusBar(tracker, context);
    context.subscriptions.push(tracker, statusBar);
    (0, commands_1.registerCommands)(context, tracker, statusBar);
    // Startup consent — never auto-starts
    (0, consentFlow_1.runConsentFlow)(context, () => {
        tracker.start();
        statusBar.update();
        vscode.window.showInformationMessage('🏃 Sprintly — Recording started!');
    });
}
function deactivate() { }
//# sourceMappingURL=extension.js.map