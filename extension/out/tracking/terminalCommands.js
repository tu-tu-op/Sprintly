"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emptyTerminalCommandCounts = emptyTerminalCommandCounts;
exports.classifyTerminalCommand = classifyTerminalCommand;
function emptyTerminalCommandCounts() {
    return {
        build: 0,
        test: 0,
        'package-manager': 0,
        git: 0,
        'dev-server': 0,
        lint: 0,
        formatter: 0,
        deployment: 0,
        other: 0,
    };
}
function classifyTerminalCommand(commandLine) {
    const command = (commandLine ?? '').trim().toLowerCase();
    if (!command)
        return 'other';
    if (/\bgit(?:\.exe)?\b/.test(command))
        return 'git';
    if (/\b(?:npm|pnpm|yarn|bun)\s+(?:test|run\s+test|exec\s+(?:jest|vitest|mocha))\b/.test(command)
        || /\b(?:pytest|vitest|jest|mocha|cargo\s+test|go\s+test|dotnet\s+test)\b/.test(command)) {
        return 'test';
    }
    if (/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:build|compile|bundle)\b/.test(command)
        || /\b(?:tsc|webpack|esbuild|vite\s+build|cargo\s+build|go\s+build|dotnet\s+build|mvn\s+(?:package|compile)|gradle\s+build)\b/.test(command)) {
        return 'build';
    }
    if (/\b(?:npm|pnpm|yarn|bun)\s+(?:install|i|ci|add|remove|uninstall|update|upgrade)\b/.test(command)) {
        return 'package-manager';
    }
    if (/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|start|serve)\b/.test(command)
        || /\b(?:vite|next|webpack-dev-server)\s+(?:dev|serve|start)\b/.test(command)) {
        return 'dev-server';
    }
    if (/\b(?:eslint|stylelint|biome|ruff|flake8|pylint|golangci-lint)\b/.test(command))
        return 'lint';
    if (/\b(?:prettier|rustfmt|gofmt|black|biome\s+format)\b/.test(command))
        return 'formatter';
    if (/\b(?:deploy|vercel|netlify|railway|flyctl|heroku)\b/.test(command))
        return 'deployment';
    return 'other';
}
//# sourceMappingURL=terminalCommands.js.map