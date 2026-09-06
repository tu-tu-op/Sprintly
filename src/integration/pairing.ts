export interface PairingExchangeRequest {
  code: string;
}

export interface PairingExchangeResponse {
  ok: true;
  deviceToken: string;
  expiresAt?: string;
}

export interface SprintlyPairingAdapter {
  exchangeCode(request: PairingExchangeRequest): Promise<PairingExchangeResponse>;
}

/**
 * The website has not published a pairing endpoint yet. Keeping this default
 * adapter explicit prevents the extension from inventing a network protocol.
 */
export class UnavailablePairingAdapter implements SprintlyPairingAdapter {
  async exchangeCode(_request: PairingExchangeRequest): Promise<PairingExchangeResponse> {
    throw new Error(
      'Sprintly website pairing is not available yet. Use a development token or configure a pairing adapter.',
    );
  }
}

/** Useful for the future website implementation and deterministic extension tests. */
export class DelegatingPairingAdapter implements SprintlyPairingAdapter {
  constructor(
    private readonly exchange: (request: PairingExchangeRequest) => Promise<PairingExchangeResponse>,
  ) {}

  exchangeCode(request: PairingExchangeRequest): Promise<PairingExchangeResponse> {
    return this.exchange(request);
  }
}
