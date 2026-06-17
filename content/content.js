// ─── Guard: only inject once ──────────────────────────────────
if (window.__uiCloneStudioInjected) {
  // Already injected, skip
} else {
  window.__uiCloneStudioInjected = true;

  let overlay = null;
  let highlightEl = null;
  let selectionActive = false;
  let toolbar = null;

  // ─── Message Listener ───────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'CAPTURE_FULL_PAGE') {
      try {
        const data = captureFullPage();
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (msg.action === 'START_SELECTION') {
      startSelectionMode();
      sendResponse({ success: true });
      return true;
    }
  });

  // ─── Full Page Capture ──────────────────────────────────────
  function captureFullPage() {
    const sections = extractSections(document.body);
    const designSystem = extractDesignSystem();

    return {
      title: document.title,
      url: location.href,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      sections,
      designSystem,
      capturedAt: new Date().toISOString()
    };
  }

  // ─── Section Extraction ─────────────────────────────────────
  function extractSections(root) {
    const sectionTags = ['header', 'nav', 'main', 'section', 'article', 'aside', 'footer', 'div[class*="hero"]', 'div[class*="banner"]', 'div[class*="pricing"]', 'div[class*="feature"]', 'div[class*="testimonial"]', 'div[class*="footer"]', 'div[class*="cta"]'];

    const candidates = [];

    // Walk top-level meaningful elements
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();

    while (node) {
      const tag = node.tagName.toLowerCase();
      const rect = node.getBoundingClientRect();
      const styles = getComputedStyle(node);

      // Skip tiny, invisible, or deeply nested elements for top-level pass
      if (
        rect.width < 100 || rect.height < 40 ||
        styles.display === 'none' || styles.visibility === 'hidden' ||
        styles.opacity === '0'
      ) {
        node = walker.nextNode();
        continue;
      }

      const isSemanticSection = ['header', 'nav', 'main', 'section', 'article', 'aside', 'footer'].includes(tag);
      const isLargeDiv = tag === 'div' && rect.height > 100 && rect.width > window.innerWidth * 0.5;

      if (isSemanticSection || isLargeDiv) {
        candidates.push(analyzeElement(node));
        // Don't recurse into sections we've already captured
        node = skipSubtree(walker, node);
        continue;
      }

      node = walker.nextNode();
    }

    return candidates.slice(0, 20); // cap at 20
  }

  function skipSubtree(walker, node) {
    // Move to next sibling or parent's sibling
    let next = walker.nextSibling();
    if (!next) {
      walker.parentNode();
      next = walker.nextSibling();
    }
    return next;
  }

  // ─── Analyze a single element ────────────────────────────────
  function analyzeElement(el) {
    const styles = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();

    return {
      tag,
      type: detectComponentType(el, styles),
      classes: Array.from(el.classList).slice(0, 8).join(' '),
      textContent: el.innerText?.trim().slice(0, 200) || '',
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y + window.scrollY),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      styles: {
        display: styles.display,
        flexDirection: styles.flexDirection,
        justifyContent: styles.justifyContent,
        alignItems: styles.alignItems,
        backgroundColor: rgbToHex(styles.backgroundColor),
        color: rgbToHex(styles.color),
        fontSize: styles.fontSize,
        fontFamily: styles.fontFamily.split(',')[0].replace(/['"]/g, '').trim(),
        fontWeight: styles.fontWeight,
        padding: styles.padding,
        paddingTop: styles.paddingTop,
        paddingBottom: styles.paddingBottom,
        margin: styles.margin,
        borderRadius: styles.borderRadius,
        textAlign: styles.textAlign,
        gridTemplateColumns: styles.gridTemplateColumns
      },
      children: el.children.length
    };
  }

  // ─── Component Type Detection ────────────────────────────────
  function detectComponentType(el, styles) {
    const tag = el.tagName.toLowerCase();
    const cls = (el.className || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const combined = cls + ' ' + id;

    if (tag === 'nav' || /nav|navbar|menu/.test(combined)) return 'Navbar';
    if (tag === 'header' || /hero|banner|jumbotron/.test(combined)) return 'Hero';
    if (tag === 'footer' || /footer/.test(combined)) return 'Footer';
    if (/pricing|plan|tier/.test(combined)) return 'Pricing';
    if (/feature|benefit/.test(combined)) return 'Features';
    if (/testimonial|review|feedback/.test(combined)) return 'Testimonials';
    if (/cta|call-to-action|signup/.test(combined)) return 'CTA';
    if (/contact|form/.test(combined)) return 'Contact';
    if (/team|about/.test(combined)) return 'About';
    if (/faq|accordion/.test(combined)) return 'FAQ';
    if (/card|grid|list/.test(combined)) return 'Card Grid';
    if (tag === 'section') return 'Section';
    if (tag === 'main') return 'Main Content';
    if (tag === 'article') return 'Article';
    if (tag === 'aside') return 'Sidebar';
    return 'Container';
  }

  // ─── Design System Extraction ─────────────────────────────────
  function extractDesignSystem() {
    const colors = new Set();
    const fonts = new Set();
    let componentCount = 0;

    const sampleEls = document.querySelectorAll('*');
    const limit = Math.min(sampleEls.length, 300);

    for (let i = 0; i < limit; i++) {
      const el = sampleEls[i];
      const s = getComputedStyle(el);

      // Colors
      const bg = rgbToHex(s.backgroundColor);
      const col = rgbToHex(s.color);
      if (bg && bg !== '#000000' && bg !== '#ffffff' && bg !== 'transparent') colors.add(bg);
      if (col && col !== '#000000' && col !== '#ffffff') colors.add(col);

      // Fonts
      const font = s.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
      if (font && font !== 'inherit' && font !== 'initial') fonts.add(font);
    }

    // Count interactive/component elements
    const componentSelectors = ['button', 'a[href]', 'input', 'select', 'textarea', '[class*="card"]', '[class*="btn"]', '[class*="badge"]'];
    componentSelectors.forEach(sel => {
      componentCount += document.querySelectorAll(sel).length;
    });

    return {
      colors: Array.from(colors).slice(0, 12),
      fonts: Array.from(fonts).slice(0, 5),
      componentCount: Math.min(componentCount, 999)
    };
  }

  // ─── Selection Mode ──────────────────────────────────────────
  function startSelectionMode() {
    selectionActive = true;
    createOverlay();
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('click', onElementClick, true);
    document.addEventListener('keydown', onKeyDown);
  }

  function stopSelectionMode() {
    selectionActive = false;
    removeOverlay();
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('click', onElementClick, true);
    document.removeEventListener('keydown', onKeyDown);
  }

  function createOverlay() {
    overlay = document.createElement('div');
    overlay.id = '__uics_overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      z-index: 2147483646;
      pointer-events: none;
    `;
    document.body.appendChild(overlay);

    highlightEl = document.createElement('div');
    highlightEl.id = '__uics_highlight';
    highlightEl.style.cssText = `
      position: absolute;
      border: 2px solid #2563EB;
      background: rgba(37, 99, 235, 0.07);
      border-radius: 4px;
      pointer-events: none;
      transition: all 0.08s ease;
      z-index: 2147483647;
    `;
    document.body.appendChild(highlightEl);

    // Info tooltip
    toolbar = document.createElement('div');
    toolbar.id = '__uics_toolbar';
    toolbar.style.cssText = `
      position: fixed;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      background: #1e293b;
      color: #f8fafc;
      font-family: -apple-system, sans-serif;
      font-size: 12px;
      font-weight: 500;
      padding: 7px 16px;
      border-radius: 99px;
      z-index: 2147483648;
      pointer-events: none;
      box-shadow: 0 4px 20px rgba(0,0,0,0.25);
      letter-spacing: 0.1px;
    `;
    toolbar.textContent = '🎯 Click any section to capture — Esc to cancel';
    document.body.appendChild(toolbar);
  }

  function removeOverlay() {
    ['__uics_overlay', '__uics_highlight', '__uics_toolbar'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
    overlay = null;
    highlightEl = null;
    toolbar = null;
  }

  function onMouseMove(e) {
    if (!selectionActive || !highlightEl) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || target === highlightEl || target === overlay) return;

    const rect = target.getBoundingClientRect();
    highlightEl.style.top = (rect.top + window.scrollY) + 'px';
    highlightEl.style.left = rect.left + 'px';
    highlightEl.style.width = rect.width + 'px';
    highlightEl.style.height = rect.height + 'px';

    if (toolbar) {
      const type = detectComponentType(target, getComputedStyle(target));
      toolbar.textContent = `📦 ${type} — click to capture`;
    }
  }

  function onElementClick(e) {
    if (!selectionActive) return;
    e.preventDefault();
    e.stopPropagation();

    const target = e.target;
    if (!target || target === highlightEl || target === overlay) return;

    const elementData = analyzeElement(target);
    const designSystem = extractDesignSystem();

    const data = {
      title: document.title,
      url: location.href,
      sections: [elementData],
      designSystem,
      capturedAt: new Date().toISOString()
    };

    stopSelectionMode();

    chrome.runtime.sendMessage({ action: 'SECTION_CAPTURED', data });
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') stopSelectionMode();
  }

  // ─── Utilities ───────────────────────────────────────────────
  function rgbToHex(rgb) {
    if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return null;
    const result = rgb.match(/\d+/g);
    if (!result || result.length < 3) return null;
    const [r, g, b] = result.map(Number);
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }
}
