// State
let capturedData = null;
let selectedFormat = 'react';
let isSelecting = false;

// Elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const captureFullBtn = document.getElementById('captureFullBtn');
const selectSectionBtn = document.getElementById('selectSectionBtn');
const exportLabel = document.getElementById('exportLabel');
const exportGrid = document.getElementById('exportGrid');
const exportBtn = document.getElementById('exportBtn');
const designSystem = document.getElementById('designSystem');
const outputArea = document.getElementById('outputArea');
const codeBlock = document.getElementById('codeBlock');
const copyBtn = document.getElementById('copyBtn');
const colorSwatches = document.getElementById('colorSwatches');
const fontList = document.getElementById('fontList');
const componentCount = document.getElementById('componentCount');

// ─── Status helpers ───────────────────────────────────────────
function setStatus(state, text) {
  statusDot.className = `status-dot ${state}`;
  statusText.textContent = text;
}

// ─── Format selection ─────────────────────────────────────────
document.querySelectorAll('.export-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.export-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    selectedFormat = chip.dataset.format;
    if (capturedData) renderOutput();
  });
});

// ─── Capture Full Page ────────────────────────────────────────
captureFullBtn.addEventListener('click', async () => {
  setStatus('active', 'Capturing page…');
  captureFullBtn.disabled = true;
  selectSectionBtn.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Inject content script if not already there
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/content.js']
    }).catch(() => {}); // already injected — ignore

    const response = await chrome.tabs.sendMessage(tab.id, { action: 'CAPTURE_FULL_PAGE' });

    if (response && response.success) {
      capturedData = response.data;
      setStatus('success', 'Page captured');
      showExportUI();
      renderDesignSystem(capturedData.designSystem);
    } else {
      throw new Error(response?.error || 'Capture failed');
    }
  } catch (err) {
    setStatus('error', 'Failed — try refreshing the page');
    console.error(err);
  } finally {
    captureFullBtn.disabled = false;
    selectSectionBtn.disabled = false;
  }
});

// ─── Select Section ───────────────────────────────────────────
selectSectionBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  setStatus('active', 'Click a section on the page…');
  isSelecting = true;

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content/content.js']
  }).catch(() => {});

  await chrome.tabs.sendMessage(tab.id, { action: 'START_SELECTION' });

  // Close popup so user can interact with page
  window.close();
});

// ─── Export Button ────────────────────────────────────────────
exportBtn.addEventListener('click', () => {
  if (!capturedData) return;
  renderOutput();
  outputArea.style.display = 'block';
});

// ─── Copy ─────────────────────────────────────────────────────
copyBtn.addEventListener('click', () => {
  const text = codeBlock.textContent;
  navigator.clipboard.writeText(text).then(() => {
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
  });
});

// ─── Show Export UI ───────────────────────────────────────────
function showExportUI() {
  exportLabel.style.display = 'block';
  exportGrid.style.display = 'flex';
  exportBtn.style.display = 'flex';
}

// ─── Design System Render ─────────────────────────────────────
function renderDesignSystem(ds) {
  if (!ds) return;
  designSystem.style.display = 'block';

  // Colors
  colorSwatches.innerHTML = '';
  (ds.colors || []).slice(0, 10).forEach(color => {
    const s = document.createElement('div');
    s.className = 'swatch';
    s.style.background = color;
    s.title = color;
    colorSwatches.appendChild(s);
  });

  // Fonts
  fontList.innerHTML = '';
  (ds.fonts || []).slice(0, 4).forEach(font => {
    const t = document.createElement('span');
    t.className = 'font-tag';
    t.textContent = font;
    fontList.appendChild(t);
  });

  // Components
  componentCount.textContent = `${ds.componentCount || 0} detected`;
}

// ─── Code Generation ─────────────────────────────────────────
function renderOutput() {
  if (!capturedData) return;
  let code = '';

  if (selectedFormat === 'react') {
    code = generateReact(capturedData);
  } else if (selectedFormat === 'tailwind') {
    code = generateTailwind(capturedData);
  } else if (selectedFormat === 'html') {
    code = generateHTML(capturedData);
  } else if (selectedFormat === 'json') {
    code = JSON.stringify(capturedData, null, 2);
  }

  codeBlock.textContent = code;
  outputArea.style.display = 'block';
}

// ─── React Generator ─────────────────────────────────────────
function generateReact(data) {
  const { title, sections, designSystem: ds } = data;
  const componentName = toComponentName(title || 'Page');

  const sectionComponents = (sections || []).map((sec, i) => {
    const name = toComponentName(sec.type || `Section${i + 1}`);
    return `function ${name}() {\n  return (\n    <section className="${toTailwindClasses(sec.styles)}">\n      {/* ${sec.type || 'Section'} */}\n      ${sec.textContent ? `<p>${escapeHtml(sec.textContent.slice(0, 80))}</p>` : ''}\n    </section>\n  );\n}`;
  }).join('\n\n');

  return `import React from 'react';

${sectionComponents}

export default function ${componentName}() {
  return (
    <main className="min-h-screen">
      ${(sections || []).map((sec, i) => `<${toComponentName(sec.type || `Section${i + 1}`)} />`).join('\n      ')}
    </main>
  );
}`;
}

// ─── Tailwind Generator ───────────────────────────────────────
function generateTailwind(data) {
  const { sections } = data;
  const lines = ['<!-- Generated by UI Clone Studio -->', ''];
  (sections || []).forEach((sec, i) => {
    const classes = toTailwindClasses(sec.styles);
    lines.push(`<!-- ${sec.type || `Section ${i + 1}`} -->`);
    lines.push(`<section class="${classes}">`);
    if (sec.textContent) lines.push(`  <p>${escapeHtml(sec.textContent.slice(0, 100))}</p>`);
    lines.push('</section>');
    lines.push('');
  });
  return lines.join('\n');
}

// ─── HTML/CSS Generator ───────────────────────────────────────
function generateHTML(data) {
  const { title, sections, designSystem: ds } = data;

  const cssVars = (ds?.colors || []).slice(0, 5).map((c, i) => `  --color-${i + 1}: ${c};`).join('\n');
  const sectionHTML = (sections || []).map((sec, i) => {
    const inlineStyle = stylesToCSS(sec.styles);
    return `  <section class="section-${i + 1}" style="${inlineStyle}">\n    ${sec.textContent ? `<p>${escapeHtml(sec.textContent.slice(0, 100))}</p>` : `<!-- ${sec.type || 'section'} -->`}\n  </section>`;
  }).join('\n\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title || 'Cloned Page')}</title>
  <style>
    :root {
${cssVars}
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: ${ds?.fonts?.[0] || 'sans-serif'}; }
  </style>
</head>
<body>
${sectionHTML}
</body>
</html>`;
}

// ─── Utilities ────────────────────────────────────────────────
function toComponentName(str) {
  return str.replace(/[^a-zA-Z0-9 ]/g, '').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toTailwindClasses(styles) {
  if (!styles) return 'w-full py-8 px-4';
  const classes = [];

  const bgMap = { '#ffffff': 'bg-white', '#000000': 'bg-black', '#f3f4f6': 'bg-gray-100', '#1f2937': 'bg-gray-800' };
  if (styles.backgroundColor && bgMap[styles.backgroundColor]) classes.push(bgMap[styles.backgroundColor]);

  const pdMap = { '8px': 'p-2', '12px': 'p-3', '16px': 'p-4', '24px': 'p-6', '32px': 'p-8', '48px': 'p-12', '64px': 'p-16' };
  const pad = styles.padding || styles.paddingTop;
  if (pad && pdMap[pad]) classes.push(pdMap[pad]);

  if (styles.display === 'flex') {
    classes.push('flex');
    if (styles.flexDirection === 'column') classes.push('flex-col');
    if (styles.justifyContent === 'center') classes.push('justify-center');
    if (styles.alignItems === 'center') classes.push('items-center');
  }

  if (styles.textAlign === 'center') classes.push('text-center');

  return classes.length ? classes.join(' ') : 'w-full py-8 px-4';
}

function stylesToCSS(styles) {
  if (!styles) return '';
  return Object.entries(styles).filter(([, v]) => v).map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v}`).join(';');
}

// ─── Listen for section capture from content script ──────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'SECTION_CAPTURED') {
    capturedData = msg.data;
    setStatus('success', 'Section captured');
    showExportUI();
    renderDesignSystem(capturedData.designSystem);
    renderOutput();
  }
});
