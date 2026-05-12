const fs = require('fs');
const path = require('path');

function generateHTMLReport(data) {
  const { meta, tests } = data;
  const passRate = ((meta.passed / meta.total) * 100).toFixed(1);

  const categories = {};
  tests.forEach(t => {
    if (!categories[t.category]) categories[t.category] = [];
    categories[t.category].push(t);
  });

  const escapeHtml = (str) => {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/\n/g, '<br>');
  };

  let categorySections = '';
  for (const [cat, catTests] of Object.entries(categories)) {
    const catPass = catTests.filter(t => t.passed).length;
    const catTotal = catTests.length;

    let rows = '';
    catTests.forEach(t => {
      const badge = t.passed
        ? '<span class="badge pass">✅ PASS</span>'
        : '<span class="badge fail">❌ FAIL</span>';

      let stepsHtml = '';
      if (t.allStepResponses && t.allStepResponses.length > 1) {
        stepsHtml = '<div class="steps-detail"><strong>Full Conversation:</strong><ol>';
        t.allStepResponses.forEach(s => {
          stepsHtml += `<li><span class="step-label">User:</span> <code>${escapeHtml(s.message)}</code><br>`;
          stepsHtml += `<span class="step-label">Bot [${s.state}]:</span> ${escapeHtml(s.response.substring(0, 300))}${s.response.length > 300 ? '...' : ''}</li>`;
        });
        stepsHtml += '</ol></div>';
      }

      const finalResp = escapeHtml(t.actualResponse.substring(0, 500));

      rows += `
      <tr class="${t.passed ? 'row-pass' : 'row-fail'}">
        <td class="id-cell">${t.id}</td>
        <td class="name-cell">${escapeHtml(t.name)}</td>
        <td class="expected-cell">${escapeHtml(t.expected)}</td>
        <td class="response-cell"><div class="response-box">${finalResp}</div>${stepsHtml}</td>
        <td class="state-cell"><code>${t.state}</code><br><small>lang: ${t.lang}</small></td>
        <td class="result-cell">${badge}</td>
        <td class="notes-cell">${t.error ? `<span class="error-note">Error: ${escapeHtml(t.error)}</span>` : (t.passed ? 'Working as expected' : 'Needs investigation')}</td>
      </tr>`;
    });

    categorySections += `
    <div class="category-section">
      <div class="category-header">
        <h2>${escapeHtml(cat)}</h2>
        <span class="category-stats">${catPass}/${catTotal} passed</span>
      </div>
      <table>
        <thead>
          <tr>
            <th width="4%">#</th>
            <th width="14%">Message Sent</th>
            <th width="18%">Expected</th>
            <th width="30%">Actual Response</th>
            <th width="8%">State</th>
            <th width="8%">Pass/Fail</th>
            <th width="18%">Notes</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sakhi Bot — Test Report</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #0a0a0f;
    --surface: #12121a;
    --surface2: #1a1a27;
    --border: #2a2a3d;
    --text: #e4e4ef;
    --text-muted: #8888a4;
    --accent: #c084fc;
    --accent-glow: rgba(192, 132, 252, 0.15);
    --pass: #34d399;
    --pass-bg: rgba(52, 211, 153, 0.08);
    --fail: #f87171;
    --fail-bg: rgba(248, 113, 113, 0.08);
    --sakhi-pink: #f9a8d4;
    --sakhi-gold: #fbbf24;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Inter', sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    min-height: 100vh;
  }

  .hero {
    text-align: center;
    padding: 60px 20px 40px;
    background: linear-gradient(180deg, rgba(192,132,252,0.08) 0%, transparent 100%);
    border-bottom: 1px solid var(--border);
  }

  .hero h1 {
    font-size: 2.8rem;
    font-weight: 800;
    background: linear-gradient(135deg, var(--sakhi-pink), var(--accent), var(--sakhi-gold));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 8px;
  }

  .hero p { color: var(--text-muted); font-size: 1.1rem; }

  .meta-bar {
    display: flex;
    justify-content: center;
    gap: 40px;
    padding: 24px 20px;
    flex-wrap: wrap;
  }

  .meta-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 24px 36px;
    text-align: center;
    min-width: 160px;
  }

  .meta-card .value {
    font-size: 2.4rem;
    font-weight: 800;
  }

  .meta-card .label {
    font-size: 0.85rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-top: 4px;
  }

  .meta-card.total .value { color: var(--accent); }
  .meta-card.pass .value { color: var(--pass); }
  .meta-card.fail .value { color: var(--fail); }
  .meta-card.rate .value {
    background: linear-gradient(135deg, var(--pass), var(--accent));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .progress-bar-container {
    max-width: 600px;
    margin: 0 auto 32px;
    padding: 0 20px;
  }

  .progress-bar {
    height: 12px;
    background: var(--surface2);
    border-radius: 6px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    border-radius: 6px;
    background: linear-gradient(90deg, var(--pass), var(--accent));
    transition: width 1s ease;
  }

  .container { max-width: 1400px; margin: 0 auto; padding: 0 20px 60px; }

  .category-section { margin-bottom: 40px; }

  .category-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 0 12px;
    border-bottom: 2px solid var(--accent);
    margin-bottom: 0;
  }

  .category-header h2 {
    font-size: 1.3rem;
    font-weight: 700;
    color: var(--accent);
  }

  .category-stats {
    font-size: 0.9rem;
    color: var(--text-muted);
    font-weight: 500;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--surface);
    border-radius: 0 0 12px 12px;
    overflow: hidden;
  }

  thead th {
    background: var(--surface2);
    padding: 12px 14px;
    text-align: left;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--text-muted);
    font-weight: 600;
    border-bottom: 1px solid var(--border);
  }

  tbody td {
    padding: 14px;
    border-bottom: 1px solid var(--border);
    font-size: 0.88rem;
    vertical-align: top;
  }

  .row-pass { background: var(--pass-bg); }
  .row-fail { background: var(--fail-bg); }

  .id-cell { font-weight: 700; color: var(--accent); text-align: center; }
  .name-cell { font-weight: 600; }

  .response-box {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 0.82rem;
    line-height: 1.5;
    max-height: 150px;
    overflow-y: auto;
  }

  .badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 20px;
    font-weight: 700;
    font-size: 0.82rem;
  }

  .badge.pass { background: rgba(52,211,153,0.15); color: var(--pass); }
  .badge.fail { background: rgba(248,113,113,0.15); color: var(--fail); }

  .steps-detail {
    margin-top: 10px;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .steps-detail ol {
    padding-left: 18px;
    margin-top: 6px;
  }

  .steps-detail li {
    margin-bottom: 8px;
    border-left: 2px solid var(--border);
    padding-left: 10px;
  }

  .step-label { font-weight: 600; color: var(--accent); }
  code { background: var(--surface2); padding: 2px 6px; border-radius: 4px; font-size: 0.82rem; }
  .error-note { color: var(--fail); font-size: 0.82rem; }

  .footer {
    text-align: center;
    padding: 32px;
    color: var(--text-muted);
    font-size: 0.85rem;
    border-top: 1px solid var(--border);
  }

  @media (max-width: 900px) {
    .hero h1 { font-size: 1.8rem; }
    .meta-bar { gap: 16px; }
    .meta-card { padding: 16px 24px; min-width: 120px; }
    .meta-card .value { font-size: 1.8rem; }
    table { font-size: 0.8rem; }
    tbody td { padding: 10px 8px; }
  }
</style>
</head>
<body>
  <div class="hero">
    <h1>🌸 Sakhi Bot — Test Report</h1>
    <p>Automated WhatsApp Bot Testing Suite &middot; ${meta.timestamp}</p>
  </div>

  <div class="meta-bar">
    <div class="meta-card total"><div class="value">${meta.total}</div><div class="label">Total Tests</div></div>
    <div class="meta-card pass"><div class="value">${meta.passed}</div><div class="label">Passed</div></div>
    <div class="meta-card fail"><div class="value">${meta.failed}</div><div class="label">Failed</div></div>
    <div class="meta-card rate"><div class="value">${passRate}%</div><div class="label">Pass Rate</div></div>
  </div>

  <div class="progress-bar-container">
    <div class="progress-bar"><div class="progress-fill" style="width: ${passRate}%"></div></div>
  </div>

  <div class="container">
    ${categorySections}
  </div>

  <div class="footer">
    <p>Sakhi 🌸 — AI-Powered WhatsApp Companion for Domestic Violence Survivors</p>
    <p>Test run completed in ${meta.elapsed}s</p>
  </div>
</body>
</html>`;

  return html;
}

// Run if called directly — reads results.json and generates report
if (require.main === module) {
  const resultsPath = path.join(__dirname, '..', 'test-results', 'results.json');
  if (!fs.existsSync(resultsPath)) {
    console.error('❌ No results.json found. Run testRunner.js first.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  const html = generateHTMLReport(data);

  const outPath = path.join(__dirname, '..', 'test-results', 'report.html');
  fs.writeFileSync(outPath, html);
  console.log(`\n🌸 Report generated: ${outPath}`);
  console.log('Open it in your browser to view the beautiful test report!\n');
}

module.exports = { generateHTMLReport };
