const demoSessions = [
  { date: 'Apr 25', minutes: 142, edits: 386, saves: 29, style: 'Deep Work Sprinter', hardcore: 84, vibecoding: 42, debugging: 36, rhythm: 78, region: 'India' },
  { date: 'Apr 24', minutes: 88, edits: 210, saves: 18, style: 'Steady Builder', hardcore: 66, vibecoding: 34, debugging: 28, rhythm: 83, region: 'India' },
  { date: 'Apr 23', minutes: 115, edits: 288, saves: 21, style: 'Bug Hunter', hardcore: 72, vibecoding: 45, debugging: 82, rhythm: 61, region: 'India' },
  { date: 'Apr 22', minutes: 64, edits: 120, saves: 9, style: 'Vibecoder', hardcore: 45, vibecoding: 78, debugging: 31, rhythm: 48, region: 'India' },
  { date: 'Apr 21', minutes: 96, edits: 244, saves: 15, style: 'Deep Work Sprinter', hardcore: 79, vibecoding: 39, debugging: 34, rhythm: 70, region: 'India' },
  { date: 'Apr 20', minutes: 52, edits: 104, saves: 7, style: 'Warming Up', hardcore: 41, vibecoding: 25, debugging: 22, rhythm: 43, region: 'India' },
  { date: 'Apr 19', minutes: 131, edits: 351, saves: 31, style: 'Steady Builder', hardcore: 76, vibecoding: 38, debugging: 41, rhythm: 88, region: 'India' }
];

const leaderboard = [
  { name: 'Ava Chen', region: 'India', score: 884, style: 'Deep Work Sprinter' },
  { name: 'Rohan Mehta', region: 'India', score: 861, style: 'Bug Hunter' },
  { name: 'Mira Shah', region: 'India', score: 832, style: 'Steady Builder' },
  { name: 'Nia Brooks', region: 'United States', score: 818, style: 'Vibecoder' },
  { name: 'Mateo Ruiz', region: 'Europe', score: 806, style: 'Deep Work Sprinter' },
  { name: 'Jon Bell', region: 'United States', score: 790, style: 'Bug Hunter' },
  { name: 'Elsa Weber', region: 'Europe', score: 771, style: 'Steady Builder' }
];

const shareOptions = [
  { id: 'hardcore', label: 'Hardcore score', enabled: true },
  { id: 'vibecoding', label: 'Vibecoding score', enabled: true },
  { id: 'debugging', label: 'Debugging intensity', enabled: false },
  { id: 'rhythm', label: 'Productivity rhythm', enabled: true },
  { id: 'streak', label: 'Current streak', enabled: false }
];

let activeRange = 'week';
let activeView = 'dashboard';
let importedSessions = null;
let importedLeaderboard = null;

const rangeButtons = document.querySelectorAll('.range-button');
const navTabs = document.querySelectorAll('.nav-tab');
const viewTitle = document.getElementById('viewTitle');

rangeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    activeRange = button.dataset.range;
    setActiveButton(rangeButtons, button);
    renderDashboard();
    renderHistory();
    renderShareCard();
  });
});

navTabs.forEach((button) => {
  button.addEventListener('click', () => {
    activeView = button.dataset.view;
    setActiveButton(navTabs, button);
    document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === activeView));
    viewTitle.textContent = toTitle(activeView);
  });
});

document.getElementById('regionSelect').addEventListener('change', renderLeaderboard);
document.getElementById('devstravaImport').addEventListener('change', handleDevStravaImport);
document.getElementById('generateCard').addEventListener('click', () => {
  document.getElementById('shareNote').textContent = 'Public card generated from the selected summary stats.';
});
document.getElementById('publicProfileToggle').addEventListener('change', (event) => {
  document.getElementById('profileStatus').textContent = event.target.checked ? 'Public' : 'Private';
});

renderDashboard();
renderHistory();
renderShareControls();
renderShareCard();
renderLeaderboard();

function renderDashboard() {
  const data = getRangeData();
  const totals = summarize(data);
  const metricGrid = document.getElementById('metricGrid');
  metricGrid.innerHTML = [
    ['Coding time', `${totals.minutes}m`],
    ['Sessions', data.length],
    ['Total edits', totals.edits],
    ['Save rhythm', `${totals.saves} saves`]
  ].map(([label, value]) => `<article class="metric-card"><span>${label}</span><strong>${value}</strong></article>`).join('');

  document.getElementById('rhythmLabel').textContent = `${Math.round(totals.minutes / Math.max(1, data.length))}m average`;
  document.getElementById('styleLabel').textContent = totals.style;
  renderBars(data);
  renderMeters(totals);
}

function renderBars(data) {
  const maxMinutes = Math.max(...data.map((session) => session.minutes));
  document.getElementById('barChart').innerHTML = data.map((session) => {
    const height = Math.max(8, Math.round((session.minutes / maxMinutes) * 190));
    return `<div class="bar">
      <div class="bar-fill" style="height: ${height}px" title="${session.minutes} minutes"></div>
      <span class="bar-label">${session.date.replace('Apr ', '')}</span>
    </div>`;
  }).join('');
}

function renderMeters(totals) {
  const meters = [
    ['Hardcore', totals.hardcore],
    ['Vibecoding', totals.vibecoding],
    ['Debugging', totals.debugging],
    ['Rhythm', totals.rhythm]
  ];

  document.getElementById('styleMeters').innerHTML = meters.map(([label, value]) => {
    return `<div class="meter-row">
      <span>${label}</span>
      <div class="meter-track"><span style="width: ${value}%"></span></div>
      <strong>${value}%</strong>
    </div>`;
  }).join('');
}

function renderHistory() {
  const data = getRangeData();
  const safeData = data.map((session) => ({
    ...session,
    date: escapeHtml(session.date),
    style: escapeHtml(session.style)
  }));
  document.getElementById('historyCount').textContent = `${safeData.length} sessions`;
  document.getElementById('historyList').innerHTML = safeData.map((session) => {
    return `<article class="history-item">
      <div>
        <strong>${session.date} · ${session.style}</strong>
        <span>${session.minutes} minutes · ${session.edits} edits · ${session.saves} saves</span>
      </div>
      <strong>${session.hardcore}%</strong>
    </article>`;
  }).join('');
}

function renderShareControls() {
  document.getElementById('shareToggles').innerHTML = shareOptions.map((option) => {
    return `<label class="toggle-row">
      <span>${option.label}</span>
      <input type="checkbox" data-share-option="${option.id}" ${option.enabled ? 'checked' : ''} />
    </label>`;
  }).join('');

  document.querySelectorAll('[data-share-option]').forEach((input) => {
    input.addEventListener('change', () => {
      const option = shareOptions.find((item) => item.id === input.dataset.shareOption);
      option.enabled = input.checked;
      renderShareCard();
    });
  });
}

function renderShareCard() {
  const totals = summarize(getRangeData());
  document.getElementById('shareTitle').textContent = totals.style;
  document.getElementById('shareScore').textContent = `${totals.hardcore}%`;
  const lines = [
    ['hardcore', `${totals.hardcore}% hardcore`],
    ['vibecoding', `${totals.vibecoding}% vibecoding`],
    ['debugging', `${totals.debugging}% debugging`],
    ['rhythm', `${totals.rhythm}% rhythm`],
    ['streak', '6 day streak']
  ].filter(([id]) => shareOptions.find((option) => option.id === id && option.enabled));

  document.getElementById('shareLines').innerHTML = lines.map(([, label]) => `<span>${label}</span>`).join('');
}

function renderLeaderboard() {
  const region = document.getElementById('regionSelect').value;
  const source = importedLeaderboard
    ? [{
      name: 'Imported local aggregate',
      region: importedLeaderboard.region || 'Global',
      score: importedLeaderboard.devScore,
      style: `${importedLeaderboard.sessions} sessions · ${importedLeaderboard.activeMinutes} active minutes`
    }]
    : leaderboard;
  const rows = source
    .filter((entry) => region === 'Global' || entry.region === region)
    .sort((a, b) => b.score - a.score);

  const safeRows = rows.map((entry) => ({
    ...entry,
    name: escapeHtml(entry.name),
    region: escapeHtml(entry.region),
    style: escapeHtml(entry.style)
  }));
  document.getElementById('leaderboardList').innerHTML = safeRows.map((entry, index) => {
    return `<article class="leaderboard-row">
      <div>
        <strong>#${index + 1} ${entry.name}</strong>
        <span>${entry.region} · ${entry.style}</span>
      </div>
      <strong>${entry.score}</strong>
    </article>`;
  }).join('');
}

function getRangeData() {
  if (importedSessions) {
    return importedSessions;
  }
  if (activeRange === 'week') {
    return demoSessions;
  }

  if (activeRange === 'month') {
    return [...demoSessions, ...demoSessions.slice(0, 5).map((session, index) => ({
      ...session,
      date: `Apr ${18 - index}`,
      minutes: Math.max(35, session.minutes - 18)
    }))];
  }

  return [...demoSessions, ...demoSessions, ...demoSessions].map((session, index) => ({
    ...session,
    date: index < 10 ? session.date : `Mar ${28 - (index % 12)}`
  }));
}

async function handleDevStravaImport(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const status = document.getElementById('importStatus');
  try {
    const parsed = JSON.parse(await file.text());
    if (parsed && parsed.payloadType === 'leaderboard.aggregate.v1') {
      importedLeaderboard = validateLeaderboardPayload(parsed);
      importedSessions = null;
      status.textContent = `Imported aggregate leaderboard packet for ${importedLeaderboard.week}; nothing was uploaded.`;
      renderLeaderboard();
      return;
    }
    const contracts = extractSessionContracts(parsed);
    importedLeaderboard = null;
    importedSessions = contracts.map(toWebsiteSession);
    status.textContent = `Imported ${importedSessions.length} aggregate session${importedSessions.length === 1 ? '' : 's'} locally; nothing was uploaded.`;
    renderDashboard();
    renderHistory();
    renderShareCard();
    renderLeaderboard();
  } catch (error) {
    importedSessions = null;
    importedLeaderboard = null;
    status.textContent = error instanceof Error ? `Import rejected: ${error.message}` : 'Import rejected: invalid DevStrava JSON.';
  } finally {
    event.target.value = '';
  }
}

function extractSessionContracts(payload) {
  if (!payload || payload.schemaVersion !== 'devstrava.session.v1') {
    throw new Error('Expected schemaVersion devstrava.session.v1.');
  }
  if (payload.payloadType === 'session.share.v1') {
    return validateSessionContracts([payload.session]);
  }
  if (Array.isArray(payload.sessions)) {
    return validateSessionContracts(payload.sessions);
  }
  throw new Error('No session aggregate was found in this handoff.');
}

function validateLeaderboardPayload(payload) {
  if (payload.schemaVersion !== 'devstrava.session.v1'
    || typeof payload.week !== 'string'
    || typeof payload.sessions !== 'number'
    || typeof payload.activeMinutes !== 'number'
    || typeof payload.focusScore !== 'number'
    || typeof payload.recoveryScore !== 'number'
    || typeof payload.devScore !== 'number'
    || typeof payload.streak !== 'number') {
    throw new Error('The leaderboard packet is malformed.');
  }
  return payload;
}

function validateSessionContracts(values) {
  if (!values.length) throw new Error('The handoff contains no completed sessions.');
  return values.map((value) => {
    if (!value || typeof value !== 'object'
      || typeof value.sessionId !== 'string'
      || !value.coding || !value.activity || !value.scores
      || !value.archetype || typeof value.archetype.primaryArchetype !== 'string') {
      throw new Error('A session record is malformed.');
    }
    return value;
  });
}

function toWebsiteSession(session) {
  const coding = session.coding;
  const reliability = session.reliability || {};
  const scores = session.scores;
  const ended = new Date(session.endedAt);
  return {
    date: Number.isNaN(ended.getTime()) ? 'Imported' : ended.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    minutes: Math.round(Number(session.activeDurationSeconds) / 60),
    edits: Number(session.activity.edits) || 0,
    saves: Number(session.activity.saves) || 0,
    style: session.archetype.primaryArchetype,
    hardcore: Number(scores.focus) || 0,
    vibecoding: Number(coding.aiAssistedPercent) || 0,
    debugging: Math.min(100, (Number(reliability.failures) || 0) * 20),
    rhythm: Number(scores.consistency) || 0,
    region: 'Local'
  };
}

function summarize(data) {
  const totals = data.reduce((accumulator, session) => {
    accumulator.minutes += session.minutes;
    accumulator.edits += session.edits;
    accumulator.saves += session.saves;
    accumulator.hardcore += session.hardcore;
    accumulator.vibecoding += session.vibecoding;
    accumulator.debugging += session.debugging;
    accumulator.rhythm += session.rhythm;
    return accumulator;
  }, { minutes: 0, edits: 0, saves: 0, hardcore: 0, vibecoding: 0, debugging: 0, rhythm: 0 });

  const count = Math.max(1, data.length);
  const averaged = {
    ...totals,
    hardcore: Math.round(totals.hardcore / count),
    vibecoding: Math.round(totals.vibecoding / count),
    debugging: Math.round(totals.debugging / count),
    rhythm: Math.round(totals.rhythm / count)
  };

  averaged.style = pickStyle(averaged);
  return averaged;
}

function pickStyle(totals) {
  const scores = [
    ['Deep Work Sprinter', totals.hardcore],
    ['Vibecoder', totals.vibecoding],
    ['Bug Hunter', totals.debugging],
    ['Steady Builder', totals.rhythm]
  ];

  return scores.sort((a, b) => b[1] - a[1])[0][0];
}

function setActiveButton(buttons, activeButton) {
  buttons.forEach((button) => button.classList.toggle('active', button === activeButton));
}

function toTitle(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>\'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[character]));
}
