/* ============================================================
   PrawnTrade — Frontend Application (vanilla JS SPA)
   ============================================================ */

const API_BASE = '/api';

const state = {
  token: localStorage.getItem('pt_token') || null,
  user: JSON.parse(localStorage.getItem('pt_user') || 'null'),
  view: 'dashboard',
  farmersCache: [],
  exportersCache: [],
  txFilters: { page: 1, limit: 15 },
};

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { key: 'transactions', label: 'Transactions', icon: '📋' },
  { key: 'farmers', label: 'Farmers', icon: '👨‍🌾' },
  { key: 'exporters', label: 'Exporter Companies', icon: '🏢' },
  { key: 'countRates', label: 'Count Rates', icon: '📈' },
  { key: 'reports', label: 'Reports', icon: '📊' },
];

/* ----------------------------- helpers ----------------------------- */

function money(n) {
  const v = Number(n || 0);
  return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
function moneyPrecise(n) {
  const v = Number(n || 0);
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function kg(n) {
  return Number(n || 0).toLocaleString('en-IN') + ' KG';
}
function fmtDate(d) {
  if (!d) return '-';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function toInputDate(d) {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}
function todayInput() {
  return new Date().toISOString().slice(0, 10);
}
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function billBadge(status) {
  const map = {
    OPEN: ['badge-open', 'Open'],
    PARTIALLY_CLOSED: ['badge-partial', 'Partially Closed'],
    CLOSED: ['badge-closed', 'Closed'],
  };
  const [cls, label] = map[status] || ['badge-open', status];
  return `<span class="badge ${cls}">${label}</span>`;
}
function payBadge(status) {
  const map = {
    PENDING: ['badge-pending', 'Pending'],
    PARTIALLY_PAID: ['badge-partial-pay', 'Partial'],
    PAID: ['badge-paid', 'Paid'],
  };
  const [cls, label] = map[status] || ['badge-pending', status];
  return `<span class="badge ${cls}">${label}</span>`;
}

function toast(message, type = 'success') {
  const root = document.getElementById('toastRoot');
  const colors = {
    success: 'bg-teal-700',
    error: 'bg-coral-600',
    info: 'bg-ink-700',
  };
  const el = document.createElement('div');
  el.className = `${colors[type] || colors.info} text-white text-sm font-medium px-4 py-3 rounded-xl shadow-pop pop-in flex items-center gap-2`;
  el.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️'}</span><span>${escapeHtml(message)}</span>`;
  root.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3200);
}

/* ------------------------------- API -------------------------------- */

async function api(path, { method = 'GET', body, isBlob = false, query } = {}) {
  let url = API_BASE + path;
  if (query) {
    const params = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== '' && v !== null));
    const qs = params.toString();
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }
  const headers = {};
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  if (body) headers['Content-Type'] = 'application/json';

  const resp = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });

  if (resp.status === 401 || resp.status === 403) {
    if (path !== '/auth/login') {
      logout();
      throw new Error('Session expired. Please log in again.');
    }
  }

  if (isBlob) {
    if (!resp.ok) throw new Error('Download failed.');
    return resp.blob();
  }

  let data;
  try { data = await resp.json(); } catch { data = {}; }
  if (!resp.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

async function downloadFile(path, query, filename) {
  try {
    const blob = await api(path, { isBlob: true, query });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ------------------------------ auth --------------------------------- */

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('pt_token');
  localStorage.removeItem('pt_user');
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errBox = document.getElementById('loginError');
  errBox.classList.add('hidden');
  try {
    const data = await api('/auth/login', { method: 'POST', body: { username, password } });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('pt_token', data.token);
    localStorage.setItem('pt_user', JSON.stringify(data.user));
    enterApp();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.remove('hidden');
  }
}

function enterApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  document.getElementById('sidebarUsername').textContent = state.user?.username || '';
  document.getElementById('mobileSidebarUsername').textContent = state.user?.username || '';
  renderNav();
  navigate('dashboard');
}

/* ------------------------------- nav ---------------------------------- */

function renderNav() {
  const build = (mobile) => NAV_ITEMS.map((item) => `
    <div class="nav-link ${state.view === item.key ? 'active' : ''}" data-nav="${item.key}" data-mobile="${mobile}">
      <span class="text-lg">${item.icon}</span><span>${item.label}</span>
    </div>`).join('');

  document.getElementById('sidebarNav').innerHTML = build(false);
  document.getElementById('mobileNav').innerHTML = build(true);

  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => {
      navigate(el.dataset.nav);
      document.getElementById('mobileNavPanel').classList.add('hidden');
    });
  });
}

function navigate(view) {
  state.view = view;
  renderNav();
  const container = document.getElementById('viewContainer');
  container.innerHTML = '<div class="py-24 text-center text-ink-400">Loading…</div>';
  const renderers = {
    dashboard: renderDashboard,
    transactions: renderTransactionsView,
    farmers: renderFarmersView,
    exporters: renderExportersView,
    countRates: renderCountRatesView,
    reports: renderReportsView,
  };
  (renderers[view] || renderDashboard)();
}

/* ------------------------------ modal ---------------------------------- */

function openModal(html, opts = {}) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-4 bg-ink-900/50 backdrop-blur-sm overflow-y-auto" id="modalOverlay">
      <div class="bg-white w-full ${opts.wide ? 'max-w-3xl' : 'max-w-lg'} sm:rounded-2xl shadow-pop pop-in min-h-screen sm:min-h-0 my-0 sm:my-8">
        ${html}
      </div>
    </div>`;
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') closeModal();
  });
}
function closeModal() {
  document.getElementById('modalRoot').innerHTML = '';
}

/* ------------------------------ init ------------------------------------ */

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('mobileLogoutBtn').addEventListener('click', logout);
  document.getElementById('mobileMenuBtn').addEventListener('click', () => {
    document.getElementById('mobileNavPanel').classList.toggle('hidden');
  });

  if (state.token && state.user) {
    enterApp();
  }
});

/* ============================================================
   DASHBOARD VIEW
   ============================================================ */

let charts = {};
let dashboardPeriod = 'month';

async function renderDashboard() {
  const container = document.getElementById('viewContainer');
  try {
    const data = await api('/dashboard', { query: { period: dashboardPeriod } });
    const s = data.summary;

    container.innerHTML = `
      <div class="fade-in">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 class="font-heading text-2xl font-800 text-ink-900" style="font-weight:800;">Business Dashboard</h1>
            <p class="text-ink-500 text-sm mt-0.5">Overview of your prawn purchase &amp; sales operations</p>
          </div>
          <div class="flex items-center gap-2">
            <select id="periodSelect" class="field-input !py-2 !text-sm w-auto">
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="year">This Year</option>
              <option value="all">All Time</option>
            </select>
            <button id="newTxBtnDash" class="btn-primary text-sm whitespace-nowrap">+ New Transaction</button>
          </div>
        </div>

        <div class="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
          ${statCard('Total Purchase', money(s.total_purchase), '🛒', '#0d9488')}
          ${statCard('Total Sales', money(s.total_sales), '📦', '#0f766e')}
          ${statCard('Total Commission', money(s.total_commission), '💰', '#f4623a')}
          ${statCard('Total Tonnage', kg(s.total_tonnage), '⚖️', '#14b8a6')}
          ${statCard('Open Bills', s.open_bills, '🟠', '#dd4a24')}
          ${statCard('Closed Bills', s.closed_bills, '🟢', '#0d9488')}
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div class="stat-card">
            <div class="text-xs uppercase tracking-wide text-ink-500 font-bold mb-1">Exporter Receivable</div>
            <div class="text-2xl font-800 text-coral-600" style="font-weight:800;">${money(s.exporter_receivable)}</div>
            <div class="text-xs text-ink-400 mt-1">Yet to receive from exporters</div>
          </div>
          <div class="stat-card">
            <div class="text-xs uppercase tracking-wide text-ink-500 font-bold mb-1">Farmer Payment Pending</div>
            <div class="text-2xl font-800 text-coral-600" style="font-weight:800;">${money(s.farmer_payment_pending)}</div>
            <div class="text-xs text-ink-400 mt-1">Yet to pay farmers</div>
          </div>
          <div class="stat-card">
            <div class="text-xs uppercase tracking-wide text-ink-500 font-bold mb-1">Partially Closed Bills</div>
            <div class="text-2xl font-800 text-teal-700" style="font-weight:800;">${s.partially_closed_bills}</div>
            <div class="text-xs text-ink-400 mt-1">One side paid, other pending</div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
          <div class="stat-card">
            <div class="font-heading font-700 text-sm text-ink-800 mb-3" style="font-weight:700;">Monthly Purchase vs Sales vs Commission</div>
            <canvas id="chartMonthly" height="200"></canvas>
          </div>
          <div class="stat-card">
            <div class="font-heading font-700 text-sm text-ink-800 mb-3" style="font-weight:700;">Count-wise Tonnage (pieces/kg)</div>
            <canvas id="chartCount" height="200"></canvas>
          </div>
          <div class="stat-card">
            <div class="font-heading font-700 text-sm text-ink-800 mb-3" style="font-weight:700;">Exporter-wise Sales</div>
            <canvas id="chartExporter" height="200"></canvas>
          </div>
          <div class="stat-card">
            <div class="font-heading font-700 text-sm text-ink-800 mb-3" style="font-weight:700;">Farmer-wise Purchase (Tonnage)</div>
            <canvas id="chartFarmer" height="200"></canvas>
          </div>
        </div>

        <div class="stat-card !p-0 overflow-hidden">
          <div class="px-5 py-4 border-b border-ink-100 flex items-center justify-between">
            <div class="font-heading font-700 text-sm text-ink-800" style="font-weight:700;">Recent Transactions</div>
            <button class="text-teal-700 text-xs font-semibold hover:underline" data-nav="transactions">View all →</button>
          </div>
          <div class="overflow-x-auto scroll-thin">
            <table class="data-table">
              <thead><tr><th>ID</th><th>Farmer</th><th>Count</th><th>KG</th><th>Exporter</th><th>Commission</th><th>Bill</th></tr></thead>
              <tbody>
                ${data.recent_transactions.map((t) => `
                  <tr class="cursor-pointer" data-open-tx="${t.id}">
                    <td class="font-semibold text-teal-700">${t.transaction_number}</td>
                    <td>${escapeHtml(t.farmer_name_snapshot)}</td>
                    <td>${t.count_value}</td>
                    <td>${kg(t.tonnage_kg)}</td>
                    <td>${escapeHtml(t.exporter_name_snapshot)}</td>
                    <td class="font-semibold">${money(t.commission_amount)}</td>
                    <td>${billBadge(t.bill_status)}</td>
                  </tr>`).join('') || `<tr><td colspan="7" class="text-center text-ink-400 py-8">No transactions yet. Create your first one!</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    document.getElementById('periodSelect').value = dashboardPeriod;
    document.getElementById('periodSelect').addEventListener('change', (e) => {
      dashboardPeriod = e.target.value;
      renderDashboard();
    });
    document.getElementById('newTxBtnDash').addEventListener('click', () => openTransactionForm());
    document.querySelectorAll('[data-nav="transactions"]').forEach(el => el.addEventListener('click', () => navigate('transactions')));
    document.querySelectorAll('[data-open-tx]').forEach((el) => {
      el.addEventListener('click', () => openTransactionDetails(el.dataset.openTx));
    });

    drawCharts(data.charts);
  } catch (err) {
    container.innerHTML = `<div class="text-center py-24 text-coral-600">${escapeHtml(err.message)}</div>`;
  }
}

function statCard(label, value, icon, accent) {
  return `
    <div class="stat-card" style="--accent:${accent}">
      <div class="flex items-start justify-between">
        <div>
          <div class="text-xs uppercase tracking-wide text-ink-500 font-bold mb-1">${label}</div>
          <div class="text-xl sm:text-2xl font-800 text-ink-900" style="font-weight:800;">${value}</div>
        </div>
        <div class="text-2xl">${icon}</div>
      </div>
    </div>`;
}

function drawCharts(chartData) {
  Object.values(charts).forEach((c) => c && c.destroy());

  const teal = '#0d9488', coral = '#f4623a', tealLight = '#5eead4';

  charts.monthly = new Chart(document.getElementById('chartMonthly'), {
    type: 'bar',
    data: {
      labels: chartData.monthly.map((m) => m.month),
      datasets: [
        { label: 'Purchase', data: chartData.monthly.map((m) => m.purchase), backgroundColor: teal },
        { label: 'Sales', data: chartData.monthly.map((m) => m.sales), backgroundColor: tealLight },
        { label: 'Commission', data: chartData.monthly.map((m) => m.commission), backgroundColor: coral },
      ],
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } }, scales: { x: { grid: { display: false } } } },
  });

  charts.count = new Chart(document.getElementById('chartCount'), {
    type: 'doughnut',
    data: {
      labels: chartData.count_wise.map((c) => `${c.count} count`),
      datasets: [{ data: chartData.count_wise.map((c) => c.tonnage), backgroundColor: ['#0d9488', '#14b8a6', '#5eead4', '#f4623a', '#ff9d80', '#134e4a', '#0f766e'] }],
    },
    options: { responsive: true, plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } } } },
  });

  charts.exporter = new Chart(document.getElementById('chartExporter'), {
    type: 'bar',
    data: { labels: chartData.exporter_wise.map((e) => e.name), datasets: [{ label: 'Sales', data: chartData.exporter_wise.map((e) => e.sales), backgroundColor: teal }] },
    options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } } },
  });

  charts.farmer = new Chart(document.getElementById('chartFarmer'), {
    type: 'bar',
    data: { labels: chartData.farmer_wise.map((f) => f.name), datasets: [{ label: 'Tonnage (KG)', data: chartData.farmer_wise.map((f) => f.tonnage), backgroundColor: coral }] },
    options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } } },
  });
}

/* ============================================================
   TRANSACTIONS VIEW
   ============================================================ */

async function renderTransactionsView() {
  const container = document.getElementById('viewContainer');
  container.innerHTML = `
    <div class="fade-in">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 class="font-heading text-2xl font-800 text-ink-900" style="font-weight:800;">Transactions</h1>
          <p class="text-ink-500 text-sm mt-0.5">Every farmer purchase, exporter sale, commission and payment in one place</p>
        </div>
        <button id="newTxBtn" class="btn-primary text-sm whitespace-nowrap">+ New Prawn Transaction</button>
      </div>

      <div class="flex items-center gap-2 mb-5">
        <input id="fSearch" class="field-input flex-1" placeholder="Search by ID, farmer or exporter…" />
        <div class="relative">
          <button id="filterToggleBtn" type="button" class="btn-secondary !px-3.5 relative flex items-center gap-1.5" title="Filters">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 5h16l-6 8v6l-4 2v-8L4 5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
            <span class="hidden sm:inline text-sm">Filter</span>
            <span id="filterBadge" class="hidden absolute -top-1.5 -right-1.5 bg-coral-500 text-white text-[10px] font-bold rounded-full w-4 h-4 items-center justify-center">0</span>
          </button>
          <div id="filterPanel" class="hidden absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-pop border border-ink-100 p-4 z-30">
            <div class="space-y-3">
              <div>
                <label class="field-label">Exporter Payment</label>
                <select id="fExpPay" class="field-input">
                  <option value="">All</option><option value="PENDING">Pending</option><option value="PARTIALLY_PAID">Partial</option><option value="PAID">Paid</option>
                </select>
              </div>
              <div>
                <label class="field-label">Farmer Payment</label>
                <select id="fFarmPay" class="field-input">
                  <option value="">All</option><option value="PENDING">Pending</option><option value="PARTIALLY_PAID">Partial</option><option value="PAID">Paid</option>
                </select>
              </div>
              <div class="flex gap-2 pt-1">
                <button id="applyFilters" class="btn-primary text-sm flex-1">Apply</button>
                <button id="clearFilters" class="btn-secondary text-sm flex-1">Clear</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="stat-card !p-0 overflow-hidden">
        <div class="overflow-x-auto scroll-thin">
          <table class="data-table" id="txTable">
            <thead>
              <tr><th>ID</th><th>Date</th><th>Farmer</th><th>Count</th><th>KG</th><th>Farmer ₹</th><th>Exporter</th><th>Exp. ₹</th><th>Commission</th><th>Exp. Pay</th><th>Farmer Pay</th><th>Bill</th><th></th></tr>
            </thead>
            <tbody id="txTableBody"><tr><td colspan="13" class="text-center py-10 text-ink-400">Loading…</td></tr></tbody>
          </table>
        </div>
        <div id="txPagination" class="flex items-center justify-between px-5 py-3 border-t border-ink-100 text-sm text-ink-500"></div>
      </div>
    </div>
  `;

  document.getElementById('newTxBtn').addEventListener('click', () => openTransactionForm());

  document.getElementById('fSearch').addEventListener('input', debounce(() => {
    state.txFilters = { ...state.txFilters, page: 1, search: document.getElementById('fSearch').value };
    loadTransactions();
  }, 350));

  const filterPanel = document.getElementById('filterPanel');
  const filterToggleBtn = document.getElementById('filterToggleBtn');
  filterToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    filterPanel.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!filterPanel.classList.contains('hidden') && !filterPanel.contains(e.target) && e.target !== filterToggleBtn) {
      filterPanel.classList.add('hidden');
    }
  });

  document.getElementById('applyFilters').addEventListener('click', () => {
    state.txFilters = {
      ...state.txFilters,
      page: 1,
      exporter_payment_status: document.getElementById('fExpPay').value,
      farmer_payment_status: document.getElementById('fFarmPay').value,
    };
    updateFilterBadge();
    filterPanel.classList.add('hidden');
    loadTransactions();
  });
  document.getElementById('clearFilters').addEventListener('click', () => {
    document.getElementById('fExpPay').value = '';
    document.getElementById('fFarmPay').value = '';
    state.txFilters = { page: 1, limit: 15, search: state.txFilters.search };
    updateFilterBadge();
    filterPanel.classList.add('hidden');
    loadTransactions();
  });

  // restore filter values in inputs
  const f = state.txFilters;
  if (f.search) document.getElementById('fSearch').value = f.search;
  if (f.exporter_payment_status) document.getElementById('fExpPay').value = f.exporter_payment_status;
  if (f.farmer_payment_status) document.getElementById('fFarmPay').value = f.farmer_payment_status;
  updateFilterBadge();

  loadTransactions();
}

function updateFilterBadge() {
  const f = state.txFilters;
  const count = [f.exporter_payment_status, f.farmer_payment_status].filter(Boolean).length;
  const badge = document.getElementById('filterBadge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
    badge.classList.add('flex');
  } else {
    badge.classList.add('hidden');
    badge.classList.remove('flex');
  }
}

async function loadTransactions() {
  const body = document.getElementById('txTableBody');
  const pag = document.getElementById('txPagination');
  try {
    const data = await api('/transactions', { query: state.txFilters });
    body.innerHTML = data.data.map((t) => `
      <tr class="cursor-pointer" data-open-tx="${t.id}">
        <td class="font-semibold text-teal-700">${t.transaction_number}</td>
        <td>${fmtDate(t.transaction_date)}</td>
        <td>${escapeHtml(t.farmer_name_snapshot)}</td>
        <td>${t.count_value}</td>
        <td>${kg(t.tonnage_kg)}</td>
        <td>${money(t.farmer_price)}</td>
        <td>${escapeHtml(t.exporter_name_snapshot)}</td>
        <td>${money(t.exporter_price)}</td>
        <td class="font-semibold">${money(t.commission_amount)}</td>
        <td>${payBadge(t.exporter_payment_status)}</td>
        <td>${payBadge(t.farmer_payment_status)}</td>
        <td>${billBadge(t.bill_status)}</td>
        <td><button class="text-ink-400 hover:text-teal-700" data-edit-tx="${t.id}" title="Edit">✏️</button></td>
      </tr>`).join('') || `<tr><td colspan="13" class="text-center py-10 text-ink-400">No transactions match these filters.</td></tr>`;

    document.querySelectorAll('[data-open-tx]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-edit-tx]')) return;
        openTransactionDetails(el.dataset.openTx);
      });
    });
    document.querySelectorAll('[data-edit-tx]').forEach((el) => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const tx = await api(`/transactions/${el.dataset.editTx}`);
        openTransactionForm(tx);
      });
    });

    const totalPages = Math.max(1, Math.ceil(data.total / data.limit));
    pag.innerHTML = `
      <span>${data.total} total transaction${data.total === 1 ? '' : 's'} — page ${data.page} of ${totalPages}</span>
      <div class="flex gap-2">
        <button id="prevPage" class="btn-secondary !py-1.5 !px-3 text-xs" ${data.page <= 1 ? 'disabled style="opacity:.4"' : ''}>← Prev</button>
        <button id="nextPage" class="btn-secondary !py-1.5 !px-3 text-xs" ${data.page >= totalPages ? 'disabled style="opacity:.4"' : ''}>Next →</button>
      </div>`;
    document.getElementById('prevPage')?.addEventListener('click', () => { if (state.txFilters.page > 1) { state.txFilters.page--; loadTransactions(); } });
    document.getElementById('nextPage')?.addEventListener('click', () => { if (state.txFilters.page < totalPages) { state.txFilters.page++; loadTransactions(); } });
  } catch (err) {
    body.innerHTML = `<tr><td colspan="13" class="text-center py-10 text-coral-600">${escapeHtml(err.message)}</td></tr>`;
  }
}

/* ============================================================
   TRANSACTION FORM (create / edit)
   ============================================================ */

async function openTransactionForm(existing = null) {
  const isEdit = !!existing;
  const [farmersRes, exportersRes] = await Promise.all([
    api('/farmers', { query: { limit: 500 } }),
    api('/exporters', { query: { limit: 500 } }),
  ]);
  state.farmersCache = farmersRes.data;
  state.exportersCache = exportersRes.data;

  const farmerOptions = state.farmersCache.map(f => `<option value="${f.id}" data-name="${escapeHtml(f.farmer_name)}">${escapeHtml(f.farmer_name)}</option>`).join('');
  const exporterOptions = state.exportersCache.map(x => `<option value="${x.id}" data-name="${escapeHtml(x.company_name)}">${escapeHtml(x.company_name)}</option>`).join('');

  openModal(`
    <form id="txForm">
      <div class="px-6 py-5 border-b border-ink-100 flex items-center justify-between sticky top-0 bg-white z-10 rounded-t-2xl">
        <h2 class="font-heading text-lg font-800 text-ink-900" style="font-weight:800;">${isEdit ? `Edit ${existing.transaction_number}` : '🦐 New Prawn Transaction'}</h2>
        <button type="button" id="closeModalBtn" class="text-ink-400 hover:text-ink-700 text-2xl leading-none">&times;</button>
      </div>
      <div class="px-6 py-5 space-y-6 max-h-[70vh] overflow-y-auto scroll-thin">

        <div>
          <label class="field-label">Transaction Date *</label>
          <input id="txDate" type="date" class="field-input" required value="${isEdit ? toInputDate(existing.transaction_date) : todayInput()}" />
        </div>

        <div class="border-t border-ink-100 pt-4">
          <div class="text-xs font-bold uppercase tracking-wide text-teal-700 mb-3">👨‍🌾 Farmer Information</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="sm:col-span-2">
              <label class="field-label">Farmer Name *</label>
              <input id="txFarmerName" list="farmerList" class="field-input" required placeholder="Type or select a farmer" value="${isEdit ? escapeHtml(existing.farmer_name_snapshot) : ''}" />
              <datalist id="farmerList">${farmerOptions}</datalist>
            </div>
            <div>
              <label class="field-label">Count (pieces/kg) *</label>
              <input id="txCount" type="number" step="1" min="1" class="field-input" required value="${isEdit ? existing.count_value : ''}" placeholder="e.g. 30" />
            </div>
            <div>
              <label class="field-label">Tonnage (KG) *</label>
              <input id="txTonnage" type="number" step="0.001" min="0.001" class="field-input" required value="${isEdit ? existing.tonnage_kg : ''}" placeholder="e.g. 2500" />
            </div>
            <div>
              <label class="field-label">Farmer Price (₹/KG) *</label>
              <input id="txFarmerPrice" type="number" step="0.01" min="0" class="field-input" required value="${isEdit ? existing.farmer_price : ''}" />
            </div>
            <div>
              <label class="field-label">Purchase Value</label>
              <input id="txPurchaseValue" class="field-input bg-ink-50" readonly value="₹0" />
            </div>
          </div>
        </div>

        <div class="border-t border-ink-100 pt-4">
          <div class="text-xs font-bold uppercase tracking-wide text-teal-700 mb-3">🏢 Exporter Information</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="sm:col-span-2">
              <label class="field-label">Exporter Company Name *</label>
              <input id="txExporterName" list="exporterList" class="field-input" required placeholder="Type or select an exporter" value="${isEdit ? escapeHtml(existing.exporter_name_snapshot) : ''}" />
              <datalist id="exporterList">${exporterOptions}</datalist>
            </div>
            <div>
              <label class="field-label">Exporter Price (₹/KG) *</label>
              <input id="txExporterPrice" type="number" step="0.01" min="0" class="field-input" required value="${isEdit ? existing.exporter_price : ''}" />
            </div>
            <div>
              <label class="field-label">Sales Value</label>
              <input id="txSalesValue" class="field-input bg-ink-50" readonly value="₹0" />
            </div>
            <div>
              <label class="field-label">Price Difference (₹/KG)</label>
              <input id="txPriceDiff" class="field-input bg-ink-50" readonly value="₹0" />
            </div>
            <div>
              <div class="flex items-center justify-between mb-[.3rem]">
                <label class="field-label !mb-0">Commission Amount (₹) *</label>
                <label class="flex items-center gap-1.5 text-[11px] font-semibold text-teal-700 cursor-pointer select-none">
                  <input type="checkbox" id="txCommissionAuto" class="rounded accent-teal-600" ${isEdit ? '' : 'checked'} />
                  Auto-calculate
                </label>
              </div>
              <input id="txCommission" type="number" step="0.01" min="0" class="field-input" required value="${isEdit ? existing.commission_amount : ''}" />
              <div class="text-[11px] text-ink-400 mt-1">Auto = (Exporter Price − Farmer Price) × Tonnage. Uncheck to enter your own commission.</div>
            </div>
          </div>
        </div>

        <div class="border-t border-ink-100 pt-4">
          <label class="field-label">Notes</label>
          <textarea id="txNotes" rows="2" class="field-input">${isEdit ? escapeHtml(existing.notes || '') : ''}</textarea>
        </div>

        <div id="txFormError" class="hidden text-sm text-coral-600 bg-coral-50 border border-coral-200 rounded-lg px-3 py-2"></div>
      </div>
      <div class="px-6 py-4 border-t border-ink-100 flex justify-end gap-3 sticky bottom-0 bg-white rounded-b-2xl">
        <button type="button" id="cancelTxBtn" class="btn-secondary">Cancel</button>
        <button type="submit" class="btn-primary">${isEdit ? 'Save Changes' : 'Create Transaction'}</button>
      </div>
    </form>
  `, { wide: true });

  const commissionInput = document.getElementById('txCommission');
  const commissionAutoBox = document.getElementById('txCommissionAuto');

  const recalc = () => {
    const tonnage = Number(document.getElementById('txTonnage').value || 0);
    const fPrice = Number(document.getElementById('txFarmerPrice').value || 0);
    const ePrice = Number(document.getElementById('txExporterPrice').value || 0);
    document.getElementById('txPurchaseValue').value = moneyPrecise(tonnage * fPrice);
    document.getElementById('txSalesValue').value = moneyPrecise(tonnage * ePrice);
    document.getElementById('txPriceDiff').value = moneyPrecise(ePrice - fPrice) + '/KG';

    if (commissionAutoBox.checked) {
      const autoCommission = Math.max(0, tonnage * (ePrice - fPrice));
      commissionInput.value = autoCommission ? autoCommission.toFixed(2) : '';
    }
  };

  const applyAutoState = () => {
    commissionInput.readOnly = commissionAutoBox.checked;
    commissionInput.classList.toggle('bg-ink-50', commissionAutoBox.checked);
  };

  ['txTonnage', 'txFarmerPrice', 'txExporterPrice'].forEach((id) => {
    document.getElementById(id).addEventListener('input', recalc);
  });
  commissionAutoBox.addEventListener('change', () => { applyAutoState(); recalc(); });

  applyAutoState();
  recalc();

  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  document.getElementById('cancelTxBtn').addEventListener('click', closeModal);

  document.getElementById('txForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('txFormError');
    errBox.classList.add('hidden');

    const farmerNameVal = document.getElementById('txFarmerName').value.trim();
    const exporterNameVal = document.getElementById('txExporterName').value.trim();
    const farmerMatch = state.farmersCache.find(f => f.farmer_name.toLowerCase() === farmerNameVal.toLowerCase());
    const exporterMatch = state.exportersCache.find(x => x.company_name.toLowerCase() === exporterNameVal.toLowerCase());

    const payload = {
      transaction_date: document.getElementById('txDate').value,
      farmer_id: farmerMatch ? farmerMatch.id : null,
      farmer_name: farmerNameVal,
      count: document.getElementById('txCount').value,
      tonnage_kg: document.getElementById('txTonnage').value,
      farmer_price: document.getElementById('txFarmerPrice').value,
      exporter_id: exporterMatch ? exporterMatch.id : null,
      exporter_company_name: exporterNameVal,
      exporter_price: document.getElementById('txExporterPrice').value,
      commission_amount: document.getElementById('txCommission').value,
      notes: document.getElementById('txNotes').value,
    };

    try {
      if (isEdit) {
        await api(`/transactions/${existing.id}`, { method: 'PUT', body: payload });
        toast('Transaction updated successfully.');
      } else {
        await api('/transactions', { method: 'POST', body: payload });
        toast('Transaction created successfully.');
      }
      closeModal();
      if (state.view === 'transactions') loadTransactions(); else if (state.view === 'dashboard') renderDashboard();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
    }
  });
}

/* ============================================================
   TRANSACTION DETAILS MODAL
   ============================================================ */

async function openTransactionDetails(id) {
  try {
    const t = await api(`/transactions/${id}`);
    renderTransactionDetailsModal(t);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderTransactionDetailsModal(t) {
  openModal(`
    <div class="px-6 py-5 border-b border-ink-100 flex items-center justify-between sticky top-0 bg-white z-10 rounded-t-2xl">
      <div>
        <h2 class="font-heading text-lg font-800 text-ink-900" style="font-weight:800;">${t.transaction_number}</h2>
        <div class="text-xs text-ink-500 mt-0.5">${fmtDate(t.transaction_date)}</div>
      </div>
      <div class="flex items-center gap-3">
        ${billBadge(t.bill_status)}
        <button type="button" id="closeModalBtn" class="text-ink-400 hover:text-ink-700 text-2xl leading-none">&times;</button>
      </div>
    </div>
    <div class="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto scroll-thin">

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="stat-card !shadow-none !border-ink-100">
          <div class="text-xs font-bold uppercase text-teal-700 mb-2">👨‍🌾 Farmer — ${escapeHtml(t.farmer_name_snapshot)}</div>
          <div class="text-sm space-y-1 text-ink-700">
            <div class="flex justify-between"><span>Count</span><span class="font-semibold">${t.count_value} pieces/kg</span></div>
            <div class="flex justify-between"><span>Tonnage</span><span class="font-semibold">${kg(t.tonnage_kg)}</span></div>
            <div class="flex justify-between"><span>Price</span><span class="font-semibold">${money(t.farmer_price)}/KG</span></div>
            <div class="flex justify-between border-t border-ink-100 pt-1 mt-1"><span>Purchase Value</span><span class="font-bold text-ink-900">${money(t.purchase_amount)}</span></div>
          </div>
        </div>
        <div class="stat-card !shadow-none !border-ink-100">
          <div class="text-xs font-bold uppercase text-teal-700 mb-2">🏢 Exporter — ${escapeHtml(t.exporter_name_snapshot)}</div>
          <div class="text-sm space-y-1 text-ink-700">
            <div class="flex justify-between"><span>Price</span><span class="font-semibold">${money(t.exporter_price)}/KG</span></div>
            <div class="flex justify-between"><span>Sales Value</span><span class="font-semibold">${money(t.sales_amount)}</span></div>
            <div class="flex justify-between border-t border-ink-100 pt-1 mt-1"><span>Commission</span><span class="font-bold text-coral-600">${money(t.commission_amount)}</span></div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        ${paymentPanel('EXPORTER', t)}
        ${paymentPanel('FARMER', t)}
      </div>

      <div>
        <div class="text-xs font-bold uppercase text-ink-500 mb-2">Payment History</div>
        <div class="border border-ink-100 rounded-xl overflow-hidden">
          <table class="data-table text-xs">
            <thead><tr><th>Type</th><th>Amount</th><th>Date</th><th>Reference</th></tr></thead>
            <tbody>
              ${t.payments.length ? t.payments.map(p => `
                <tr><td>${p.payment_type === 'EXPORTER' ? '🏢 Exporter' : '👨‍🌾 Farmer'}</td><td class="font-semibold">${money(p.amount)}</td><td>${fmtDate(p.payment_date)}</td><td>${escapeHtml(p.payment_reference || '-')}</td></tr>
              `).join('') : `<tr><td colspan="4" class="text-center py-4 text-ink-400">No payments recorded yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      ${t.notes ? `<div><div class="text-xs font-bold uppercase text-ink-500 mb-1">Notes</div><div class="text-sm text-ink-700 bg-ink-50 rounded-lg p-3">${escapeHtml(t.notes)}</div></div>` : ''}

      <div>
        <div class="text-xs font-bold uppercase text-ink-500 mb-2">Audit History</div>
        <div class="space-y-2 text-xs">
          ${t.audit_logs.length ? t.audit_logs.map(a => `
            <div class="flex gap-3 items-start">
              <div class="w-1.5 h-1.5 rounded-full bg-teal-500 mt-1.5 shrink-0"></div>
              <div>
                <div class="font-semibold text-ink-800">${escapeHtml(a.action)}</div>
                ${a.new_value ? `<div class="text-ink-500">${escapeHtml(a.new_value)}</div>` : ''}
                <div class="text-ink-400">${new Date(a.created_at).toLocaleString('en-IN')} · ${escapeHtml(a.created_by || 'system')}</div>
              </div>
            </div>`).join('') : `<div class="text-ink-400">No history yet.</div>`}
        </div>
      </div>
    </div>
    <div class="px-6 py-4 border-t border-ink-100 flex flex-wrap justify-between gap-3 sticky bottom-0 bg-white rounded-b-2xl">
      <div class="flex gap-2">
        <button id="editTxDetailBtn" class="btn-secondary text-sm">✏️ Edit</button>
        <button id="deleteTxDetailBtn" class="btn-danger text-sm px-2">🗑️ Delete</button>
      </div>
      <div class="flex gap-2">
        <button id="downloadPdfBtn" class="btn-secondary text-sm">⬇ PDF</button>
        <button type="button" id="closeModalBtn2" class="btn-primary text-sm">Close</button>
      </div>
    </div>
  `, { wide: true });

  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  document.getElementById('closeModalBtn2').addEventListener('click', closeModal);
  document.getElementById('editTxDetailBtn').addEventListener('click', () => openTransactionForm(t));
  document.getElementById('downloadPdfBtn').addEventListener('click', () => downloadFile(`/reports/transaction/${t.id}/pdf`, {}, `${t.transaction_number}.pdf`));
  document.getElementById('deleteTxDetailBtn').addEventListener('click', async () => {
    if (!confirm(`Delete transaction ${t.transaction_number}? This can't be undone from the UI.`)) return;
    try {
      await api(`/transactions/${t.id}`, { method: 'DELETE' });
      toast('Transaction deleted.');
      closeModal();
      if (state.view === 'transactions') loadTransactions(); else renderDashboard();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.querySelectorAll('[data-record-payment]').forEach((btn) => {
    btn.addEventListener('click', () => openPaymentForm(t, btn.dataset.recordPayment));
  });
}

function paymentPanel(type, t) {
  const isExp = type === 'EXPORTER';
  const status = isExp ? t.exporter_payment_status : t.farmer_payment_status;
  const total = isExp ? t.sales_amount : t.purchase_amount;
  const paid = isExp ? t.exporter_paid_amount : t.farmer_paid_amount;
  const balance = isExp ? t.exporter_balance : t.farmer_balance;
  return `
    <div class="stat-card !shadow-none !border-ink-100">
      <div class="flex items-center justify-between mb-2">
        <div class="text-xs font-bold uppercase text-ink-600">${isExp ? '🏢 Exporter Payment' : '👨‍🌾 Farmer Payment'}</div>
        ${payBadge(status)}
      </div>
      <div class="text-sm space-y-1 text-ink-700">
        <div class="flex justify-between"><span>${isExp ? 'Invoice Amount' : 'Purchase Amount'}</span><span class="font-semibold">${money(total)}</span></div>
        <div class="flex justify-between"><span>Amount ${isExp ? 'Received' : 'Paid'}</span><span class="font-semibold text-teal-700">${money(paid)}</span></div>
        <div class="flex justify-between border-t border-ink-100 pt-1 mt-1"><span>Balance</span><span class="font-bold ${balance > 0 ? 'text-coral-600' : 'text-teal-700'}">${money(balance)}</span></div>
      </div>
      ${status !== 'PAID' ? `<button class="btn-primary text-xs w-full mt-3" data-record-payment="${type}">Record ${isExp ? 'Exporter' : 'Farmer'} Payment</button>` : `<div class="text-center text-xs text-teal-700 font-semibold mt-3">✓ Fully Paid</div>`}
    </div>`;
}

function openPaymentForm(t, type) {
  const isExp = type === 'EXPORTER';
  const balance = isExp ? t.exporter_balance : t.farmer_balance;
  openModal(`
    <form id="paymentForm">
      <div class="px-6 py-5 border-b border-ink-100 flex items-center justify-between">
        <h2 class="font-heading text-lg font-800" style="font-weight:800;">Record ${isExp ? 'Exporter' : 'Farmer'} Payment</h2>
        <button type="button" id="closeModalBtn" class="text-ink-400 hover:text-ink-700 text-2xl leading-none">&times;</button>
      </div>
      <div class="px-6 py-5 space-y-4">
        <div class="text-sm text-ink-500">Outstanding balance: <span class="font-bold text-coral-600">${money(balance)}</span></div>
        <div>
          <label class="field-label">Amount (₹) *</label>
          <input id="payAmount" type="number" min="0.01" step="0.01" max="${balance}" class="field-input" required value="${balance}" />
        </div>
        <div>
          <label class="field-label">Payment Date *</label>
          <input id="payDate" type="date" class="field-input" required value="${todayInput()}" />
        </div>
        <div>
          <label class="field-label">Reference / UTR Number</label>
          <input id="payRef" class="field-input" placeholder="e.g. UTR123456" />
        </div>
        <div>
          <label class="field-label">Notes</label>
          <textarea id="payNotes" rows="2" class="field-input"></textarea>
        </div>
        <div id="payFormError" class="hidden text-sm text-coral-600 bg-coral-50 border border-coral-200 rounded-lg px-3 py-2"></div>
      </div>
      <div class="px-6 py-4 border-t border-ink-100 flex justify-end gap-3">
        <button type="button" id="cancelPayBtn" class="btn-secondary">Cancel</button>
        <button type="submit" class="btn-primary">Save Payment</button>
      </div>
    </form>
  `);

  document.getElementById('closeModalBtn').addEventListener('click', () => renderTransactionDetailsModal(t));
  document.getElementById('cancelPayBtn').addEventListener('click', () => renderTransactionDetailsModal(t));

  document.getElementById('paymentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('payFormError');
    errBox.classList.add('hidden');
    try {
      await api(`/transactions/${t.id}/payments`, {
        method: 'POST',
        body: {
          payment_type: type,
          amount: document.getElementById('payAmount').value,
          payment_date: document.getElementById('payDate').value,
          payment_reference: document.getElementById('payRef').value,
          notes: document.getElementById('payNotes').value,
        },
      });
      toast('Payment recorded successfully.');
      const refreshed = await api(`/transactions/${t.id}`);
      renderTransactionDetailsModal(refreshed);
      if (state.view === 'transactions') loadTransactions();
      if (state.view === 'dashboard') renderDashboard();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
    }
  });
}

/* ============================================================
   FARMERS VIEW
   ============================================================ */

async function renderFarmersView() {
  const container = document.getElementById('viewContainer');
  container.innerHTML = `
    <div class="fade-in">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 class="font-heading text-2xl font-800 text-ink-900" style="font-weight:800;">Farmers</h1>
          <p class="text-ink-500 text-sm mt-0.5">Farmer master data used across your transactions</p>
        </div>
        <div class="flex gap-2 w-full sm:w-auto">
          <input id="farmerSearch" class="field-input" placeholder="Search farmers…" />
          <button id="newFarmerBtn" class="btn-primary text-sm whitespace-nowrap">+ Add Farmer</button>
        </div>
      </div>
      <div class="stat-card !p-0 overflow-hidden">
        <div class="overflow-x-auto scroll-thin">
          <table class="data-table">
            <thead><tr><th>Code</th><th>Name</th><th>Mobile</th><th>Village</th><th>District</th><th></th></tr></thead>
            <tbody id="farmerTableBody"><tr><td colspan="6" class="text-center py-10 text-ink-400">Loading…</td></tr></tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  document.getElementById('newFarmerBtn').addEventListener('click', () => openFarmerForm());
  document.getElementById('farmerSearch').addEventListener('input', debounce(loadFarmers, 300));
  loadFarmers();
}

const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

async function loadFarmers() {
  const body = document.getElementById('farmerTableBody');
  const search = document.getElementById('farmerSearch')?.value || '';
  try {
    const data = await api('/farmers', { query: { search, limit: 200 } });
    body.innerHTML = data.data.map(f => `
      <tr>
        <td class="font-semibold text-teal-700">${f.farmer_code}</td>
        <td class="cursor-pointer" data-view-farmer="${f.id}">${escapeHtml(f.farmer_name)}</td>
        <td>${escapeHtml(f.mobile || '-')}</td>
        <td>${escapeHtml(f.village || '-')}</td>
        <td>${escapeHtml(f.district || '-')}</td>
        <td class="text-right">
          <button class="text-ink-400 hover:text-teal-700 mr-2" data-edit-farmer="${f.id}">✏️</button>
          <button class="text-ink-400 hover:text-coral-600" data-delete-farmer="${f.id}">🗑️</button>
        </td>
      </tr>`).join('') || `<tr><td colspan="6" class="text-center py-10 text-ink-400">No farmers yet.</td></tr>`;

    document.querySelectorAll('[data-view-farmer]').forEach(el => el.addEventListener('click', () => openFarmerSummary(el.dataset.viewFarmer)));
    document.querySelectorAll('[data-edit-farmer]').forEach(el => el.addEventListener('click', async () => {
      const f = await api(`/farmers/${el.dataset.editFarmer}`);
      openFarmerForm(f);
    }));
    document.querySelectorAll('[data-delete-farmer]').forEach(el => el.addEventListener('click', async () => {
      if (!confirm('Remove this farmer from the master list?')) return;
      try { await api(`/farmers/${el.dataset.deleteFarmer}`, { method: 'DELETE' }); toast('Farmer removed.'); loadFarmers(); }
      catch (err) { toast(err.message, 'error'); }
    }));
  } catch (err) {
    body.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-coral-600">${escapeHtml(err.message)}</td></tr>`;
  }
}

function openFarmerForm(existing = null) {
  const isEdit = !!existing;
  openModal(`
    <form id="farmerForm">
      <div class="px-6 py-5 border-b border-ink-100 flex items-center justify-between">
        <h2 class="font-heading text-lg font-800" style="font-weight:800;">${isEdit ? 'Edit Farmer' : 'Add Farmer'}</h2>
        <button type="button" id="closeModalBtn" class="text-ink-400 hover:text-ink-700 text-2xl leading-none">&times;</button>
      </div>
      <div class="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto scroll-thin">
        <div><label class="field-label">Farmer Name *</label><input id="fmName" class="field-input" required value="${isEdit ? escapeHtml(existing.farmer_name) : ''}" /></div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="field-label">Mobile</label><input id="fmMobile" class="field-input" value="${isEdit ? escapeHtml(existing.mobile || '') : ''}" /></div>
          <div><label class="field-label">PAN</label><input id="fmPan" class="field-input" value="${isEdit ? escapeHtml(existing.pan || '') : ''}" /></div>
          <div><label class="field-label">Village</label><input id="fmVillage" class="field-input" value="${isEdit ? escapeHtml(existing.village || '') : ''}" /></div>
          <div><label class="field-label">Mandal</label><input id="fmMandal" class="field-input" value="${isEdit ? escapeHtml(existing.mandal || '') : ''}" /></div>
          <div class="col-span-2"><label class="field-label">District</label><input id="fmDistrict" class="field-input" value="${isEdit ? escapeHtml(existing.district || '') : ''}" /></div>
        </div>
        <div><label class="field-label">Address</label><textarea id="fmAddress" rows="2" class="field-input">${isEdit ? escapeHtml(existing.address || '') : ''}</textarea></div>
        <div><label class="field-label">Bank Details</label><textarea id="fmBank" rows="2" class="field-input">${isEdit ? escapeHtml(existing.bank_details || '') : ''}</textarea></div>
        <div><label class="field-label">Notes</label><textarea id="fmNotes" rows="2" class="field-input">${isEdit ? escapeHtml(existing.notes || '') : ''}</textarea></div>
        <div id="fmError" class="hidden text-sm text-coral-600 bg-coral-50 border border-coral-200 rounded-lg px-3 py-2"></div>
      </div>
      <div class="px-6 py-4 border-t border-ink-100 flex justify-end gap-3">
        <button type="button" id="cancelFmBtn" class="btn-secondary">Cancel</button>
        <button type="submit" class="btn-primary">${isEdit ? 'Save Changes' : 'Add Farmer'}</button>
      </div>
    </form>
  `);
  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  document.getElementById('cancelFmBtn').addEventListener('click', closeModal);
  document.getElementById('farmerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('fmError');
    errBox.classList.add('hidden');
    const payload = {
      farmer_name: document.getElementById('fmName').value,
      mobile: document.getElementById('fmMobile').value,
      pan: document.getElementById('fmPan').value,
      village: document.getElementById('fmVillage').value,
      mandal: document.getElementById('fmMandal').value,
      district: document.getElementById('fmDistrict').value,
      address: document.getElementById('fmAddress').value,
      bank_details: document.getElementById('fmBank').value,
      notes: document.getElementById('fmNotes').value,
    };
    try {
      if (isEdit) await api(`/farmers/${existing.id}`, { method: 'PUT', body: payload });
      else await api('/farmers', { method: 'POST', body: payload });
      toast(isEdit ? 'Farmer updated.' : 'Farmer added.');
      closeModal();
      loadFarmers();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
    }
  });
}

async function openFarmerSummary(id) {
  try {
    const [farmer, summary] = await Promise.all([api(`/farmers/${id}`), api(`/farmers/${id}/summary`)]);
    openModal(`
      <div class="px-6 py-5 border-b border-ink-100 flex items-center justify-between">
        <h2 class="font-heading text-lg font-800" style="font-weight:800;">${escapeHtml(farmer.farmer_name)}</h2>
        <button type="button" id="closeModalBtn" class="text-ink-400 hover:text-ink-700 text-2xl leading-none">&times;</button>
      </div>
      <div class="px-6 py-5 space-y-4">
        <div class="grid grid-cols-2 gap-3">
          ${statCard('Total Transactions', summary.total_transactions, '📋', '#0d9488')}
          ${statCard('Total Tonnage', kg(summary.total_tonnage), '⚖️', '#14b8a6')}
          ${statCard('Total Purchase', money(summary.total_purchase), '🛒', '#0f766e')}
          ${statCard('Total Sales', money(summary.total_sales), '📦', '#0f766e')}
          ${statCard('Total Commission', money(summary.total_commission), '💰', '#f4623a')}
          ${statCard('Open / Closed Bills', `${summary.open_bills} / ${summary.closed_bills}`, '🧾', '#dd4a24')}
        </div>
        <div class="text-sm text-ink-600 bg-ink-50 rounded-xl p-4 space-y-1">
          <div><span class="font-semibold">Mobile:</span> ${escapeHtml(farmer.mobile || '-')}</div>
          <div><span class="font-semibold">Village / Mandal / District:</span> ${escapeHtml(farmer.village || '-')} / ${escapeHtml(farmer.mandal || '-')} / ${escapeHtml(farmer.district || '-')}</div>
        </div>
      </div>
      <div class="px-6 py-4 border-t border-ink-100 flex justify-end">
        <button type="button" id="closeModalBtn2" class="btn-primary text-sm">Close</button>
      </div>
    `);
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('closeModalBtn2').addEventListener('click', closeModal);
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ============================================================
   EXPORTERS VIEW
   ============================================================ */

async function renderExportersView() {
  const container = document.getElementById('viewContainer');
  container.innerHTML = `
    <div class="fade-in">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 class="font-heading text-2xl font-800 text-ink-900" style="font-weight:800;">Exporter Companies</h1>
          <p class="text-ink-500 text-sm mt-0.5">Exporter master data used across your transactions</p>
        </div>
        <div class="flex gap-2 w-full sm:w-auto">
          <input id="exporterSearch" class="field-input" placeholder="Search exporters…" />
          <button id="newExporterBtn" class="btn-primary text-sm whitespace-nowrap">+ Add Exporter</button>
        </div>
      </div>
      <div class="stat-card !p-0 overflow-hidden">
        <div class="overflow-x-auto scroll-thin">
          <table class="data-table">
            <thead><tr><th>Code</th><th>Company</th><th>Contact</th><th>Mobile</th><th>GST</th><th></th></tr></thead>
            <tbody id="exporterTableBody"><tr><td colspan="6" class="text-center py-10 text-ink-400">Loading…</td></tr></tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  document.getElementById('newExporterBtn').addEventListener('click', () => openExporterForm());
  document.getElementById('exporterSearch').addEventListener('input', debounce(loadExporters, 300));
  loadExporters();
}

async function loadExporters() {
  const body = document.getElementById('exporterTableBody');
  const search = document.getElementById('exporterSearch')?.value || '';
  try {
    const data = await api('/exporters', { query: { search, limit: 200 } });
    body.innerHTML = data.data.map(x => `
      <tr>
        <td class="font-semibold text-teal-700">${x.exporter_code}</td>
        <td>${escapeHtml(x.company_name)}</td>
        <td>${escapeHtml(x.contact_person || '-')}</td>
        <td>${escapeHtml(x.mobile || '-')}</td>
        <td>${escapeHtml(x.gst_number || '-')}</td>
        <td class="text-right">
          <button class="text-ink-400 hover:text-teal-700 mr-2" data-edit-exporter="${x.id}">✏️</button>
          <button class="text-ink-400 hover:text-coral-600" data-delete-exporter="${x.id}">🗑️</button>
        </td>
      </tr>`).join('') || `<tr><td colspan="6" class="text-center py-10 text-ink-400">No exporters yet.</td></tr>`;

    document.querySelectorAll('[data-edit-exporter]').forEach(el => el.addEventListener('click', async () => {
      const x = await api(`/exporters/${el.dataset.editExporter}`);
      openExporterForm(x);
    }));
    document.querySelectorAll('[data-delete-exporter]').forEach(el => el.addEventListener('click', async () => {
      if (!confirm('Remove this exporter from the master list?')) return;
      try { await api(`/exporters/${el.dataset.deleteExporter}`, { method: 'DELETE' }); toast('Exporter removed.'); loadExporters(); }
      catch (err) { toast(err.message, 'error'); }
    }));
  } catch (err) {
    body.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-coral-600">${escapeHtml(err.message)}</td></tr>`;
  }
}

function openExporterForm(existing = null) {
  const isEdit = !!existing;
  openModal(`
    <form id="exporterForm">
      <div class="px-6 py-5 border-b border-ink-100 flex items-center justify-between">
        <h2 class="font-heading text-lg font-800" style="font-weight:800;">${isEdit ? 'Edit Exporter' : 'Add Exporter'}</h2>
        <button type="button" id="closeModalBtn" class="text-ink-400 hover:text-ink-700 text-2xl leading-none">&times;</button>
      </div>
      <div class="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto scroll-thin">
        <div><label class="field-label">Company Name *</label><input id="exName" class="field-input" required value="${isEdit ? escapeHtml(existing.company_name) : ''}" /></div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="field-label">Contact Person</label><input id="exContact" class="field-input" value="${isEdit ? escapeHtml(existing.contact_person || '') : ''}" /></div>
          <div><label class="field-label">Mobile</label><input id="exMobile" class="field-input" value="${isEdit ? escapeHtml(existing.mobile || '') : ''}" /></div>
          <div><label class="field-label">Email</label><input id="exEmail" type="email" class="field-input" value="${isEdit ? escapeHtml(existing.email || '') : ''}" /></div>
          <div><label class="field-label">GST Number</label><input id="exGst" class="field-input" value="${isEdit ? escapeHtml(existing.gst_number || '') : ''}" /></div>
          <div class="col-span-2"><label class="field-label">Payment Terms</label><input id="exTerms" class="field-input" placeholder="e.g. Net 15 days" value="${isEdit ? escapeHtml(existing.payment_terms || '') : ''}" /></div>
        </div>
        <div><label class="field-label">Address</label><textarea id="exAddress" rows="2" class="field-input">${isEdit ? escapeHtml(existing.address || '') : ''}</textarea></div>
        <div><label class="field-label">Bank Details</label><textarea id="exBank" rows="2" class="field-input">${isEdit ? escapeHtml(existing.bank_details || '') : ''}</textarea></div>
        <div><label class="field-label">Notes</label><textarea id="exNotes" rows="2" class="field-input">${isEdit ? escapeHtml(existing.notes || '') : ''}</textarea></div>
        <div id="exError" class="hidden text-sm text-coral-600 bg-coral-50 border border-coral-200 rounded-lg px-3 py-2"></div>
      </div>
      <div class="px-6 py-4 border-t border-ink-100 flex justify-end gap-3">
        <button type="button" id="cancelExBtn" class="btn-secondary">Cancel</button>
        <button type="submit" class="btn-primary">${isEdit ? 'Save Changes' : 'Add Exporter'}</button>
      </div>
    </form>
  `);
  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  document.getElementById('cancelExBtn').addEventListener('click', closeModal);
  document.getElementById('exporterForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('exError');
    errBox.classList.add('hidden');
    const payload = {
      company_name: document.getElementById('exName').value,
      contact_person: document.getElementById('exContact').value,
      mobile: document.getElementById('exMobile').value,
      email: document.getElementById('exEmail').value,
      gst_number: document.getElementById('exGst').value,
      payment_terms: document.getElementById('exTerms').value,
      address: document.getElementById('exAddress').value,
      bank_details: document.getElementById('exBank').value,
      notes: document.getElementById('exNotes').value,
    };
    try {
      if (isEdit) await api(`/exporters/${existing.id}`, { method: 'PUT', body: payload });
      else await api('/exporters', { method: 'POST', body: payload });
      toast(isEdit ? 'Exporter updated.' : 'Exporter added.');
      closeModal();
      loadExporters();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
    }
  });
}

/* ============================================================
   COUNT RATES VIEW  (derived from actual transaction prices)
   ============================================================ */

let countRateFilters = { count: '', date_from: '', date_to: '' };

async function renderCountRatesView() {
  const container = document.getElementById('viewContainer');
  container.innerHTML = `
    <div class="fade-in">
      <div class="mb-5">
        <h1 class="font-heading text-2xl font-800 text-ink-900" style="font-weight:800;">Count Rates</h1>
        <p class="text-ink-500 text-sm mt-0.5">Daily farmer &amp; company rates, calculated automatically from your recorded transactions — not entered manually</p>
      </div>

      <div class="stat-card mb-5">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label class="field-label">Count</label>
            <select id="crFilterCount" class="field-input"><option value="">All Counts</option></select>
          </div>
          <div><label class="field-label">From</label><input id="crFilterFrom" type="date" class="field-input" /></div>
          <div><label class="field-label">To</label><input id="crFilterTo" type="date" class="field-input" /></div>
          <div class="flex gap-2">
            <button id="crApply" class="btn-primary text-sm w-full">Filter</button>
            <button id="crClear" class="btn-secondary text-sm w-full">Clear</button>
          </div>
        </div>
      </div>

      <div class="stat-card !p-0 overflow-hidden">
        <div class="overflow-x-auto scroll-thin">
          <table class="data-table">
            <thead><tr><th>Date</th><th>Count</th><th>Farmer Rate (avg ₹/KG)</th><th>Company Rate (avg ₹/KG)</th><th>Difference</th><th>Transactions</th></tr></thead>
            <tbody id="countRateTableBody"><tr><td colspan="6" class="text-center py-10 text-ink-400">Loading…</td></tr></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const countSelect = document.getElementById('crFilterCount');
  try {
    const { counts } = await api('/count-rates/counts');
    counts.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = `${c} count`;
      countSelect.appendChild(opt);
    });
  } catch { /* non-fatal */ }

  countSelect.value = countRateFilters.count;
  document.getElementById('crFilterFrom').value = countRateFilters.date_from;
  document.getElementById('crFilterTo').value = countRateFilters.date_to;

  document.getElementById('crApply').addEventListener('click', () => {
    countRateFilters = {
      count: document.getElementById('crFilterCount').value,
      date_from: document.getElementById('crFilterFrom').value,
      date_to: document.getElementById('crFilterTo').value,
    };
    loadCountRates();
  });
  document.getElementById('crClear').addEventListener('click', () => {
    countRateFilters = { count: '', date_from: '', date_to: '' };
    renderCountRatesView();
  });

  loadCountRates();
}

async function loadCountRates() {
  const body = document.getElementById('countRateTableBody');
  try {
    const data = await api('/count-rates', { query: { ...countRateFilters, limit: 300 } });
    body.innerHTML = data.data.map((r) => {
      const diff = Number(r.company_rate) - Number(r.farmer_rate);
      const rangeNote = (min, max) => (Number(min) !== Number(max) ? `<div class="text-[10px] text-ink-400">${moneyPrecise(min)} – ${moneyPrecise(max)}</div>` : '');
      return `
      <tr>
        <td>${fmtDate(r.rate_date)}</td>
        <td class="font-semibold text-teal-700">${r.count_value}</td>
        <td>${moneyPrecise(r.farmer_rate)}${rangeNote(r.farmer_rate_min, r.farmer_rate_max)}</td>
        <td>${moneyPrecise(r.company_rate)}${rangeNote(r.company_rate_min, r.company_rate_max)}</td>
        <td class="font-semibold ${diff >= 0 ? 'text-teal-700' : 'text-coral-600'}">${moneyPrecise(diff)}</td>
        <td class="text-ink-500">${r.transactions_count}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="6" class="text-center py-10 text-ink-400">No transactions recorded yet for these filters — rates appear here automatically once you create transactions.</td></tr>`;
  } catch (err) {
    body.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-coral-600">${escapeHtml(err.message)}</td></tr>`;
  }
}

/* ============================================================
   REPORTS VIEW
   ============================================================ */

const REPORT_TYPES = [
  { key: 'purchase', label: 'Purchase Report', icon: '🛒' },
  { key: 'sales', label: 'Sales Report', icon: '📦' },
  { key: 'commission', label: 'Commission Report', icon: '💰' },
  { key: 'payment', label: 'Payment Report', icon: '💳' },
  { key: 'complete', label: 'Complete Transaction Report', icon: '📑' },
];

async function renderReportsView() {
  const container = document.getElementById('viewContainer');
  container.innerHTML = `
    <div class="fade-in">
      <h1 class="font-heading text-2xl font-800 text-ink-900 mb-1" style="font-weight:800;">Reports</h1>
      <p class="text-ink-500 text-sm mb-5">Generate reports for any date range and export as PDF or Excel</p>

      <div class="stat-card mb-5">
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label class="field-label">Report Type</label>
            <select id="repType" class="field-input">
              ${REPORT_TYPES.map(r => `<option value="${r.key}">${r.icon} ${r.label}</option>`).join('')}
            </select>
          </div>
          <div><label class="field-label">From</label><input id="repFrom" type="date" class="field-input" /></div>
          <div><label class="field-label">To</label><input id="repTo" type="date" class="field-input" /></div>
          <div class="flex gap-2">
            <button id="repGenerate" class="btn-primary text-sm w-full">Generate</button>
          </div>
        </div>
      </div>

      <div id="repResults"></div>
    </div>
  `;
  document.getElementById('repGenerate').addEventListener('click', generateReport);
}

async function generateReport() {
  const type = document.getElementById('repType').value;
  const from = document.getElementById('repFrom').value;
  const to = document.getElementById('repTo').value;
  const results = document.getElementById('repResults');
  results.innerHTML = `<div class="text-center py-10 text-ink-400">Generating report…</div>`;

  try {
    const data = await api(`/reports/${type}`, { query: { from, to } });
    const totalsHtml = Object.entries(data.totals).map(([k, v]) => `
      <div class="stat-card !p-4">
        <div class="text-[10px] uppercase tracking-wide text-ink-500 font-bold">${k}</div>
        <div class="text-lg font-800 text-ink-900" style="font-weight:800;">${v}</div>
      </div>`).join('');

    const columnsMap = {
      purchase: [['transaction_number','ID'],['transaction_date','Date'],['farmer_name_snapshot','Farmer'],['count_value','Count'],['tonnage_kg','KG'],['farmer_price','Price'],['purchase_amount','Value']],
      sales: [['transaction_number','ID'],['transaction_date','Date'],['exporter_name_snapshot','Exporter'],['count_value','Count'],['tonnage_kg','KG'],['exporter_price','Price'],['sales_amount','Value']],
      commission: [['transaction_number','ID'],['transaction_date','Date'],['farmer_name_snapshot','Farmer'],['exporter_name_snapshot','Exporter'],['tonnage_kg','KG'],['commission_amount','Commission']],
      payment: [['transaction_number','ID'],['farmer_name_snapshot','Farmer'],['exporter_name_snapshot','Exporter'],['farmer_payment_status','Farmer Pay'],['exporter_payment_status','Exp. Pay'],['farmer_balance','F.Balance'],['exporter_balance','E.Balance'],['bill_status','Bill']],
      complete: [['transaction_number','ID'],['transaction_date','Date'],['farmer_name_snapshot','Farmer'],['exporter_name_snapshot','Exporter'],['tonnage_kg','KG'],['commission_amount','Commission'],['bill_status','Bill']],
    };
    const cols = columnsMap[type];

    const isMoney = (k) => ['farmer_price','exporter_price','purchase_amount','sales_amount','commission_amount','farmer_balance','exporter_balance'].includes(k);

    results.innerHTML = `
      <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">${totalsHtml}</div>
      <div class="stat-card !p-0 overflow-hidden">
        <div class="px-5 py-4 border-b border-ink-100 flex items-center justify-between">
          <div class="font-heading font-700 text-sm" style="font-weight:700;">${REPORT_TYPES.find(r=>r.key===type).label} — ${data.rows.length} records</div>
          <div class="flex gap-2">
            <button id="dlPdf" class="btn-secondary text-xs">⬇ PDF</button>
            <button id="dlExcel" class="btn-secondary text-xs">⬇ Excel</button>
          </div>
        </div>
        <div class="overflow-x-auto scroll-thin max-h-[50vh]">
          <table class="data-table">
            <thead><tr>${cols.map(([,l]) => `<th>${l}</th>`).join('')}</tr></thead>
            <tbody>
              ${data.rows.map(r => `<tr>${cols.map(([k]) => {
                let v = r[k];
                if (k === 'transaction_date') v = fmtDate(v);
                else if (k === 'bill_status') v = billBadge(v);
                else if (k.endsWith('_status')) v = payBadge(v);
                else if (isMoney(k)) v = money(v);
                else v = escapeHtml(v);
                return `<td>${v}</td>`;
              }).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="text-center py-10 text-ink-400">No records for this range.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('dlPdf').addEventListener('click', () => downloadFile(`/reports/${type}/export/pdf`, { from, to }, `${type}-report.pdf`));
    document.getElementById('dlExcel').addEventListener('click', () => downloadFile(`/reports/${type}/export/excel`, { from, to }, `${type}-report.xlsx`));
  } catch (err) {
    results.innerHTML = `<div class="text-center py-10 text-coral-600">${escapeHtml(err.message)}</div>`;
  }
}
