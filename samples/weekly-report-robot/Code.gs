/**
 * Weekly Business Review Robot
 * Cleans the raw order, ticket and ad spend exports, builds the weekly KPIs,
 * flags anomalies and emails the summary as a PDF.
 */

const TABS = {
  config: 'Config',
  rawOrders: 'Raw_Orders',
  rawTickets: 'Raw_Tickets',
  rawAds: 'Raw_AdSpend',
  orders: 'Clean_Orders',
  tickets: 'Clean_Tickets',
  ads: 'Clean_AdSpend',
  summary: 'WBR_Summary',
  anomalies: 'Anomalies',
  log: 'Run_Log'
};

const HEADER_BG = '#184f95';
const STATUS_BG = { Better: '#dcf5e7', Worse: '#fde2e1', Watch: '#fff4d6', OK: '#ffffff' };
const CURRENCY = { AUD: 'A$', USD: '$', NZD: 'NZ$', GBP: '£', EUR: '€', PHP: '₱' };
const DAY = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ORDER_CHANNELS = {
  web: 'Online Store', website: 'Online Store', onlinestore: 'Online Store', shopify: 'Online Store',
  instagram: 'Instagram Shop', instagramshop: 'Instagram Shop', ig: 'Instagram Shop',
  amazon: 'Amazon AU', amazonau: 'Amazon AU',
  pos: 'Pop-up (POS)', popup: 'Pop-up (POS)', popupstore: 'Pop-up (POS)'
};
const TICKET_CHANNELS = { phone: 'Phone', call: 'Phone', voice: 'Phone', chat: 'Chat', livechat: 'Chat', email: 'Email', mail: 'Email' };
const AD_PLATFORMS = {
  fb: 'Meta', facebook: 'Meta', facebookads: 'Meta', meta: 'Meta', metaads: 'Meta',
  google: 'Google', googleads: 'Google', adwords: 'Google',
  pinterest: 'Pinterest', pinterestads: 'Pinterest'
};
const ORDER_STATUS = { paid: 'Paid', refunded: 'Refunded', partially_refunded: 'Partly refunded', voided: 'Cancelled' };

const METRICS = [
  { key: 'revenue', label: 'Net revenue', format: 'money', good: 'up',
    hint: 'Check channel mix and top sellers, then site or checkout issues.' },
  { key: 'orders', label: 'Orders', format: 'int', good: 'up',
    hint: 'Compare traffic and conversion; look for stock-outs on best sellers.' },
  { key: 'aov', label: 'Average order value', format: 'money2', good: 'up',
    hint: 'Look at discount codes, bundles and free-shipping threshold changes.' },
  { key: 'refundRate', label: 'Refund rate', format: 'pct', good: 'down',
    hint: 'Group refunds by product and reason; check for damaged or late deliveries.' },
  { key: 'adSpend', label: 'Ad spend', format: 'money', good: null,
    hint: 'Confirm the change was planned and budgets are capped.' },
  { key: 'roas', label: 'ROAS (blended)', format: 'x', good: 'up',
    hint: 'Review new campaigns first; pause anything spending without sales.' },
  { key: 'tickets', label: 'Support tickets', format: 'int', good: 'down',
    hint: 'Find the shared cause: courier delays, a product fault or a site issue.' },
  { key: 'ticketsPer100', label: 'Tickets per 100 orders', format: 'dec', good: 'down',
    hint: 'Contact rate is up; read the top ticket subjects for the week.' },
  { key: 'firstResponse', label: 'Median first response (mins)', format: 'dec', good: 'down',
    hint: 'Check staffing against ticket volume by day and channel.' },
  { key: 'csat', label: 'CSAT (1-5)', format: 'dec2', good: 'up',
    hint: 'Read the low-score comments and match them to ticket subjects.' }
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Report Robot')
    .addItem('Run weekly review now', 'runFromMenu')
    .addSeparator()
    .addItem('Install Monday 8am trigger', 'installTrigger')
    .addItem('Remove trigger', 'removeTriggers')
    .addToUi();
}

function runFromMenu() {
  const ui = SpreadsheetApp.getUi();
  const result = runWeeklyReview();
  ui.alert('Weekly review done',
    `Week of ${result.weekLabel}\n${result.anomalies} KPI(s) flagged\n` +
    (result.emailed ? `Emailed to ${result.emailed}` : 'Email skipped (see Config)'),
    ui.ButtonSet.OK);
}

function installTrigger() {
  removeTriggers(true);
  ScriptApp.newTrigger('runWeeklyReview')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(8)
    .create();
  SpreadsheetApp.getUi().alert(`Done. The review will run every Monday around 8am (${Session.getScriptTimeZone()}).`);
}

function removeTriggers(silent) {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'runWeeklyReview')
    .forEach(t => ScriptApp.deleteTrigger(t));
  if (silent !== true) SpreadsheetApp.getUi().alert('Trigger removed.');
}

function runWeeklyReview() {
  const started = Date.now();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  let week = '';

  try {
    const cfg = readConfig(ss, tz);
    const orders = cleanOrders(readRows(ss, TABS.rawOrders), tz);
    const tickets = cleanTickets(readRows(ss, TABS.rawTickets), tz);
    const ads = cleanAds(readRows(ss, TABS.rawAds), tz);

    writeTable(ss, TABS.orders,
      ['Order', 'Date', 'Time', 'Week starting', 'Channel', 'Status', 'Region', 'Items', 'Gross', 'Refunded', 'Net'],
      orders.rows.map(r => [r.order, r.date, r.time, r.week, r.channel, r.status, r.region, r.items, r.gross, r.refunded, r.net]),
      { 9: cfg.money2, 10: cfg.money2, 11: cfg.money2 });
    writeTable(ss, TABS.tickets,
      ['Ticket', 'Date', 'Time', 'Week starting', 'Channel', 'Subject', 'Status', 'Resolved', 'First response (mins)', 'CSAT'],
      tickets.rows.map(r => [r.ticket, r.date, r.time, r.week, r.channel, r.subject, r.status, r.resolved, blank(r.firstResponse), blank(r.csat)]),
      {});
    writeTable(ss, TABS.ads,
      ['Date', 'Week starting', 'Platform', 'Campaign', 'Spend', 'Clicks', 'Impressions'],
      ads.rows.map(r => [r.date, r.week, r.platform, r.campaign, r.spend, r.clicks, r.impressions]),
      { 5: cfg.money2 });

    week = cfg.weekStart || lastCompleteWeek(orders.rows);
    const weeks = [];
    for (let i = 7; i >= 0; i--) weeks.push(addDays(week, -7 * i));
    const kpis = {};
    weeks.forEach(w => { kpis[w] = weekKpis(w, orders.rows, tickets.rows, ads.rows); });

    const current = kpis[week];
    const last = kpis[weeks[6]];
    const prior4 = weeks.slice(3, 7).map(w => kpis[w]);
    const report = METRICS.map(m => {
      const avg = mean(prior4.map(k => k[m.key]));
      const vsAvg = change(current[m.key], avg);
      let status = 'OK';
      if (vsAvg !== null && Math.abs(vsAvg) >= cfg.threshold) {
        status = m.good === null ? 'Watch' : ((vsAvg > 0) === (m.good === 'up') ? 'Better' : 'Worse');
      }
      return { metric: m, current: current[m.key], last: last[m.key], vsLast: change(current[m.key], last[m.key]), avg, vsAvg, status };
    });
    const flagged = report.filter(r => r.status !== 'OK');
    const checks = [['Orders', orders], ['Tickets', tickets], ['Ad spend', ads]];

    const summary = writeSummary(ss, cfg, week, report, weeks, kpis, channelMix(week, orders.rows), checks);
    writeAnomalies(ss, cfg, week, flagged);

    let emailed = '';
    let note = '';
    if (cfg.sendEmail && cfg.emailTo) {
      let pdf = null;
      try {
        pdf = exportPdf(ss, summary, `${cfg.company} WBR ${week}`);
      } catch (err) {
        note = ` (PDF failed: ${err.message})`;
      }
      sendReport(ss, cfg, week, report, flagged, pdf);
      emailed = cfg.emailTo;
    }

    const total = key => checks.reduce((n, c) => n + c[1][key], 0);
    log(ss, [new Date(), week, 'OK' + note, total('kept'), total('duplicates'), total('skipped'),
      flagged.length, emailed, Math.round((Date.now() - started) / 100) / 10]);
    return { week, weekLabel: weekLabel(week), anomalies: flagged.length, emailed };
  } catch (err) {
    log(ss, [new Date(), week, 'Failed: ' + err.message, '', '', '', '', '', Math.round((Date.now() - started) / 100) / 10]);
    throw err;
  }
}

// ---------- read & clean ----------

function readConfig(ss, tz) {
  const values = ss.getSheetByName(TABS.config).getDataRange().getValues();
  const cfg = {};
  values.slice(1).forEach(r => { cfg[text(r[0]).toLowerCase()] = r[1]; });

  const code = text(cfg['currency']).toUpperCase() || 'AUD';
  const symbol = CURRENCY[code] || '$';
  let threshold = Number(cfg['anomaly threshold']) || 0.15;
  if (threshold > 1) threshold /= 100;
  const start = cfg['week starting'] ? parseWhen(cfg['week starting'], tz) : null;

  return {
    company: text(cfg['company']) || 'Weekly Business Review',
    emailTo: text(cfg['email to']),
    weekStart: start ? mondayOf(start.day) : null,
    threshold,
    currency: code,
    symbol,
    sendEmail: cfg['send email'] !== false && text(cfg['send email']).toUpperCase() !== 'FALSE',
    money: `"${symbol}"#,##0`,
    money2: `"${symbol}"#,##0.00`
  };
}

function readRows(ss, name) {
  const values = ss.getSheetByName(name).getDataRange().getValues();
  const headers = values[0].map(text);
  return values.slice(1)
    .filter(r => r.some(v => text(v) !== ''))
    .map(r => {
      const row = {};
      headers.forEach((h, i) => { row[h] = r[i]; });
      return row;
    });
}

function cleanOrders(raw, tz) {
  return dedupe(raw, r => {
    const when = parseWhen(r['Created at'], tz);
    const gross = parseMoney(r['Total']);
    const order = text(r['Name']);
    if (!order || !when || gross === null) return null;
    const statusKey = text(r['Financial Status']).toLowerCase().replace(/\s+/g, '_');
    const refunded = parseMoney(r['Refunded Amount']) || 0;
    return {
      order,
      date: when.day,
      time: when.time,
      week: mondayOf(when.day),
      channel: normalise(r['Source'], ORDER_CHANNELS, 'Unassigned'),
      status: ORDER_STATUS[statusKey] || titleCase(statusKey.replace(/_/g, ' ')),
      cancelled: statusKey === 'voided',
      region: text(r['Shipping Province']).toUpperCase(),
      items: Number(r['Lineitem quantity']) || 0,
      gross,
      refunded,
      net: round2(gross - refunded)
    };
  }, r => r.order);
}

function cleanTickets(raw, tz) {
  return dedupe(raw, r => {
    const when = parseWhen(r['Created'], tz);
    const ticket = text(r['Ticket ID']);
    if (!ticket || !when) return null;
    const status = titleCase(text(r['Status']));
    const csat = Number(text(r['CSAT']));
    return {
      ticket,
      date: when.day,
      time: when.time,
      week: mondayOf(when.day),
      channel: normalise(r['Channel'], TICKET_CHANNELS, 'Other'),
      subject: text(r['Subject']),
      status,
      resolved: /solved|closed|resolved/i.test(status),
      firstResponse: parseMinutes(r['First response (mins)']),
      csat: text(r['CSAT']) !== '' && csat >= 1 && csat <= 5 ? csat : null
    };
  }, r => r.ticket);
}

function cleanAds(raw, tz) {
  return dedupe(raw, r => {
    const when = parseWhen(r['Date'], tz);
    const spend = parseMoney(r['Spend']);
    if (!when || spend === null) return null;
    return {
      date: when.day,
      week: mondayOf(when.day),
      platform: normalise(r['Platform'], AD_PLATFORMS, 'Other'),
      campaign: text(r['Campaign']),
      spend,
      clicks: Number(r['Clicks']) || 0,
      impressions: Number(r['Impressions']) || 0
    };
  }, r => [r.date, r.platform, r.campaign].join('|'));
}

function dedupe(raw, parse, keyOf) {
  const seen = new Set();
  const rows = [];
  let duplicates = 0;
  let skipped = 0;
  raw.forEach(r => {
    const row = parse(r);
    if (!row) { skipped++; return; }
    const key = keyOf(row);
    if (seen.has(key)) { duplicates++; return; }
    seen.add(key);
    rows.push(row);
  });
  return { rows, read: raw.length, kept: rows.length, duplicates, skipped };
}

// ---------- parsing helpers ----------

function text(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function blank(v) {
  return v === null ? '' : v;
}

function titleCase(s) {
  return s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
}

function normalise(value, map, fallback) {
  const raw = text(value);
  const key = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (!key) return fallback;
  return map[key] || raw;
}

function parseMoney(v) {
  if (typeof v === 'number') return v;
  let s = text(v).replace(/[a-z$,\s]/gi, '');
  if (!s) return null;
  s = s.replace(/^\((.*)\)$/, '-$1');
  const n = Number(s);
  return isNaN(n) ? null : n;
}

function parseMinutes(v) {
  if (typeof v === 'number') return v;
  const s = text(v).toLowerCase();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const h = s.match(/(\d+)\s*h/);
  const m = s.match(/(\d+)\s*m/);
  if (!h && !m) return null;
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
}

// Store exports use local time, so dates are kept as yyyy-MM-dd strings to avoid timezone drift.
function parseWhen(v, tz) {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    const s = Utilities.formatDate(v, tz, 'yyyy-MM-dd HH:mm');
    return { day: s.slice(0, 10), time: s.slice(11) };
  }
  const s = text(v);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return stamp(m[1], m[2], m[3], m[4], m[5]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]m)?)?/i);
  if (m) {
    let hour = Number(m[4] || 0);
    if (m[6]) hour = hour % 12 + (m[6].toLowerCase() === 'pm' ? 12 : 0);
    return stamp(m[3], m[2], m[1], hour, m[5]);
  }
  return null;
}

function stamp(y, mo, d, h, mi) {
  return { day: `${y}-${pad(mo)}-${pad(d)}`, time: `${pad(h || 0)}:${pad(mi || 0)}` };
}

function pad(n) {
  return String(Number(n)).padStart(2, '0');
}

function dayMs(day) {
  const p = day.split('-').map(Number);
  return Date.UTC(p[0], p[1] - 1, p[2]);
}

function dayKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function addDays(day, n) {
  return dayKey(dayMs(day) + n * DAY);
}

function mondayOf(day) {
  const ms = dayMs(day);
  return dayKey(ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY);
}

function lastCompleteWeek(rows) {
  const latest = rows.reduce((max, r) => (r.date > max ? r.date : max), '');
  const monday = mondayOf(latest);
  return latest === addDays(monday, 6) ? monday : addDays(monday, -7);
}

function weekLabel(week) {
  const fmt = day => { const p = day.split('-'); return `${Number(p[2])} ${MONTHS[Number(p[1]) - 1]}`; };
  const end = addDays(week, 6);
  return `${fmt(week)} – ${fmt(end)} ${end.slice(0, 4)}`;
}

// ---------- KPIs ----------

function weekKpis(week, orders, tickets, ads) {
  const o = orders.filter(r => r.week === week && !r.cancelled);
  const t = tickets.filter(r => r.week === week);
  const gross = round2(sum(o.map(r => r.gross)));
  const refunds = round2(sum(o.map(r => r.refunded)));
  const net = round2(gross - refunds);
  const spend = round2(sum(ads.filter(r => r.week === week).map(r => r.spend)));
  const csat = t.map(r => r.csat).filter(v => v !== null);
  return {
    revenue: net,
    orders: o.length,
    aov: ratio(gross, o.length),
    refundRate: ratio(refunds, gross),
    adSpend: spend,
    roas: ratio(net, spend),
    tickets: t.length,
    ticketsPer100: ratio(t.length * 100, o.length),
    firstResponse: median(t.map(r => r.firstResponse).filter(v => v !== null)),
    csat: ratio(sum(csat), csat.length)
  };
}

function channelMix(week, orders) {
  const byChannel = {};
  orders.filter(r => r.week === week && !r.cancelled).forEach(r => {
    const c = byChannel[r.channel] || (byChannel[r.channel] = { orders: 0, net: 0 });
    c.orders++;
    c.net += r.net;
  });
  const total = sum(Object.keys(byChannel).map(k => byChannel[k].net));
  return Object.keys(byChannel)
    .map(k => [k, byChannel[k].orders, byChannel[k].net, ratio(byChannel[k].net, total)])
    .sort((a, b) => b[2] - a[2]);
}

function sum(values) {
  return values.reduce((a, b) => a + b, 0);
}

function ratio(a, b) {
  return b ? a / b : null;
}

function mean(values) {
  const v = values.filter(x => x !== null);
  return v.length ? sum(v) / v.length : null;
}

function median(values) {
  if (!values.length) return null;
  const v = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function change(now, before) {
  return now === null || !before ? null : (now - before) / before;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ---------- output ----------

function numberFormat(format, cfg) {
  return { money: cfg.money, money2: cfg.money2, int: '#,##0', pct: '0.0%', x: '0.00"x"', dec: '0.0', dec2: '0.00' }[format];
}

function display(v, format, cfg) {
  if (v === null) return '–';
  const commas = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  switch (format) {
    case 'money': return cfg.symbol + commas(Math.round(v));
    case 'money2': return cfg.symbol + commas(v.toFixed(2));
    case 'int': return commas(Math.round(v));
    case 'pct': return (v * 100).toFixed(1) + '%';
    case 'x': return v.toFixed(2) + 'x';
    case 'dec2': return v.toFixed(2);
    default: return v.toFixed(1);
  }
}

function signed(v) {
  return v === null ? '–' : (v > 0 ? '+' : '') + Math.round(v * 100) + '%';
}

function sheet(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function styleHeader(range) {
  range.setBackground(HEADER_BG).setFontColor('#ffffff').setFontWeight('bold');
}

function writeTable(ss, name, headers, rows, formats) {
  const sh = sheet(ss, name);
  sh.clear();
  styleHeader(sh.getRange(1, 1, 1, headers.length).setValues([headers]));
  if (rows.length) {
    sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
    Object.keys(formats).forEach(col => sh.getRange(2, Number(col), rows.length, 1).setNumberFormat(formats[col]));
  }
  sh.setFrozenRows(1);
}

function writeSummary(ss, cfg, week, report, weeks, kpis, mix, checks) {
  const sh = sheet(ss, TABS.summary);
  sh.clear();
  sh.setHiddenGridlines(true);
  const stamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'd MMM yyyy HH:mm');

  sh.getRange(1, 1).setValue(`${cfg.company} · Weekly Business Review`).setFontSize(16).setFontWeight('bold').setFontColor(HEADER_BG);
  sh.getRange(2, 1).setValue(`Week of ${weekLabel(week)} · ${cfg.currency} · generated ${stamp}`).setFontColor('#666666');

  const head = ['Metric', 'This week', 'Last week', 'vs last week', '4-week avg', 'vs 4-week avg', 'Status'];
  styleHeader(sh.getRange(4, 1, 1, head.length).setValues([head]));
  const rows = report.map(r => [r.metric.label, blank(r.current), blank(r.last), blank(r.vsLast), blank(r.avg), blank(r.vsAvg), r.status]);
  sh.getRange(5, 1, rows.length, head.length).setValues(rows);
  report.forEach((r, i) => {
    const f = numberFormat(r.metric.format, cfg);
    sh.getRange(5 + i, 2, 1, 4).setNumberFormats([[f, f, '+0%;-0%;0%', f]]);
  });
  sh.getRange(5, 6, rows.length, 1).setNumberFormat('+0%;-0%;0%');
  sh.getRange(5, 7, rows.length, 1).setBackgrounds(report.map(r => [STATUS_BG[r.status]])).setHorizontalAlignment('center');

  let row = 6 + rows.length;
  sh.getRange(row, 1).setValue('Last 8 weeks').setFontWeight('bold');
  const trendHead = ['Week starting', 'Net revenue', 'Orders', 'AOV', 'Refund rate', 'Ad spend', 'ROAS', 'Tickets', 'CSAT'];
  styleHeader(sh.getRange(row + 1, 1, 1, trendHead.length).setValues([trendHead]));
  const trend = weeks.map(w => {
    const k = kpis[w];
    return [w, k.revenue, k.orders, blank(k.aov), blank(k.refundRate), k.adSpend, blank(k.roas), k.tickets, blank(k.csat)];
  });
  sh.getRange(row + 2, 1, trend.length, trendHead.length).setValues(trend)
    .setNumberFormats(trend.map(() => ['d mmm yyyy', cfg.money, '#,##0', cfg.money2, '0.0%', cfg.money, '0.00"x"', '#,##0', '0.00']));
  sh.getRange(row + 1 + trend.length, 1, 1, trendHead.length).setFontWeight('bold');

  row += 3 + trend.length;
  sh.getRange(row, 1).setValue('Channel mix this week').setFontWeight('bold');
  const mixHead = ['Channel', 'Orders', 'Net revenue', 'Share of revenue'];
  styleHeader(sh.getRange(row + 1, 1, 1, mixHead.length).setValues([mixHead]));
  if (mix.length) {
    sh.getRange(row + 2, 1, mix.length, 4).setValues(mix)
      .setNumberFormats(mix.map(() => ['@', '#,##0', cfg.money, '0%']));
  }

  row += 3 + mix.length;
  sh.getRange(row, 1).setValue('Data checks').setFontWeight('bold');
  const checkHead = ['Source', 'Rows read', 'Rows kept', 'Duplicates removed', 'Rows skipped'];
  styleHeader(sh.getRange(row + 1, 1, 1, checkHead.length).setValues([checkHead]));
  sh.getRange(row + 2, 1, checks.length, checkHead.length)
    .setValues(checks.map(c => [c[0], c[1].read, c[1].kept, c[1].duplicates, c[1].skipped]));

  sh.setColumnWidth(1, 230);
  for (let c = 2; c <= 9; c++) sh.setColumnWidth(c, 105);
  return sh;
}

function writeAnomalies(ss, cfg, week, flagged) {
  const sh = sheet(ss, TABS.anomalies);
  sh.clear();
  const head = ['Week starting', 'Metric', 'This week', '4-week avg', 'Change', 'Status', 'What happened', 'What to check'];
  styleHeader(sh.getRange(1, 1, 1, head.length).setValues([head]));
  sh.setFrozenRows(1);
  if (!flagged.length) {
    sh.getRange(2, 1, 1, 2).setValues([[week, `No KPI moved more than ${Math.round(cfg.threshold * 100)}% vs its 4-week average.`]]);
    return;
  }
  const rows = flagged.map(r => [
    week, r.metric.label, r.current, r.avg, r.vsAvg, r.status,
    `${r.metric.label}: ${r.vsAvg > 0 ? 'up' : 'down'} ${Math.abs(Math.round(r.vsAvg * 100))}% vs the 4-week average ` +
      `(${display(r.avg, r.metric.format, cfg)} → ${display(r.current, r.metric.format, cfg)}).`,
    r.metric.hint
  ]);
  sh.getRange(2, 1, rows.length, head.length).setValues(rows);
  sh.getRange(2, 1, rows.length, 5).setNumberFormats(flagged.map(r => {
    const f = numberFormat(r.metric.format, cfg);
    return ['d mmm yyyy', '@', f, f, '+0%;-0%;0%'];
  }));
  sh.getRange(2, 6, rows.length, 1).setBackgrounds(flagged.map(r => [STATUS_BG[r.status]]));
  sh.getRange(2, 7, rows.length, 2).setWrap(true);
  sh.setColumnWidth(2, 210);
  sh.setColumnWidth(7, 360);
  sh.setColumnWidth(8, 360);
}

function exportPdf(ss, sh, name) {
  // DriveApp.getFiles() — keeps the Drive scope so the export URL is authorised
  SpreadsheetApp.flush();
  const url = `https://docs.google.com/spreadsheets/d/${ss.getId()}/export?format=pdf&gid=${sh.getSheetId()}` +
    '&size=A4&portrait=false&fitw=true&gridlines=false&sheetnames=false&printtitle=false&pagenum=UNDEFINED';
  const res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } });
  return res.getBlob().setName(name + '.pdf');
}

function sendReport(ss, cfg, week, report, flagged, pdf) {
  const colour = { Better: '#1a7f45', Worse: '#b42318', Watch: '#9a6700', OK: '#555555' };
  const cell = 'padding:6px 10px;border-bottom:1px solid #e5e7eb;';
  const rows = report.map(r =>
    `<tr><td style="${cell}">${r.metric.label}</td>` +
    `<td style="${cell}text-align:right"><b>${display(r.current, r.metric.format, cfg)}</b></td>` +
    `<td style="${cell}text-align:right">${signed(r.vsLast)}</td>` +
    `<td style="${cell}text-align:right">${signed(r.vsAvg)}</td>` +
    `<td style="${cell}color:${colour[r.status]}">${r.status}</td></tr>`).join('');
  const list = flagged.length
    ? '<ul>' + flagged.map(r => `<li><b>${r.metric.label}</b> ${signed(r.vsAvg)} vs 4-week avg. ${r.metric.hint}</li>`).join('') + '</ul>'
    : '<p>Nothing outside the normal range this week.</p>';

  const html =
    `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937">` +
    `<h2 style="color:${HEADER_BG};margin:0 0 4px">${cfg.company} · Weekly Business Review</h2>` +
    `<p style="margin:0 0 16px;color:#6b7280">Week of ${weekLabel(week)}</p>` +
    `<table style="border-collapse:collapse"><tr style="background:${HEADER_BG};color:#fff">` +
    `<th style="${cell}text-align:left">Metric</th><th style="${cell}">This week</th><th style="${cell}">vs last week</th>` +
    `<th style="${cell}">vs 4-week avg</th><th style="${cell}">Status</th></tr>${rows}</table>` +
    `<h3 style="margin:20px 0 4px">Worth a look</h3>${list}` +
    `<p><a href="${ss.getUrl()}">Open the full report</a>${pdf ? ' · PDF attached' : ''}</p></div>`;

  MailApp.sendEmail({
    to: cfg.emailTo,
    subject: `${cfg.company} WBR · week of ${weekLabel(week)}${flagged.length ? ` · ${flagged.length} flagged` : ''}`,
    htmlBody: html,
    name: 'Report Robot',
    attachments: pdf ? [pdf] : []
  });
}

function log(ss, row) {
  const sh = sheet(ss, TABS.log);
  if (sh.getLastRow() === 0) {
    styleHeader(sh.getRange(1, 1, 1, 9).setValues([['Run at', 'Week starting', 'Status', 'Rows cleaned',
      'Duplicates removed', 'Rows skipped', 'Anomalies', 'Emailed to', 'Seconds']]));
    sh.setFrozenRows(1);
  }
  sh.appendRow(row);
  sh.getRange(sh.getLastRow(), 1, 1, 2).setNumberFormats([['d mmm yyyy HH:mm', 'd mmm yyyy']]);
}
