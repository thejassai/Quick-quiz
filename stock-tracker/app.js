// ============================================================
//  Stock Tracker — app.js
//  --------------------------------------------------------
//  HOW TO START:
//  1. Get a FREE API key at https://www.alphavantage.co/support/#api-key
//  2. Paste it below where it says YOUR_API_KEY_HERE
//  3. Open index.html in your browser — done!
// ============================================================

const API_KEY = "E7U4GCFI3MA1M42B";   // <-- PASTE YOUR KEY HERE
const BASE_URL = "https://www.alphavantage.co/query";

// ── State ────────────────────────────────────────────────────
// We keep everything in two arrays and save them to localStorage
// so your data survives a page refresh.

let portfolio = loadFromStorage("portfolio") || [];  // your holdings
let alerts    = loadFromStorage("alerts")    || [];  // your price alerts

// ── On page load ─────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  checkApiKey();
  renderPortfolio();
  renderAlerts();
  // Refresh prices automatically every 60 seconds
  setInterval(refreshAll, 60_000);
  // Check alerts every 60 seconds
  setInterval(checkAlerts, 60_000);
});

// ── API Key check ────────────────────────────────────────────
function checkApiKey() {
  if (API_KEY !== "YOUR_API_KEY_HERE") {
    document.getElementById("api-warning").classList.add("d-none");
  }
}

// ============================================================
//  CORE: Fetch a stock quote from Alpha Vantage
//  Returns an object like: { price, change, changePercent }
// ============================================================
async function fetchQuote(symbol) {
  const url = `${BASE_URL}?function=GLOBAL_QUOTE&symbol=${symbol.toUpperCase()}&apikey=${API_KEY}`;
  const res  = await fetch(url);
  const data = await res.json();

  // Alpha Vantage wraps the data in a "Global Quote" key
  const quote = data["Global Quote"];

  // If the symbol doesn't exist, the object will be empty
  if (!quote || !quote["05. price"]) {
    throw new Error(`Symbol "${symbol}" not found.`);
  }

  return {
    symbol:        quote["01. symbol"],
    price:         parseFloat(quote["05. price"]),
    change:        parseFloat(quote["09. change"]),
    changePercent: quote["10. change percent"],   // e.g. "1.23%"
  };
}

// ============================================================
//  ADD STOCK to portfolio
// ============================================================
async function addStock() {
  const symbol   = document.getElementById("search-input").value.trim().toUpperCase();
  const buyPrice = parseFloat(document.getElementById("buy-price").value);
  const buyQty   = parseInt(document.getElementById("buy-qty").value);
  const errorEl  = document.getElementById("search-error");

  // Basic validation
  errorEl.classList.add("d-none");
  if (!symbol)             return showError("Please enter a ticker symbol.");
  if (isNaN(buyPrice) || buyPrice <= 0) return showError("Enter a valid buy price.");
  if (isNaN(buyQty)   || buyQty   <= 0) return showError("Enter a valid quantity.");
  if (portfolio.find(s => s.symbol === symbol)) return showError(`${symbol} is already in your portfolio.`);

  const btn = document.getElementById("add-btn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Fetching...';

  try {
    const quote = await fetchQuote(symbol);

    // Build the holding object
    const holding = {
      symbol:       quote.symbol,
      buyPrice:     buyPrice,
      qty:          buyQty,
      currentPrice: quote.price,
      change:       quote.change,
      changePercent: quote.changePercent,
    };

    portfolio.push(holding);
    saveToStorage("portfolio", portfolio);
    renderPortfolio();
    clearInputs();
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-plus-lg me-1"></i>Add to Portfolio';
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove("d-none");
  }
}

// ============================================================
//  REFRESH all holdings with latest prices
// ============================================================
async function refreshAll() {
  if (portfolio.length === 0) return;

  document.getElementById("last-updated").textContent = "Refreshing…";

  for (const holding of portfolio) {
    try {
      const quote = await fetchQuote(holding.symbol);
      holding.currentPrice  = quote.price;
      holding.change        = quote.change;
      holding.changePercent = quote.changePercent;
    } catch (e) {
      console.warn(`Could not refresh ${holding.symbol}:`, e.message);
    }
    // Small delay to avoid hitting the API rate limit (5 calls/min on free tier)
    await sleep(12_000);
  }

  saveToStorage("portfolio", portfolio);
  renderPortfolio();
  checkAlerts();

  const now = new Date().toLocaleTimeString();
  document.getElementById("last-updated").textContent = `Last updated: ${now}`;
}

// ============================================================
//  REMOVE a holding
// ============================================================
function removeStock(symbol) {
  portfolio = portfolio.filter(h => h.symbol !== symbol);
  saveToStorage("portfolio", portfolio);
  renderPortfolio();
}

// ============================================================
//  RENDER the portfolio table
// ============================================================
function renderPortfolio() {
  const tbody   = document.getElementById("portfolio-body");
  const emptyMsg = document.getElementById("empty-msg");
  tbody.innerHTML = "";

  if (portfolio.length === 0) {
    emptyMsg.classList.remove("d-none");
    updateSummary(0, 0);
    return;
  }
  emptyMsg.classList.add("d-none");

  let totalInvested = 0;
  let totalCurrent  = 0;

  portfolio.forEach(h => {
    const invested = h.buyPrice * h.qty;
    const current  = h.currentPrice * h.qty;
    const pnl      = current - invested;
    const pnlPct   = ((pnl / invested) * 100).toFixed(2);

    totalInvested += invested;
    totalCurrent  += current;

    const pnlClass    = pnl >= 0 ? "text-success" : "text-danger";
    const pnlIcon     = pnl >= 0 ? "bi-arrow-up"  : "bi-arrow-down";
    const changeClass = h.change >= 0 ? "text-success" : "text-danger";

    tbody.innerHTML += `
      <tr>
        <td><span class="fw-bold fs-5">${h.symbol}</span></td>
        <td>${h.qty}</td>
        <td>$${h.buyPrice.toFixed(2)}</td>
        <td class="fw-bold">$${h.currentPrice.toFixed(2)}</td>
        <td class="${changeClass}">
          ${h.change >= 0 ? "+" : ""}${h.change.toFixed(2)}
          <span class="small">(${h.changePercent})</span>
        </td>
        <td class="${pnlClass} fw-bold">
          <i class="bi ${pnlIcon}"></i>
          ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}
        </td>
        <td class="${pnlClass}">${pnlPct}%</td>
        <td>
          <button class="btn btn-sm btn-outline-info" onclick="openChart('${h.symbol}')">
            <i class="bi bi-graph-up"></i>
          </button>
        </td>
        <td>
          <button class="btn btn-sm btn-outline-danger" onclick="removeStock('${h.symbol}')">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>`;
  });

  updateSummary(totalInvested, totalCurrent);
}

// ── Update the three summary cards at the top ────────────────
function updateSummary(invested, current) {
  const pnl = current - invested;
  document.getElementById("total-invested").textContent = `$${invested.toFixed(2)}`;
  document.getElementById("current-value").textContent  = `$${current.toFixed(2)}`;

  const pnlEl = document.getElementById("total-pnl");
  pnlEl.textContent  = `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`;
  pnlEl.className    = `fs-3 fw-bold ${pnl >= 0 ? "text-success" : "text-danger"}`;
}

// ============================================================
//  CHART — fetch 30-day history and draw with Chart.js
// ============================================================
let chartInstance = null;   // keep a reference so we can destroy it before redrawing

async function openChart(symbol) {
  document.getElementById("chart-modal-title").textContent = `${symbol} — 30-day Price History`;
  document.getElementById("chart-loading").classList.remove("d-none");

  // Show the modal
  const modal = new bootstrap.Modal(document.getElementById("chartModal"));
  modal.show();

  // Destroy previous chart if any
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  try {
    const url  = `${BASE_URL}?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=compact&apikey=${API_KEY}`;
    const res  = await fetch(url);
    const data = await res.json();

    const timeSeries = data["Time Series (Daily)"];
    if (!timeSeries) throw new Error("No chart data available.");

    // Get the last 30 days, sorted oldest → newest
    const dates  = Object.keys(timeSeries).slice(0, 30).reverse();
    const prices = dates.map(d => parseFloat(timeSeries[d]["4. close"]));

    document.getElementById("chart-loading").classList.add("d-none");

    const ctx = document.getElementById("priceChart").getContext("2d");
    chartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: dates.map(d => d.slice(5)),   // show "MM-DD" not full date
        datasets: [{
          label: `${symbol} Close Price`,
          data: prices,
          borderColor: "#00c853",
          backgroundColor: "rgba(0,200,83,0.1)",
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.3,   // slightly curved line
          fill: true,
        }]
      },
      options: {
        plugins: { legend: { labels: { color: "#fff" } } },
        scales: {
          x: { ticks: { color: "#aaa" }, grid: { color: "#333" } },
          y: { ticks: { color: "#aaa", callback: v => "$" + v }, grid: { color: "#333" } }
        }
      }
    });
  } catch (err) {
    document.getElementById("chart-loading").textContent = "Could not load chart: " + err.message;
  }
}

// ============================================================
//  ALERTS
// ============================================================

// Add a new alert
function addAlert() {
  const symbol    = document.getElementById("alert-symbol").value.trim().toUpperCase();
  const direction = document.getElementById("alert-direction").value;   // "above" or "below"
  const target    = parseFloat(document.getElementById("alert-price").value);

  if (!symbol || isNaN(target) || target <= 0) {
    alert("Please fill in the symbol and a valid target price.");
    return;
  }

  alerts.push({ symbol, direction, target, triggered: false });
  saveToStorage("alerts", alerts);
  renderAlerts();

  // Clear inputs
  document.getElementById("alert-symbol").value = "";
  document.getElementById("alert-price").value  = "";
}

// Remove an alert by index
function removeAlert(index) {
  alerts.splice(index, 1);
  saveToStorage("alerts", alerts);
  renderAlerts();
}

// Render the badges list of alerts
function renderAlerts() {
  const container = document.getElementById("alerts-list");
  const emptyMsg  = document.getElementById("alerts-empty");
  container.innerHTML = "";

  if (alerts.length === 0) {
    emptyMsg.classList.remove("d-none");
    return;
  }
  emptyMsg.classList.add("d-none");

  alerts.forEach((a, i) => {
    const badgeClass = a.triggered ? "bg-secondary" : (a.direction === "above" ? "bg-success" : "bg-danger");
    const status     = a.triggered ? " ✓ TRIGGERED" : "";
    container.innerHTML += `
      <span class="badge ${badgeClass} me-2 mb-2 p-2 fs-6">
        ${a.symbol} ${a.direction === "above" ? "↑" : "↓"} $${a.target}${status}
        <button class="btn-close btn-close-white ms-2" style="font-size:0.6rem"
                onclick="removeAlert(${i})"></button>
      </span>`;
  });
}

// Check if any alert conditions are met using current portfolio prices
function checkAlerts() {
  let triggered = false;

  alerts.forEach(alert => {
    if (alert.triggered) return;  // already fired

    // Find current price from portfolio (or we could re-fetch, but that uses API calls)
    const holding = portfolio.find(h => h.symbol === alert.symbol);
    if (!holding) return;

    const price = holding.currentPrice;
    const hit   = (alert.direction === "above" && price >= alert.target)
               || (alert.direction === "below" && price <= alert.target);

    if (hit) {
      alert.triggered = true;
      triggered = true;
      triggerAlertNotification(alert, price);
    }
  });

  if (triggered) {
    saveToStorage("alerts", alerts);
    renderAlerts();
  }
}

// Show toast + browser notification when alert fires
function triggerAlertNotification(alert, currentPrice) {
  const msg = `${alert.symbol} is now $${currentPrice.toFixed(2)} — your alert (${alert.direction} $${alert.target}) was triggered!`;

  // Bootstrap toast
  document.getElementById("toast-body").textContent = msg;
  const toast = new bootstrap.Toast(document.getElementById("alertToast"), { delay: 8000 });
  toast.show();

  // Native browser notification (if user granted permission)
  if (Notification.permission === "granted") {
    new Notification("Stock Alert!", { body: msg, icon: "https://cdn-icons-png.flaticon.com/512/2899/2899853.png" });
  }
}

// Ask user to allow browser notifications
function requestNotificationPermission() {
  if (!("Notification" in window)) {
    alert("Your browser doesn't support notifications.");
    return;
  }
  Notification.requestPermission().then(perm => {
    if (perm === "granted") alert("Notifications enabled! You'll get alerts even if you're on another tab.");
    else alert("Notifications blocked. You'll still see in-app alerts.");
  });
}

// ============================================================
//  UTILITIES
// ============================================================

// Save any data to localStorage (browser's built-in storage)
function saveToStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// Load data from localStorage (returns null if nothing saved yet)
function loadFromStorage(key) {
  const item = localStorage.getItem(key);
  return item ? JSON.parse(item) : null;
}

// Clear the add-stock input fields
function clearInputs() {
  document.getElementById("search-input").value = "";
  document.getElementById("buy-price").value    = "";
  document.getElementById("buy-qty").value      = "";
}

// Wait for ms milliseconds (used to avoid hitting API rate limits)
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
