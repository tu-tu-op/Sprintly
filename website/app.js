const sessions = [
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
  document.getElementById('historyCount').textContent = `${data.length} sessions`;
  document.getElementById('historyList').innerHTML = data.map((session) => {
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
  const rows = leaderboard
    .filter((entry) => region === 'Global' || entry.region === region)
    .sort((a, b) => b.score - a.score);

  document.getElementById('leaderboardList').innerHTML = rows.map((entry, index) => {
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
  if (activeRange === 'week') {
    return sessions;
  }

  if (activeRange === 'month') {
    return [...sessions, ...sessions.slice(0, 5).map((session, index) => ({
      ...session,
      date: `Apr ${18 - index}`,
      minutes: Math.max(35, session.minutes - 18)
    }))];
  }

  return [...sessions, ...sessions, ...sessions].map((session, index) => ({
    ...session,
    date: index < 10 ? session.date : `Mar ${28 - (index % 12)}`
  }));
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
