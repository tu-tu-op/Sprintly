/**
 * The website uses a vscode:// deep link for the automatic pairing path.
 * Keep parsing separate from VS Code so the security boundary is easy to test:
 * the URI carries a short-lived code only, never a device token.
 */
export interface SprintlyConnectionUri {
  scheme: string;
  authority: string;
  path: string;
  query: string;
}

export interface SprintlyPairingIntent {
  code: string;
  apiUrl?: string;
}

export const SPRINTLY_EXTENSION_ID = 'tu-tu-op.sprintly';

export function parseSprintlyPairingIntent(
  uri: SprintlyConnectionUri,
  extensionId = SPRINTLY_EXTENSION_ID,
): SprintlyPairingIntent | null {
  const isVSCodeScheme = uri.scheme === 'vscode' || uri.scheme === 'vscode-insiders';
  if (
    !isVSCodeScheme
    || uri.authority.toLowerCase() !== extensionId.toLowerCase()
    || uri.path !== '/connect'
  ) {
    return null;
  }

  const parameters = new URLSearchParams(uri.query);
  const code = parameters.get('code')?.trim();
  if (!code || code.length > 256) return null;

  const apiValue = parameters.get('api')?.trim();
  if (!apiValue) return { code };

  try {
    const api = new URL(apiValue);
    if (api.protocol !== 'http:' && api.protocol !== 'https:') return null;
    api.search = '';
    api.hash = '';
    return { code, apiUrl: api.toString().replace(/\/$/, '') };
  } catch {
    return null;
  }
}
