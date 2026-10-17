// Dashboard charts (Chart.js, served locally). Data comes from a JSON <script>
// block in the page, so no inline JavaScript is needed (CSP stays strict).
(function () {
  'use strict';

  var source = document.getElementById('dashboard-data');
  if (!source || !window.Chart) return;
  var data = JSON.parse(source.textContent);
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var charts = [];

  var locale = { INR: 'en-IN', USD: 'en-US', CAD: 'en-CA', EUR: 'en-IE', GBP: 'en-GB', AUD: 'en-AU', AED: 'en-AE', SGD: 'en-SG' }[data.currency] || 'en-IN';
  var full = new Intl.NumberFormat(locale, { style: 'currency', currency: data.currency, maximumFractionDigits: 0 });
  var symbolPart = full.formatToParts(0).filter(function (p) { return p.type === 'currency'; })[0];
  var symbol = symbolPart ? symbolPart.value : '';
  var money = function (minor) { return full.format(minor / 100); };

  // Axis labels: Indian units for rupees (₹40k, ₹1.2L, ₹2Cr), k / M / B otherwise.
  var units = data.currency === 'INR' ? [[1e7, 'Cr'], [1e5, 'L'], [1e3, 'k']] : [[1e9, 'B'], [1e6, 'M'], [1e3, 'k']];
  var short = function (minor) {
    var value = minor / 100;
    for (var i = 0; i < units.length; i += 1) {
      if (Math.abs(value) >= units[i][0]) return symbol + Math.round((value / units[i][0]) * 10) / 10 + units[i][1];
    }
    return symbol + Math.round(value);
  };

  function palette() {
    var css = getComputedStyle(document.documentElement);
    var v = function (name) { return css.getPropertyValue(name).trim(); };
    return { ink: v('--color-ink'), soft: v('--color-ink-soft'), rule: v('--color-rule'), sheet: v('--color-sheet'), debit: v('--color-debit'), credit: v('--color-credit'), caution: v('--color-caution') };
  }

  function baseOptions(p) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: reduceMotion ? false : { duration: 500 },
      plugins: {
        legend: { labels: { color: p.soft, boxWidth: 12, boxHeight: 12, usePointStyle: true, font: { family: 'Inter Variable' } } },
        tooltip: { callbacks: { label: function (ctx) { return ' ' + (ctx.dataset.label ? ctx.dataset.label + ': ' : '') + money(ctx.raw); } } },
      },
    };
  }

  function axes(p, yFormat) {
    return {
      x: { grid: { display: false }, ticks: { color: p.soft, maxRotation: 0, autoSkipPadding: 12 }, border: { color: p.rule } },
      y: { beginAtZero: true, grid: { color: p.rule }, border: { display: false }, ticks: { color: p.soft, callback: yFormat } },
    };
  }

  function draw() {
    charts.forEach(function (chart) { chart.destroy(); });
    charts = [];
    var p = palette();

    // 1. Running total vs an even pace to the budget
    var pace = document.getElementById('pace-chart');
    if (pace) {
      var days = [];
      for (var d = 1; d <= data.daysInMonth; d += 1) days.push(String(d));
      var datasets = [{
        label: 'Spent',
        data: data.daily,
        borderColor: p.ink,
        backgroundColor: p.ink + '14',
        fill: true,
        tension: 0.25,
        pointRadius: 0,
        borderWidth: 2,
      }];
      if (data.overallBudget) {
        datasets.push({
          label: 'Even pace',
          data: days.map(function (_, i) { return Math.round((data.overallBudget * (i + 1)) / data.daysInMonth); }),
          borderColor: p.caution,
          borderDash: [6, 5],
          pointRadius: 0,
          borderWidth: 1.5,
          fill: false,
        });
      }
      var paceOptions = baseOptions(p);
      paceOptions.scales = axes(p, function (value) { return short(value); });
      paceOptions.interaction = { mode: 'index', intersect: false };
      paceOptions.plugins.tooltip.callbacks.title = function (items) { return 'Day ' + items[0].label; };
      charts.push(new Chart(pace, { type: 'line', data: { labels: days, datasets: datasets }, options: paceOptions }));
    }

    // 2. Spending by category
    var category = document.getElementById('category-chart');
    if (category && data.categories.length) {
      var categoryOptions = baseOptions(p);
      categoryOptions.cutout = '68%';
      categoryOptions.plugins.legend = { display: false };
      categoryOptions.plugins.tooltip.callbacks.label = function (ctx) { return ' ' + ctx.label + ': ' + money(ctx.raw); };
      charts.push(new Chart(category, {
        type: 'doughnut',
        data: {
          labels: data.categories.map(function (c) { return c.label; }),
          datasets: [{ data: data.categories.map(function (c) { return c.total; }), backgroundColor: data.categories.map(function (c) { return c.color; }), borderColor: p.sheet, borderWidth: 2 }],
        },
        options: categoryOptions,
      }));
    }

    // 3. Six-month income vs expenses
    var trend = document.getElementById('trend-chart');
    if (trend) {
      var trendOptions = baseOptions(p);
      trendOptions.scales = axes(p, function (value) { return short(value); });
      charts.push(new Chart(trend, {
        type: 'bar',
        data: {
          labels: data.trend.map(function (m) { return m.label; }),
          datasets: [
            { label: 'Income', data: data.trend.map(function (m) { return m.income; }), backgroundColor: p.credit, borderRadius: 4, maxBarThickness: 22 },
            { label: 'Expenses', data: data.trend.map(function (m) { return m.expense; }), backgroundColor: p.ink, borderRadius: 4, maxBarThickness: 22 },
          ],
        },
        options: trendOptions,
      }));
    }
  }

  draw();
  document.addEventListener('themechange', draw);
})();
