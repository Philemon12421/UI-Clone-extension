// ─── UI Clone Studio v2.0 ─────────────────────────────────────
// Enhanced design extraction & cloning tool for UI designers
// ────────────────────────────────────────────────────────────────

if (!window.__uiCloneStudioInjected) {
  window.__uiCloneStudioInjected = true;

  // ─── State ────────────────────────────────────────────────
  const state = {
    overlay: null,
    highlightEl: null,
    rulerEl: null,
    toolbar: null,
    infoPanel: null,
    selectionActive: false,
    recordingActive: false,
    clickHistory: [],
    capturedComponents: [],
    selectedNodes: new Set(),
    hoveredElement: null,
    clipboard: null,
    designSystem: null,
    settings: {
      showRuler: true,
      showGrid: false,
      snapToElements: false,
      captureDepth: 5,
      colorPaletteSize: 20,
      includeShadows: true,
      includeAnimations: true,
      includeMediaQueries: true,
      exportFormat: 'json' // json | css | tailwind | figma
    }
  };

  // ─── Message Listener ─────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const handlers = {
      CAPTURE_FULL_PAGE: () => captureFullPage(),
      START_SELECTION: () => { startSelectionMode(); return { success: true }; },
      STOP_SELECTION: () => { stopSelectionMode(); return { success: true }; },
      EXTRACT_DESIGN_SYSTEM: () => ({ success: true, data: extractFullDesignSystem() }),
      EXPORT_COMPONENT: () => handleExport(msg.format),
      TOGGLE_RULER: () => { state.settings.showRuler = !state.settings.showRuler; toggleRuler(); },
      TOGGLE_GRID: () => { state.settings.showGrid = !state.settings.showGrid; toggleGrid(); },
      CAPTURE_COMPONENT_TREE: () => ({ success: true, data: captureComponentTree() }),
      COMPARE_SECTIONS: () => ({ success: true, data: compareCapturedSections(msg.indices) }),
      START_RECORDING: () => startRecording(),
      STOP_RECORDING: () => stopRecording(),
      GET_STATE: () => ({ success: true, state: summarizeState() }),
      RESET: () => { resetAll(); return { success: true }; }
    };

    const handler = handlers[msg.action];
    if (handler) {
      try {
        const result = handler();
        sendResponse(result);
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    }
    return true;
  });

  // ─── Full Page Capture (Enhanced) ─────────────────────────
  function captureFullPage() {
    const sections = extractAllSections(document.body);
    const designSystem = extractFullDesignSystem();
    const layout = analyzePageLayout();
    const interactions = captureInteractions();
    const responsiveStates = captureResponsiveStates();
    const assets = captureAssets();

    return {
      meta: {
        title: document.title,
        url: location.href,
        viewport: { 
          width: window.innerWidth, 
          height: window.innerHeight,
          scrollHeight: document.documentElement.scrollHeight
        },
        capturedAt: new Date().toISOString(),
        userAgent: navigator.userAgent
      },
      designSystem,
      layout,
      sections,
      interactions,
      responsiveStates,
      assets,
      statistics: computeStatistics(sections, designSystem)
    };
  }

  // ─── Advanced Section Extraction ──────────────────────────
  function extractAllSections(root) {
    const candidates = [];
    const seen = new WeakSet();
    
    // Multi-strategy extraction
    const strategies = [
      extractSemanticSections,
      extractVisualSections,
      extractGridSections,
      extractFlexSections,
      extractCommonPatterns
    ];

    for (const strategy of strategies) {
      const results = strategy(root, seen);
      candidates.push(...results);
    }

    // Deduplicate by bounding rect proximity
    return deduplicateSections(candidates).slice(0, 30);
  }

  function extractSemanticSections(root, seen) {
    const sections = [];
    const selectors = [
      'header', 'nav', 'main', 'section', 'article', 'aside', 'footer',
      '[role="banner"]', '[role="navigation"]', '[role="main"]', 
      '[role="region"]', '[role="contentinfo"]', '[role="complementary"]'
    ];
    
    for (const sel of selectors) {
      root.querySelectorAll(sel).forEach(el => {
        if (!seen.has(el) && isVisible(el)) {
          seen.add(el);
          sections.push(deepAnalyzeElement(el, 0));
        }
      });
    }
    return sections;
  }

  function extractVisualSections(root, seen) {
    const sections = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();

    while (node) {
      if (!seen.has(node) && isVisible(node)) {
        const rect = node.getBoundingClientRect();
        const styles = getComputedStyle(node);
        
        // Detect visual "section" boundaries
        if (isVisualBoundary(node, rect, styles)) {
          seen.add(node);
          sections.push(deepAnalyzeElement(node, 0));
          node = skipSubtree(walker, node);
          continue;
        }
      }
      node = walker.nextNode();
    }
    return sections;
  }

  function isVisualBoundary(el, rect, styles) {
    const tag = el.tagName.toLowerCase();
    const isLargeEnough = rect.height > 80 && rect.width > window.innerWidth * 0.4;
    const hasBackground = styles.backgroundColor && 
      styles.backgroundColor !== 'rgba(0, 0, 0, 0)' && 
      styles.backgroundColor !== 'transparent';
    const hasBorder = parseFloat(styles.borderTopWidth) > 0 || 
      parseFloat(styles.borderBottomWidth) > 0;
    const hasMargin = parseFloat(styles.marginTop) > 20 || 
      parseFloat(styles.marginBottom) > 20;
    const hasPadding = parseFloat(styles.paddingTop) > 20 || 
      parseFloat(styles.paddingBottom) > 20;

    return (isLargeEnough && (hasBackground || hasBorder || hasMargin || hasPadding)) ||
      ['header', 'footer', 'section', 'article', 'main', 'nav', 'aside'].includes(tag);
  }

  function extractGridSections(root, seen) {
    const sections = [];
    root.querySelectorAll('[style*="grid"], [class*="grid"]').forEach(el => {
      if (!seen.has(el) && isVisible(el)) {
        const styles = getComputedStyle(el);
        if (styles.display === 'grid' || styles.display === 'inline-grid') {
          seen.add(el);
          sections.push(deepAnalyzeElement(el, 0));
        }
      }
    });
    return sections;
  }

  function extractFlexSections(root, seen) {
    const sections = [];
    root.querySelectorAll('[style*="flex"], [class*="flex"]').forEach(el => {
      if (!seen.has(el) && isVisible(el) && el.children.length >= 3) {
        const styles = getComputedStyle(el);
        if (styles.display === 'flex' || styles.display === 'inline-flex') {
          const rect = el.getBoundingClientRect();
          if (rect.height > 60 && rect.width > window.innerWidth * 0.3) {
            seen.add(el);
            sections.push(deepAnalyzeElement(el, 0));
          }
        }
      }
    });
    return sections;
  }

  function extractCommonPatterns(root, seen) {
    const patterns = {
      hero: ['[class*="hero"]', '[class*="banner"]', '[class*="jumbotron"]', '[class*="masthead"]'],
      pricing: ['[class*="pricing"]', '[class*="plan"]', '[class*="tier"]', '[class*="package"]'],
      features: ['[class*="feature"]', '[class*="benefit"]', '[class*="service"]', '[class*="capability"]'],
      testimonials: ['[class*="testimonial"]', '[class*="review"]', '[class*="feedback"]', '[class*="quote"]'],
      cta: ['[class*="cta"]', '[class*="call-to-action"]', '[class*="signup"]', '[class*="subscribe"]'],
      footer: ['[class*="footer"]', '[class*="foot"]', '[class*="bottom-bar"]'],
      nav: ['[class*="nav"]', '[class*="navbar"]', '[class*="menu"]', '[class*="navigation"]'],
      stats: ['[class*="stat"]', '[class*="counter"]', '[class*="metric"]', '[class*="number"]'],
      faq: ['[class*="faq"]', '[class*="accordion"]', '[class*="question"]'],
      team: ['[class*="team"]', '[class*="member"]', '[class*="people"]', '[class*="staff"]'],
      contact: ['[class*="contact"]', '[class*="form"]', '[class*="get-in-touch"]']
    };

    const sections = [];
    for (const [type, selectors] of Object.entries(patterns)) {
      for (const sel of selectors) {
        const els = root.querySelectorAll(sel);
        for (const el of els) {
          if (!seen.has(el) && isVisible(el)) {
            seen.add(el);
            const analysis = deepAnalyzeElement(el, 0);
            analysis.detectedPattern = type;
            sections.push(analysis);
            break; // One per pattern type to avoid noise
          }
        }
      }
    }
    return sections;
  }

  // ─── Deep Element Analysis ─────────────────────────────────
  function deepAnalyzeElement(el, depth) {
    if (depth > state.settings.captureDepth || !el) return null;

    const styles = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    const children = [];

    // Capture children
    for (let i = 0; i < el.children.length && i < 15; i++) {
      const child = el.children[i];
      if (isVisible(child)) {
        const childData = deepAnalyzeElement(child, depth + 1);
        if (childData) children.push(childData);
      }
    }

    return {
      tag,
      id: el.id || null,
      classes: Array.from(el.classList).join(' '),
      type: detectAdvancedComponentType(el, styles),
      role: el.getAttribute('role') || null,
      ariaLabel: el.getAttribute('aria-label') || null,
      depth,
      text: sanitizeText(el.innerText),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y + window.scrollY),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left)
      },
      boxModel: {
        margin: parseBoxValue(styles.margin),
        border: parseBoxValue(styles.borderWidth),
        padding: parseBoxValue(styles.padding),
        borderRadii: parseBorderRadii(styles)
      },
      layout: {
        display: styles.display,
        position: styles.position,
        flexDirection: styles.flexDirection,
        flexWrap: styles.flexWrap,
        justifyContent: styles.justifyContent,
        alignItems: styles.alignItems,
        alignContent: styles.alignContent,
        gap: styles.gap,
        gridTemplateColumns: styles.gridTemplateColumns,
        gridTemplateRows: styles.gridTemplateRows,
        gridColumn: styles.gridColumn,
        gridRow: styles.gridRow,
        order: styles.order,
        flexGrow: styles.flexGrow,
        flexShrink: styles.flexShrink,
        flexBasis: styles.flexBasis
      },
      typography: {
        fontFamily: parseFontFamily(styles.fontFamily),
        fontSize: styles.fontSize,
        fontWeight: styles.fontWeight,
        fontStyle: styles.fontStyle,
        lineHeight: styles.lineHeight,
        letterSpacing: styles.letterSpacing,
        textAlign: styles.textAlign,
        textTransform: styles.textTransform,
        textDecoration: styles.textDecoration,
        color: rgbToHex(styles.color),
        wordSpacing: styles.wordSpacing,
        whiteSpace: styles.whiteSpace
      },
      visual: {
        backgroundColor: rgbaToRgb(styles.backgroundColor),
        backgroundImage: styles.backgroundImage !== 'none' ? styles.backgroundImage : null,
        backgroundSize: styles.backgroundSize,
        backgroundPosition: styles.backgroundPosition,
        backgroundRepeat: styles.backgroundRepeat,
        color: rgbToHex(styles.color),
        opacity: styles.opacity,
        boxShadow: styles.boxShadow !== 'none' ? styles.boxShadow : null,
        textShadow: styles.textShadow !== 'none' ? styles.textShadow : null,
        backdropFilter: styles.backdropFilter !== 'none' ? styles.backdropFilter : null,
        mixBlendMode: styles.mixBlendMode !== 'normal' ? styles.mixBlendMode : null,
        border: {
          top: `${styles.borderTopWidth} ${styles.borderTopStyle} ${rgbToHex(styles.borderTopColor)}`,
          right: `${styles.borderRightWidth} ${styles.borderRightStyle} ${rgbToHex(styles.borderRightColor)}`,
          bottom: `${styles.borderBottomWidth} ${styles.borderBottomStyle} ${rgbToHex(styles.borderBottomColor)}`,
          left: `${styles.borderLeftWidth} ${styles.borderLeftStyle} ${rgbToHex(styles.borderLeftColor)}`
        },
        borderRadius: {
          topLeft: styles.borderTopLeftRadius,
          topRight: styles.borderTopRightRadius,
          bottomRight: styles.borderBottomRightRadius,
          bottomLeft: styles.borderBottomLeftRadius
        },
        outline: styles.outline !== 'none' ? styles.outline : null,
        overflow: styles.overflow
      },
      spacing: {
        marginTop: styles.marginTop,
        marginRight: styles.marginRight,
        marginBottom: styles.marginBottom,
        marginLeft: styles.marginLeft,
        paddingTop: styles.paddingTop,
        paddingRight: styles.paddingRight,
        paddingBottom: styles.paddingBottom,
        paddingLeft: styles.paddingLeft
      },
      dimension: {
        width: styles.width,
        height: styles.height,
        minWidth: styles.minWidth,
        maxWidth: styles.maxWidth,
        minHeight: styles.minHeight,
        maxHeight: styles.maxHeight,
        aspectRatio: styles.aspectRatio
      },
      interactive: {
        cursor: styles.cursor,
        pointerEvents: styles.pointerEvents,
        userSelect: styles.userSelect,
        tabIndex: el.tabIndex,
        isFocusable: el.matches(':focus') || el.matches(':focus-within'),
        isHoverable: hasHoverStyles(el),
        isClickable: ['a', 'button', 'input', 'select', 'textarea'].includes(tag) || 
          el.getAttribute('onclick') || 
          styles.cursor === 'pointer'
      },
      pseudoStates: capturePseudoStates(el),
      mediaQueries: captureMediaQueries(el),
      transitions: captureTransitions(styles),
      animations: captureAnimations(styles),
      svgDetails: tag === 'svg' ? extractSVGDetails(el) : null,
      formDetails: ['input', 'select', 'textarea'].includes(tag) ? extractFormDetails(el) : null,
      linkDetails: tag === 'a' ? { href: el.href, target: el.target, rel: el.rel } : null,
      imageDetails: tag === 'img' ? extractImageDetails(el) : null,
      computedAccessibility: {
        ariaLabel: el.getAttribute('aria-label') || null,
        ariaRole: el.getAttribute('role') || null,
        ariaHidden: el.getAttribute('aria-hidden') || null,
        ariaExpanded: el.getAttribute('aria-expanded') || null,
        tabIndex: el.tabIndex,
        hasAlt: !!el.getAttribute('alt'),
        hasAriaLabel: !!el.getAttribute('aria-label') || !!el.getAttribute('aria-labelledby')
      },
      textNodes: extractTextNodes(el),
      links: extractLinks(el),
      images: extractImages(el),
      children,
      childCount: children.length,
      descendantCount: countDescendants(el)
    };
  }

  // ─── Full Design System Extraction ─────────────────────────
  function extractFullDesignSystem() {
    const elements = document.querySelectorAll('*');
    const sampleSize = Math.min(elements.length, 500);

    const ds = {
      colors: { primary: new Set(), secondary: new Set(), accent: new Set(), 
                neutral: new Set(), semantic: new Set(), gradients: [] },
      typography: { fonts: new Map(), sizes: new Set(), weights: new Set(), 
                    lineHeights: new Set(), letterSpacings: new Set() },
      spacing: { margins: new Set(), paddings: new Set(), gaps: new Set() },
      borderRadius: new Set(),
      boxShadows: new Set(),
      textShadows: new Set(),
      transitions: new Set(),
      animations: new Set(),
      opacity: new Set(),
      zIndex: new Set(),
      layoutPatterns: new Set(),
      mediaQueries: new Set()
    };

    for (let i = 0; i < sampleSize; i++) {
      const el = elements[i];
      if (!isVisible(el)) continue;
      const s = getComputedStyle(el);
      const tag = el.tagName.toLowerCase();

      // Colors
      const bg = rgbaToRgb(s.backgroundColor);
      const color = rgbToHex(s.color);
      const borderColor = rgbToHex(s.borderColor);
      const accentColor = rgbToHex(s.accentColor);
      
      classifyColor(bg, el, ds.colors);
      classifyColor(color, el, ds.colors);
      if (borderColor && borderColor !== '#000000') classifyColor(borderColor, el, ds.colors, 'border');
      if (accentColor) classifyColor(accentColor, el, ds.colors, 'accent');

      // Gradients
      if (s.backgroundImage && s.backgroundImage.includes('gradient')) {
        ds.colors.gradients.push(s.backgroundImage);
      }

      // Typography
      const font = parseFontFamily(s.fontFamily);
      if (font && font !== 'inherit') {
        if (!ds.typography.fonts.has(font)) {
          ds.typography.fonts.set(font, { count: 0, weights: new Set(), sizes: new Set() });
        }
        const fontData = ds.typography.fonts.get(font);
        fontData.count++;
        fontData.weights.add(s.fontWeight);
        fontData.sizes.add(s.fontSize);
      }

      ds.typography.sizes.add(s.fontSize);
      ds.typography.weights.add(s.fontWeight);
      ds.typography.lineHeights.add(s.lineHeight);
      if (s.letterSpacing !== 'normal') ds.typography.letterSpacings.add(s.letterSpacing);

      // Spacing
      ['margin', 'padding'].forEach(prop => {
        ['Top', 'Right', 'Bottom', 'Left'].forEach(side => {
          const val = s[prop + side];
          if (val !== '0px') ds.spacing[prop + 's'].add(val);
        });
      });
      if (s.gap && s.gap !== 'normal') ds.spacing.gaps.add(s.gap);

      // Border radius
      if (s.borderRadius !== '0px') ds.borderRadius.add(s.borderRadius);

      // Shadows
      if (s.boxShadow && s.boxShadow !== 'none') ds.boxShadows.add(normalizeShadow(s.boxShadow));
      if (s.textShadow && s.textShadow !== 'none') ds.textShadows.add(s.textShadow);

      // Transitions
      if (s.transition && s.transition !== 'none' && s.transition !== 'all 0s ease 0s') {
        ds.transitions.add(s.transition);
      }

      // Animations
      if (s.animation && s.animation !== 'none') ds.animations.add(s.animation);

      // Opacity
      if (s.opacity !== '1') ds.opacity.add(s.opacity);

      // Z-index
      if (s.zIndex !== 'auto') ds.zIndex.add(s.zIndex);

      // Layout patterns
      if (s.display === 'flex' || s.display === 'inline-flex') {
        ds.layoutPatterns.add(`flex-${s.flexDirection}-${s.justifyContent}-${s.alignItems}`);
      }
      if (s.display === 'grid' || s.display === 'inline-grid') {
        ds.layoutPatterns.add(`grid-${s.gridTemplateColumns}`);
      }
    }

    // Collect global media queries
    if (state.settings.includeMediaQueries) {
      for (const ss of document.styleSheets) {
        try {
          for (const rule of ss.cssRules || []) {
            if (rule instanceof CSSMediaRule) {
              ds.mediaQueries.add(rule.conditionText);
            }
          }
        } catch (e) { /* cross-origin stylesheet */ }
      }
    }

    return finalizeDesignSystem(ds);
  }

  function classifyColor(color, el, colorBucket, context = 'bg') {
    if (!color || color === '#000000' || color === '#ffffff' || color === 'transparent' || 
        color === 'rgba(0, 0, 0, 0)') return;

    const tag = el.tagName.toLowerCase();
    const cls = (el.className || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const combined = `${cls} ${id}`;

    // Semantic classification
    if (/primary|btn-primary|bg-primary|text-primary/.test(combined)) {
      colorBucket.primary.add(color);
    } else if (/secondary|bg-secondary|text-secondary/.test(combined)) {
      colorBucket.secondary.add(color);
    } else if (/accent|bg-accent|text-accent/.test(combined)) {
      colorBucket.accent.add(color);
    } else if (/success|error|warning|info|danger|alert|valid|invalid/.test(combined) ||
               /green|red|yellow|blue/.test(color)) {
      colorBucket.semantic.add(color);
    } else if (/bg-|background/.test(combined) || context === 'bg') {
      colorBucket.neutral.add(color);
    } else if (tag === 'a' || tag === 'button' || combined.includes('link') || combined.includes('btn')) {
      colorBucket.accent.add(color);
    } else {
      colorBucket.neutral.add(color);
    }
  }

  function finalizeDesignSystem(raw) {
    const typographyScale = buildTypographyScale(raw.typography);

    return {
      colors: {
        primary: prioritizeColors(Array.from(raw.colors.primary), 5),
        secondary: prioritizeColors(Array.from(raw.colors.secondary), 3),
        accent: prioritizeColors(Array.from(raw.colors.accent), 4),
        neutral: prioritizeColors(Array.from(raw.colors.neutral), 6),
        semantic: prioritizeColors(Array.from(raw.colors.semantic), 6),
        gradients: raw.colors.gradients.slice(0, 5)
      },
      typography: {
        fonts: Object.fromEntries(raw.typography.fonts),
        sizeScale: sortNumericValues(raw.typography.sizes),
        weightScale: sortNumericValues(raw.typography.weights),
        lineHeightScale: sortNumericValues(raw.typography.lineHeights),
        letterSpacingScale: sortNumericValues(raw.typography.letterSpacings),
        typeScale: typographyScale
      },
      spacing: {
        marginScale: sortSpacingValues(raw.spacing.margins),
        paddingScale: sortSpacingValues(raw.spacing.paddings),
        gapScale: sortSpacingValues(raw.spacing.gaps),
        baseUnit: detectBaseUnit(raw.spacing)
      },
      borderRadius: sortSpacingValues(raw.borderRadius),
      boxShadows: normalizeShadows(Array.from(raw.boxShadows)).slice(0, 8),
      textShadows: Array.from(raw.textShadows).slice(0, 4),
      transitions: Array.from(raw.transitions).slice(0, 10),
      animations: Array.from(raw.animations).slice(0, 10),
      opacityScale: sortNumericValues(raw.opacity),
      zIndexScale: sortNumericValues(raw.zIndex),
      layoutPatterns: Array.from(raw.layoutPatterns).slice(0, 10),
      mediaQueries: Array.from(raw.mediaQueries).slice(0, 15)
    };
  }

  // ─── Page Layout Analysis ──────────────────────────────────
  function analyzePageLayout() {
    const layout = {
      type: detectLayoutType(),
      structure: analyzeStructure(),
      sections: [],
      visualHierarchy: [],
      breakpoints: detectBreakpoints(),
      gridSystems: detectGridSystems(),
      componentDensity: calculateComponentDensity()
    };

    // Analyze visual hierarchy (z-order, size, position)
    const allEls = document.querySelectorAll('body *');
    const significant = [];
    for (const el of allEls) {
      if (!isVisible(el)) continue;
      const rect = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (rect.width > 50 && rect.height > 30) {
        significant.push({
          el,
          area: rect.width * rect.height,
          zIndex: parseInt(s.zIndex) || 0,
          y: rect.top,
          type: detectAdvancedComponentType(el, s)
        });
      }
    }

    // Sort by visual prominence
    significant.sort((a, b) => b.area - a.area);
    layout.visualHierarchy = significant.slice(0, 15).map(s => ({
      type: s.type,
      area: s.area,
      zIndex: s.zIndex,
      position: s.y < window.innerHeight * 0.3 ? 'above-fold' : 
                s.y < window.innerHeight * 0.7 ? 'mid-fold' : 'below-fold'
    }));

    return layout;
  }

  function detectLayoutType() {
    // Detect if it's a marketing site, dashboard, blog, ecommerce, etc.
    const body = document.body;
    const text = body.innerText.toLowerCase();
    const classes = body.className.toLowerCase();

    if (/dashboard|admin|analytics|overview/.test(classes) || 
        document.querySelector('[class*="sidebar"]')) {
      return 'dashboard';
    }
    if (document.querySelector('.product-grid, [class*="product"], [class*="shop"]') || 
        /add to cart|buy now|shopping/.test(text)) {
      return 'ecommerce';
    }
    if (document.querySelector('article') || document.querySelector('.post') || 
        /blog|article|post/.test(classes)) {
      return 'blog';
    }
    if (document.querySelector('header') && document.querySelector('footer') &&
        document.querySelector('section')) {
      return 'landing-page';
    }
    return 'web-app';
  }

  function analyzeStructure() {
    const body = document.body;
    const sections = [];
    
    // Analyze top-level children
    for (const child of body.children) {
      if (isVisible(child)) {
        const rect = child.getBoundingClientRect();
        const s = getComputedStyle(child);
        sections.push({
          tag: child.tagName.toLowerCase(),
          type: detectAdvancedComponentType(child, s),
          rect: { y: rect.top, height: rect.height },
          isFullWidth: rect.width >= window.innerWidth * 0.9,
          hasBackground: s.backgroundColor !== 'rgba(0, 0, 0, 0)',
          backgroundInView: rect.top < window.innerHeight // visible without scroll
        });
      }
    }

    return {
      totalSections: sections.length,
      aboveFold: sections.filter(s => s.rect.y + s.rect.height < window.innerHeight).length,
      fullWidthSections: sections.filter(s => s.isFullWidth).length,
      sectionsWithBackground: sections.filter(s => s.hasBackground).length,
      sectionFlow: sections.map(s => s.type)
    };
  }

  function detectBreakpoints() {
    const breakpoints = new Set();
    const viewportWidth = window.innerWidth;
    
    // Check for responsive behavior
    try {
      for (const ss of document.styleSheets) {
        try {
          for (const rule of ss.cssRules || []) {
            if (rule instanceof CSSMediaRule) {
              const match = rule.conditionText.match(/(\d+)px/);
              if (match) breakpoints.add(parseInt(match[1]));
            }
          }
        } catch (e) {}
      }
    } catch (e) {}

    // Class name based breakpoints
    for (const el of document.querySelectorAll('[class*="lg:"], [class*="md:"], [class*="sm:"],[class*="responsive"]')) {
      const cls = el.className;
      const found = cls.match(/lg:\S+|md:\S+|sm:\S+|xl:\S+|2xl:\S+/g);
      if (found) found.forEach(b => breakpoints.add(b));
    }

    return {
      detected: Array.from(breakpoints).sort((a, b) => a - b),
      currentViewport: viewportWidth,
      viewportCategory: viewportWidth < 640 ? 'mobile' : 
                        viewportWidth < 768 ? 'tablet-sm' :
                        viewportWidth < 1024 ? 'tablet' :
                        viewportWidth < 1280 ? 'desktop' : 'wide'
    };
  }

  function detectGridSystems() {
    const grids = [];
    document.querySelectorAll('*').forEach(el => {
      const s = getComputedStyle(el);
      if (s.display === 'grid') {
        grids.push({
          columns: s.gridTemplateColumns,
          rows: s.gridTemplateRows,
          gap: s.gap,
          itemCount: el.children.length,
          isResponsive: s.gridTemplateColumns.includes('auto-fit') || 
                        s.gridTemplateColumns.includes('auto-fill')
        });
      }
    });
    return grids.slice(0, 5);
  }

  function calculateComponentDensity() {
    const interactive = document.querySelectorAll('a[href], button, input, select, textarea, [onclick]').length;
    const images = document.querySelectorAll('img').length;
    const links = document.querySelectorAll('a[href]').length;
    const totalElements = document.querySelectorAll('*').length;
    
    return {
      interactiveElements: interactive,
      images,
      links,
      totalElements,
      density: Math.round((interactive / Math.max(totalElements, 1)) * 1000) / 10 + '%'
    };
  }

  // ─── Interaction Capture ───────────────────────────────────
  function captureInteractions() {
    const interactions = {
      hoverEffects: [],
      focusEffects: [],
      activeEffects: [],
      transitions: [],
      customEvents: []
    };

    const seenStyles = new Set();
    for (const ss of document.styleSheets) {
      try {
        for (const rule of ss.cssRules || []) {
          if (rule instanceof CSSStyleRule) {
            const selector = rule.selectorText;
            const style = rule.style.cssText;
            if (!seenStyles.has(style)) {
              seenStyles.add(style);
              if (selector.includes(':hover')) {
                interactions.hoverEffects.push({ selector, style: style.slice(0, 200) });
              }
              if (selector.includes(':focus') || selector.includes(':focus-visible') || selector.includes(':focus-within')) {
                interactions.focusEffects.push({ selector, style: style.slice(0, 200) });
              }
              if (selector.includes(':active')) {
                interactions.activeEffects.push({ selector, style: style.slice(0, 200) });
              }
            }
          }
        }
      } catch (e) {}
    }

    // Check for JS event listeners
    const elementsWithJS = document.querySelectorAll('[onmouseover], [onmouseenter], [onfocus], [onclick], [onchange]');
    elementsWithJS.forEach(el => {
      const events = [];
      if (el.getAttribute('onmouseover')) events.push('mouseover');
      if (el.getAttribute('onmouseenter')) events.push('mouseenter');
      if (el.getAttribute('onfocus')) events.push('focus');
      if (el.getAttribute('onclick')) events.push('click');
      if (el.getAttribute('onchange')) events.push('change');
      if (events.length) {
        interactions.customEvents.push({
          selector: `${el.tagName.toLowerCase()}${el.id ? '#'+el.id : ''}${el.className ? '.'+el.className.split(' ')[0] : ''}`,
          events
        });
      }
    });

    return interactions;
  }

  // ─── Responsive States ─────────────────────────────────────
  function captureResponsiveStates() {
    return {
      currentViewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio
      },
      mediaQueries: extractMediaQueries(),
      visibleElements: countVisibleElements(),
      hiddenElements: countHiddenElements(),
      layout: detectResponsiveLayout()
    };
  }

  function detectResponsiveLayout() {
    const body = document.body;
    const styles = getComputedStyle(body);
    
    return {
      bodyDisplay: styles.display,
      bodyFlexDirection: styles.flexDirection,
      hasMobileMenu: !!document.querySelector('[class*="hamburger"], [class*="mobile-menu"], [class*="menu-toggle"]'),
      hasResponsiveGrid: !!document.querySelector('[style*="auto-fit"], [style*="auto-fill"]'),
      isResponsive: document.querySelector('meta[name="viewport"]') !== null
    };
  }

  // ─── Asset Capture ─────────────────────────────────────────
  function captureAssets() {
    const assets = {
      images: [],
      icons: [],
      fonts: [],
      svgs: []
    };

    // Images
    document.querySelectorAll('img').forEach(img => {
      if (img.src && !img.src.startsWith('data:')) {
        assets.images.push({
          src: img.src,
          alt: img.alt || null,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          loading: img.loading || 'auto',
          sizes: img.sizes || null,
          srcset: img.srcset || null
        });
      }
    });

    // SVG icons
    document.querySelectorAll('svg').forEach(svg => {
      if (svg.getBoundingClientRect().width < 48 && svg.getBoundingClientRect().height < 48) {
        assets.icons.push({
          viewBox: svg.getAttribute('viewBox') || null,
          width: svg.getAttribute('width') || svg.getBoundingClientRect().width,
          height: svg.getAttribute('height') || svg.getBoundingClientRect().height,
          paths: svg.querySelectorAll('path').length,
          title: svg.querySelector('title')?.textContent || null
        });
      }
    });

    // Fonts
    document.fonts.forEach(font => {
      assets.fonts.push({
        family: font.family,
        style: font.style,
        weight: font.weight,
        stretch: font.stretch,
        loaded: font.status
      });
    });

    return assets;
  }

  // ─── Selection Mode (Enhanced) ─────────────────────────────
  function startSelectionMode() {
    state.selectionActive = true;
    createEnhancedOverlay();
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onElementClick, true);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('wheel', onScroll, { passive: true });
  }

  function stopSelectionMode() {
    state.selectionActive = false;
    removeEnhancedOverlay();
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onElementClick, true);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('wheel', onScroll);
  }

  function createEnhancedOverlay() {
    // Main overlay
    state.overlay = createElement('div', {
      id: '__uics_overlay',
      style: 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483646;pointer-events:none;'
    });
    document.body.appendChild(state.overlay);

    // Highlight border
    state.highlightEl = createElement('div', {
      id: '__uics_highlight',
      style: 'position:absolute;border:2.5px solid #6366F1;background:rgba(99,102,241,0.08);border-radius:6px;pointer-events:none;transition:all 0.06s cubic-bezier(0.22,1,0.36,1);z-index:2147483647;box-sizing:border-box;'
    });
    document.body.appendChild(state.highlightEl);

    // Corner indicators
    ['tl', 'tr', 'bl', 'br'].forEach(pos => {
      const dot = createElement('div', {
        id: `__uics_dot_${pos}`,
        style: `position:absolute;width:8px;height:8px;background:#6366F1;border:2px solid #fff;border-radius:50%;z-index:2147483647;pointer-events:none;display:none;box-shadow:0 2px 6px rgba(0,0,0,0.3);`
      });
      document.body.appendChild(dot);
    });

    // Ruler overlay
    if (state.settings.showRuler) {
      state.rulerEl = createElement('div', {
        id: '__uics_ruler',
        style: 'position:fixed;bottom:0;left:0;width:100%;height:24px;background:rgba(15,23,42,0.9);z-index:2147483649;display:flex;align-items:center;padding:0 8px;font-family:monospace;font-size:11px;color:#94A3B8;backdrop-filter:blur(8px);'
      });
      document.body.appendChild(state.rulerEl);
    }

    // Toolbar
    state.toolbar = createElement('div', {
      id: '__uics_toolbar',
      style: 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.92);color:#F1F5F9;font-family:system-ui,-apple-system,sans-serif;font-size:13px;font-weight:500;padding:10px 20px;border-radius:12px;z-index:2147483648;pointer-events:auto;box-shadow:0 8px 32px rgba(0,0,0,0.35);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;gap:12px;'
    });
    state.toolbar.innerHTML = `
      <span style="display:flex;align-items:center;gap:6px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#818CF8" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        Click any element
      </span>
      <span id="__uics_info" style="color:#94A3B8;font-weight:400;">Hover over a component</span>
      <span style="display:flex;gap:6px;margin-left:8px;">
        <span style="background:rgba(255,255,255,0.08);padding:2px 8px;border-radius:6px;font-size:11px;color:#64748B;">Esc</span>
        <span style="color:#475569;">cancel</span>
        <span style="background:rgba(255,255,255,0.08);padding:2px 8px;border-radius:6px;font-size:11px;color:#64748B;">↵</span>
        <span style="color:#475569;">capture</span>
      </span>
    `;
    document.body.appendChild(state.toolbar);

    // Info panel
    state.infoPanel = createElement('div', {
      id: '__uics_infopanel',
      style: 'position:fixed;bottom:36px;right:16px;width:260px;background:rgba(15,23,42,0.92);border-radius:10px;z-index:2147483647;pointer-events:none;box-shadow:0 4px 24px rgba(0,0,0,0.25);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.06);padding:12px 14px;display:none;font-family:system-ui,sans-serif;'
    });
    document.body.appendChild(state.infoPanel);
  }

  function removeEnhancedOverlay() {
    ['__uics_overlay', '__uics_highlight', '__uics_toolbar', '__uics_infopanel', '__uics_ruler',
     '__uics_dot_tl', '__uics_dot_tr', '__uics_dot_bl', '__uics_dot_br'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
    state.overlay = state.highlightEl = state.toolbar = state.infoPanel = state.rulerEl = null;
  }

  function onMouseMove(e) {
    if (!state.selectionActive) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || target.closest('#__uics_toolbar')) return;

    state.hoveredElement = target;
    const rect = target.getBoundingClientRect();
    
    // Update highlight
    if (state.highlightEl) {
      state.highlightEl.style.top = (rect.top + window.scrollY) + 'px';
      state.highlightEl.style.left = rect.left + 'px';
      state.highlightEl.style.width = rect.width + 'px';
      state.highlightEl.style.height = rect.height + 'px';
    }

    // Update corner dots
    ['tl', 'tr', 'bl', 'br'].forEach(pos => {
      const dot = document.getElementById(`__uics_dot_${pos}`);
      if (dot) {
        dot.style.display = 'block';
        const offsets = {
          tl: { top: rect.top - 4, left: rect.left - 4 },
          tr: { top: rect.top - 4, left: rect.right - 4 },
          bl: { top: rect.bottom - 4, left: rect.left - 4 },
          br: { top: rect.bottom - 4, left: rect.right - 4 }
        };
        const o = offsets[pos];
        dot.style.top = (o.top + window.scrollY) + 'px';
        dot.style.left = o.left + 'px';
      }
    });

    // Update info
    updateInfoPanel(target, rect);

    // Update toolbar info
    const infoEl = document.getElementById('__uics_info');
    if (infoEl) {
      const type = detectAdvancedComponentType(target, getComputedStyle(target));
      const dimensions = `${Math.round(rect.width)}×${Math.round(rect.height)}`;
      infoEl.textContent = `${type} · ${dimensions}px`;
    }
  }

  function updateInfoPanel(el, rect) {
    if (!state.infoPanel) return;
    const s = getComputedStyle(el);
    const type = detectAdvancedComponentType(el, s);
    
    state.infoPanel.style.display = 'block';
    state.infoPanel.innerHTML = `
      <div style="font-size:12px;font-weight:600;color:#F1F5F9;margin-bottom:8px;">${type}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:11px;">
        <span style="color:#64748B;">Tag</span><span style="color:#E2E8F0;">${el.tagName.toLowerCase()}</span>
        <span style="color:#64748B;">Size</span><span style="color:#E2E8F0;">${Math.round(rect.width)}×${Math.round(rect.height)}</span>
        <span style="color:#64748B;">Position</span><span style="color:#E2E8F0;">(${Math.round(rect.left)}, ${Math.round(rect.top + window.scrollY)})</span>
        <span style="color:#64748B;">Display</span><span style="color:#E2E8F0;">${s.display}</span>
        <span style="color:#64748B;">Font</span><span style="color:#E2E8F0;">${parseFontFamily(s.fontFamily)}</span>
        <span style="color:#64748B;">Color</span><span style="display:flex;align-items:center;gap:4px;color:#E2E8F0;">
          <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${rgbToHex(s.color)||'transparent'};border:1px solid rgba(255,255,255,0.1);"></span>
          ${rgbToHex(s.color) || 'none'}
        </span>
        <span style="color:#64748B;">Bg</span><span style="display:flex;align-items:center;gap:4px;color:#E2E8F0;">
          <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${rgbaToRgb(s.backgroundColor)||'transparent'};border:1px solid rgba(255,255,255,0.1);"></span>
          ${rgbaToRgb(s.backgroundColor) || 'transparent'}
        </span>
        <span style="color:#64748B;">Children</span><span style="color:#E2E8F0;">${el.children.length}</span>
      </div>
      <div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.06);display:flex;gap:4px;flex-wrap:wrap;">
        ${Array.from(el.classList).slice(0, 4).map(c => 
          `<span style="background:rgba(99,102,241,0.15);color:#A5B4FC;padding:1px 6px;border-radius:4px;font-size:10px;">.${c}</span>`
        ).join('')}
      </div>
    `;
  }

  function onElementClick(e) {
    if (!state.selectionActive) return;
    e.preventDefault();
    e.stopPropagation();

    const target = state.hoveredElement || e.target;
    if (!target || target.closest('#__uics_toolbar')) return;

    const data = captureElementDeep(target);
    state.capturedComponents.push(data);
    
    sendCapturedNotification(target, data);
    updateCapturedCount();
  }

  function captureElementDeep(el) {
    const elementData = deepAnalyzeElement(el, 0);
    const designSystem = extractFullDesignSystem();
    const context = analyzeElementContext(el);
    const siblings = captureSiblings(el);
    const parent = el.parentElement ? deepAnalyzeElement(el.parentElement, 1) : null;

    return {
      meta: {
        title: document.title,
        url: location.href,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        capturedAt: new Date().toISOString(),
        captureIndex: state.capturedComponents.length,
        elementId: `${el.tagName.toLowerCase()}${el.id ? '#'+el.id : ''}`
      },
      component: elementData,
      parent: parent ? { tag: parent.tag, type: parent.type, rect: parent.rect } : null,
      siblings: siblings.slice(0, 8),
      context,
      designSystem: {
        colors: designSystem.colors,
        typography: { fonts: designSystem.typography.fonts, sizeScale: designSystem.typography.sizeScale.slice(0, 6) },
        spacing: designSystem.spacing,
        borderRadius: designSystem.borderRadius.slice(0, 5),
        boxShadows: designSystem.boxShadows.slice(0, 3)
      },
      html: el.outerHTML.slice(0, 2000),
      cssText: extractComputedCSS(el)
    };
  }

  function analyzeElementContext(el) {
    const rect = el.getBoundingClientRect();
    return {
      isAboveFold: rect.top + rect.height < window.innerHeight,
      isVisible: isVisible(el),
      isInViewport: rect.top < window.innerHeight && rect.bottom > 0,
      container: findClosestContainer(el),
      zContext: calculateZContext(el),
      scrollParent: findScrollParent(el),
      neighbors: findNeighbors(el, rect)
    };
  }

  function findClosestContainer(el) {
    let parent = el.parentElement;
    let depth = 0;
    while (parent && depth < 5) {
      const s = getComputedStyle(parent);
      if (s.display === 'flex' || s.display === 'grid' || s.position === 'relative') {
        return {
          tag: parent.tagName.toLowerCase(),
          display: s.display,
          id: parent.id || null,
          classes: Array.from(parent.classList).slice(0, 3).join(' ')
        };
      }
      parent = parent.parentElement;
      depth++;
    }
    return null;
  }

  function calculateZContext(el) {
    let current = el;
    let zIndex = 0;
    let stackingContext = 'root';
    
    while (current && current !== document.body) {
      const s = getComputedStyle(current);
      const zi = parseInt(s.zIndex);
      if (!isNaN(zi)) zIndex = zi;
      if (s.position !== 'static' && s.position !== 'relative') {
        stackingContext = `${s.position}:${current.tagName.toLowerCase()}`;
      }
      if (s.isolation === 'isolate') {
        stackingContext = `isolated:${current.tagName.toLowerCase()}`;
        break;
      }
      current = current.parentElement;
    }
    
    return { zIndex, stackingContext };
  }

  function findScrollParent(el) {
    let current = el.parentElement;
    while (current) {
      const s = getComputedStyle(current);
      if (s.overflow === 'auto' || s.overflow === 'scroll' || 
          s.overflowY === 'auto' || s.overflowY === 'scroll') {
        return current.tagName.toLowerCase() + (current.id ? '#'+current.id : '');
      }
      current = current.parentElement;
    }
    return 'document';
  }

  function findNeighbors(el, rect) {
    const neighbors = [];
    if (!el.parentElement) return neighbors;
    
    for (const child of el.parentElement.children) {
      if (child === el || !isVisible(child)) continue;
      const childRect = child.getBoundingClientRect();
      const verticalOverlap = rect.top < childRect.bottom && rect.bottom > childRect.top;
      
      neighbors.push({
        tag: child.tagName.toLowerCase(),
        type: detectAdvancedComponentType(child, getComputedStyle(child)),
        relativePosition: rect.top > childRect.bottom ? 'below' :
                          rect.bottom < childRect.top ? 'above' :
                          verticalOverlap && rect.left > childRect.right ? 'right' :
                          verticalOverlap && rect.right < childRect.left ? 'left' : 'overlap',
        distance: Math.round(Math.abs(rect.top - childRect.bottom) || 
                             Math.abs(rect.bottom - childRect.top) || 0)
      });
    }
    
    return neighbors;
  }

  function captureSiblings(el) {
    if (!el.parentElement) return [];
    return Array.from(el.parentElement.children)
      .filter(child => child !== el && isVisible(child))
      .slice(0, 5)
      .map(child => ({
        tag: child.tagName.toLowerCase(),
        type: detectAdvancedComponentType(child, getComputedStyle(child)),
        rect: {
          width: Math.round(child.getBoundingClientRect().width),
          height: Math.round(child.getBoundingClientRect().height)
        }
      }));
  }

  function sendCapturedNotification(el, data) {
    // Visual flash feedback
    const flash = createElement('div', {
      style: `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(99,102,241,0.95);color:white;padding:12px 24px;border-radius:10px;font-family:system-ui,sans-serif;font-size:14px;font-weight:600;z-index:2147483649;pointer-events:none;box-shadow:0 8px 32px rgba(0,0,0,0.3);animation:uicsFlashAnim 0.8s ease-out forwards;`
    });
    const type = detectAdvancedComponentType(el, getComputedStyle(el));
    flash.textContent = `✓ Captured ${type}`;
    document.body.appendChild(flash);
    
    // Add animation keyframes
    if (!document.getElementById('__uics_flash_style')) {
      const style = createElement('style', { id: '__uics_flash_style' });
      style.textContent = '@keyframes uicsFlashAnim { 0% { opacity:1; transform:translate(-50%,-50%) scale(0.8); } 50% { opacity:1; transform:translate(-50%,-50%) scale(1.05); } 100% { opacity:0; transform:translate(-50%,-60%) scale(1); } }';
      document.head.appendChild(style);
    }
    
    setTimeout(() => flash.remove(), 900);
    
    // Send to extension
    chrome.runtime.sendMessage({ action: 'SECTION_CAPTURED', data });
  }

  function updateCapturedCount() {
    if (state.toolbar) {
      const countEl = state.toolbar.querySelector('#__uics_count');
      if (countEl) {
        countEl.textContent = state.capturedComponents.length;
      } else {
        const badge = createElement('span', {
          id: '__uics_count',
          style: 'background:rgba(99,102,241,0.3);color:#A5B4FC;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;'
        });
        badge.textContent = state.capturedComponents.length;
        state.toolbar.querySelector('span:first-child')?.after(badge);
      }
    }
  }

  // ─── Keyboard Events ──────────────────────────────────────
  function onKeyDown(e) {
    if (e.key === 'Escape') {
      stopSelectionMode();
    }
    // Arrow keys for fine-tuning selection
    if (e.key.startsWith('Arrow') && state.hoveredElement) {
      e.preventDefault();
      const parent = state.hoveredElement.parentElement;
      const children = parent ? Array.from(parent.children).filter(isVisible) : [];
      const currentIdx = children.indexOf(state.hoveredElement);
      let nextIdx = currentIdx;
      
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') nextIdx = Math.max(0, currentIdx - 1);
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') nextIdx = Math.min(children.length - 1, currentIdx + 1);
      
      if (nextIdx !== currentIdx && children[nextIdx]) {
        // Simulate hover
        const rect = children[nextIdx].getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        onMouseMove({ clientX: centerX, clientY: centerY });
      }
    }
  }

  function onScroll(e) {
    // Update corner dots during scroll
    if (!state.hoveredElement) return;
    const rect = state.hoveredElement.getBoundingClientRect();
    ['tl', 'tr', 'bl', 'br'].forEach(pos => {
      const dot = document.getElementById(`__uics_dot_${pos}`);
      if (dot) {
        const offsets = {
          tl: { top: rect.top - 4, left: rect.left - 4 },
          tr: { top: rect.top - 4, left: rect.right - 4 },
          bl: { top: rect.bottom - 4, left: rect.left - 4 },
          br: { top: rect.bottom - 4, left: rect.right - 4 }
        };
        const o = offsets[pos];
        dot.style.top = (o.top + window.scrollY) + 'px';
        dot.style.left = o.left + 'px';
      }
    });
  }

  // ─── Recording Mode ────────────────────────────────────────
  function startRecording() {
    state.recordingActive = true;
    state.clickHistory = [];
    
    document.addEventListener('click', recordClick, true);
    document.addEventListener('scroll', recordScroll, { passive: true, capture: true });
    
    showRecordingIndicator();
  }

  function stopRecording() {
    state.recordingActive = false;
    document.removeEventListener('click', recordClick, true);
    document.removeEventListener('scroll', recordScroll, { capture: true });
    
    hideRecordingIndicator();
    
    return {
      events: state.clickHistory,
      duration: state.clickHistory.length > 0 ? 
        state.clickHistory[state.clickHistory.length - 1].time - state.clickHistory[0].time : 0,
      eventCount: state.clickHistory.length
    };
  }

  function recordClick(e) {
    const target = e.target;
    state.clickHistory.push({
      type: 'click',
      time: Date.now(),
      tag: target.tagName.toLowerCase(),
      id: target.id || null,
      classes: Array.from(target.classList).join(' '),
      text: target.innerText?.slice(0, 50) || null,
      rect: rectToObj(target.getBoundingClientRect()),
      selector: generateSelector(target)
    });
  }

  function recordScroll() {
    // Throttled scroll recording
    if (state._lastScroll && Date.now() - state._lastScroll < 200) return;
    state._lastScroll = Date.now();
    
    state.clickHistory.push({
      type: 'scroll',
      time: Date.now(),
      scrollX: window.scrollX,
      scrollY: window.scrollY
    });
  }

  function showRecordingIndicator() {
    const indicator = createElement('div', {
      id: '__uics_recording',
      style: 'position:fixed;top:12px;right:12px;background:rgba(239,68,68,0.9);color:white;padding:8px 14px;border-radius:8px;font-family:system-ui,sans-serif;font-size:12px;font-weight:600;z-index:2147483649;display:flex;align-items:center;gap:8px;box-shadow:0 4px 16px rgba(239,68,68,0.3);animation:uicsPulse 1.5s infinite;'
    });
    indicator.innerHTML = '<span style="display:inline-block;width:8px;height:8px;background:#fff;border-radius:50%;"></span> Recording interactions...';
    document.body.appendChild(indicator);
    
    if (!document.getElementById('__uics_recording_style')) {
      const style = createElement('style', { id: '__uics_recording_style' });
      style.textContent = '@keyframes uicsPulse { 0%,100% { opacity:1; } 50% { opacity:0.7; } }';
      document.head.appendChild(style);
    }
  }

  function hideRecordingIndicator() {
    const el = document.getElementById('__uics_recording');
    if (el) el.remove();
  }

  // ─── Component Tree Capture ────────────────────────────────
  function captureComponentTree() {
    const root = document.body;
    const tree = buildComponentTree(root, 0);
    
    return {
      depth: maxDepth(tree),
      nodeCount: countNodes(tree),
      componentCount: countComponents(tree),
      tree
    };
  }

  function buildComponentTree(el, depth) {
    if (depth > 8 || !el || !isVisible(el)) return null;
    
    const s = getComputedStyle(el);
    const type = detectAdvancedComponentType(el, s);
    const children = [];
    
    for (const child of el.children) {
      const childTree = buildComponentTree(child, depth + 1);
      if (childTree) children.push(childTree);
    }
    
    return {
      tag: el.tagName.toLowerCase(),
      type,
      id: el.id || null,
      depth,
      rect: rectToObj(el.getBoundingClientRect()),
      children: children.length > 0 ? children : undefined,
      isLeaf: children.length === 0 || depth >= 8
    };
  }

  function maxDepth(node) {
    if (!node || !node.children) return node ? node.depth : 0;
    return Math.max(node.depth, ...node.children.map(maxDepth));
  }

  function countNodes(node) {
    if (!node) return 0;
    return 1 + (node.children ? node.children.reduce((sum, c) => sum + countNodes(c), 0) : 0);
  }

  function countComponents(node) {
    if (!node) return 0;
    const isComponent = node.type !== 'Container' && node.type !== 'div';
    return (isComponent ? 1 : 0) + (node.children ? node.children.reduce((sum, c) => sum + countComponents(c), 0) : 0);
  }

  // ─── Export Functions ──────────────────────────────────────
  function handleExport(format) {
    if (state.capturedComponents.length === 0) {
      return { success: false, error: 'No components captured yet' };
    }
    
    const data = state.capturedComponents;
    let output;
    
    switch (format || state.settings.exportFormat) {
      case 'json':
        output = JSON.stringify(data, null, 2);
        break;
      case 'css':
        output = exportAsCSS(data);
        break;
      case 'tailwind':
        output = exportAsTailwind(data);
        break;
      case 'figma':
        output = exportAsFigmaStyles(data);
        break;
      case 'react':
        output = exportAsReactComponent(data);
        break;
      default:
        output = JSON.stringify(data, null, 2);
    }
    
    copyToClipboard(output);
    return { success: true, format, size: output.length };
  }

  function exportAsCSS(data) {
    let css = `/* UI Clone Studio — Captured Component Styles */\n`;
    css += `/* Captured: ${new Date().toISOString()} */\n\n`;
    
    data.forEach((item, idx) => {
      const comp = item.component;
      css += `/* Component ${idx + 1}: ${comp.type} */\n`;
      css += `.clone-${comp.type.toLowerCase().replace(/\s+/g, '-')}-${idx} {\n`;
      
      const styleMap = {
        'display': comp.layout.display,
        'flex-direction': comp.layout.flexDirection,
        'justify-content': comp.layout.justifyContent,
        'align-items': comp.layout.alignItems,
        'gap': comp.layout.gap,
        'padding': `${comp.spacing.paddingTop} ${comp.spacing.paddingRight} ${comp.spacing.paddingBottom} ${comp.spacing.paddingLeft}`,
        'margin': `${comp.spacing.marginTop} ${comp.spacing.marginRight} ${comp.spacing.marginBottom} ${comp.spacing.marginLeft}`,
        'background-color': comp.visual.backgroundColor,
        'color': comp.visual.color,
        'font-family': comp.typography.fontFamily,
        'font-size': comp.typography.fontSize,
        'font-weight': comp.typography.fontWeight,
        'line-height': comp.typography.lineHeight,
        'text-align': comp.typography.textAlign,
        'border-radius': comp.boxModel.borderRadii?.topLeft,
        'box-shadow': comp.visual.boxShadow,
        'width': comp.dimension.width,
        'height': comp.dimension.height,
        'min-height': comp.dimension.minHeight
      };
      
      Object.entries(styleMap).forEach(([prop, val]) => {
        if (val && val !== '0px 0px 0px 0px' && val !== 'none' && 
            !val.includes('rgba(0,0,0,0)') && val !== 'normal' && val !== 'inherit') {
          css += `  ${prop}: ${val};\n`;
        }
      });
      
      css += `}\n\n`;
    });
    
    return css;
  }

  function exportAsTailwind(data) {
    let output = `<!-- UI Clone Studio — Tailwind Export -->\n`;
    output += `<!-- Captured: ${new Date().toISOString()} -->\n\n`;
    
    data.forEach((item, idx) => {
      const comp = item.component;
      const classes = [];
      
      // Layout
      if (comp.layout.display === 'flex') classes.push('flex');
      if (comp.layout.display === 'grid') classes.push('grid');
      if (comp.layout.flexDirection === 'column') classes.push('flex-col');
      if (comp.layout.justifyContent === 'center') classes.push('justify-center');
      if (comp.layout.justifyContent === 'space-between') classes.push('justify-between');
      if (comp.layout.alignItems === 'center') classes.push('items-center');
