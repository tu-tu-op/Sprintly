const STORED_CONSENT_KEY = 'devStrava.storedConsentStatus';
const SESSION_SUMMARIES_KEY = 'devStrava.sessionSummaries';
const MAX_LOCAL_SUMMARIES = 25;

class SessionStore {
  /**
   * @param {import('vscode').Memento} globalState
   */
  constructor(globalState) {
    this.globalState = globalState;
  }

  async getStoredConsentStatus() {
    return this.globalState.get(STORED_CONSENT_KEY, 'unknown');
  }

  async setStoredConsentStatus(status) {
    await this.globalState.update(STORED_CONSENT_KEY, status);
  }

  async addSessionSummary(summary) {
    const summaries = this.globalState.get(SESSION_SUMMARIES_KEY, []);
    const nextSummaries = [summary, ...summaries].slice(0, MAX_LOCAL_SUMMARIES);
    await this.globalState.update(SESSION_SUMMARIES_KEY, nextSummaries);
  }

  async getSessionSummaries() {
    return this.globalState.get(SESSION_SUMMARIES_KEY, []);
  }
}

module.exports = {
  SessionStore
};
