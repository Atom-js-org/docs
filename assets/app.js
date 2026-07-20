(() => {
  'use strict';

  const root = document.documentElement;
  const body = document.body;
  const main = document.getElementById('mainContent');
  const sidebar = document.getElementById('sidebarNav');
  const outline = document.getElementById('outlineNav');
  const searchDialog = document.getElementById('searchDialog');
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  const pageCache = new Map();
  let config = null;
  let pages = [];
  let currentPage = null;
  let selectedSearchIndex = 0;
  let headingObserver = null;

  const icons = {
    info: '<svg class="callout-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg>',
    warning: '<svg class="callout-icon" viewBox="0 0 24 24"><path d="M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>',
    success: '<svg class="callout-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.7 2.7L16.5 9"/></svg>'
  };

  function escapeHtml(value = '') {
    return value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  }

  function slugify(value) {
    return value.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
  }

  function parseFrontmatter(source) {
    const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    if (!match) return { data: {}, body: source };
    const data = {};
    match[1].split('\n').forEach(line => {
      const index = line.indexOf(':');
      if (index === -1) return;
      const key = line.slice(0, index).trim();
      let value = line.slice(index + 1).trim();
      value = value.replace(/^['"]|['"]$/g, '');
      data[key] = value;
    });
    return { data, body: source.slice(match[0].length) };
  }

  function inline(text) {
    let value = escapeHtml(text);
    value = value.replace(/`([^`]+)`/g, '<code>$1</code>');
    value = value.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    value = value.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    value = value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
      const safeHref = href.startsWith('javascript:') ? '#' : href;
      const external = /^https?:\/\//.test(safeHref);
      return `<a href="${escapeHtml(safeHref)}"${external ? ' target="_blank" rel="noreferrer"' : ''}>${label}${external ? ' ↗' : ''}</a>`;
    });
    return value;
  }

  function renderMarkdown(source) {
    const tokens = new Map();
    let tokenIndex = 0;
    const keep = html => {
      const key = `@@ATOMTOKEN${tokenIndex++}@@`;
      tokens.set(key, html);
      return `\n${key}\n`;
    };

    source = source.replace(/^\s*(import|export)\s+.*$/gm, '');

    source = source.replace(/<Callout\s+([^>]*)>([\s\S]*?)<\/Callout>/gi, (_, attrs, content) => {
      const type = (attrs.match(/type=["']([^"']+)["']/i) || [,'info'])[1];
      const title = (attrs.match(/title=["']([^"']+)["']/i) || [,''])[1];
      const bodyHtml = renderMarkdown(content.trim());
      const safeType = ['warning','success','info'].includes(type) ? type : 'info';
      return keep(`<aside class="callout ${safeType}" role="note">${icons[safeType]}<div class="callout-body">${title ? `<p class="callout-title">${inline(title)}</p>` : ''}${bodyHtml}</div></aside>`);
    });

    source = source.replace(/<FeatureGrid>([\s\S]*?)<\/FeatureGrid>/gi, (_, content) => {
      const cards = [...content.matchAll(/<Feature\s+title=["']([^"']+)["']\s+href=["']([^"']+)["']\s*>([\s\S]*?)<\/Feature>/gi)]
        .map(match => `<a class="feature-card" href="${escapeHtml(match[2])}"><strong>${inline(match[1])}</strong><span>${inline(match[3].trim())}</span></a>`).join('');
      return keep(`<div class="feature-grid">${cards}</div>`);
    });

    source = source.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_, language, code) => keep(`<div class="code-block"><span class="language-label">${escapeHtml(language || 'text')}</span><button class="copy-code" type="button">Copy</button><pre><code>${escapeHtml(code.replace(/\n$/, ''))}</code></pre></div>`));

    const lines = source.replace(/\r/g, '').split('\n');
    const html = [];
    let paragraph = [];
    let list = null;
    let blockquote = [];

    const flushParagraph = () => {
      if (!paragraph.length) return;
      html.push(`<p>${inline(paragraph.join(' ').trim())}</p>`);
      paragraph = [];
    };
    const flushList = () => {
      if (!list) return;
      html.push(`<${list.type}>${list.items.map(item => `<li>${inline(item)}</li>`).join('')}</${list.type}>`);
      list = null;
    };
    const flushQuote = () => {
      if (!blockquote.length) return;
      html.push(`<blockquote>${renderMarkdown(blockquote.join('\n'))}</blockquote>`);
      blockquote = [];
    };
    const flushAll = () => { flushParagraph(); flushList(); flushQuote(); };

    for (const raw of lines) {
      const line = raw.trimEnd();
      const trimmed = line.trim();
      if (tokens.has(trimmed)) {
        flushAll();
        html.push(tokens.get(trimmed));
        continue;
      }
      if (!trimmed) { flushAll(); continue; }
      if (/^---+$/.test(trimmed)) { flushAll(); html.push('<hr>'); continue; }
      const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (heading) {
        flushAll();
        const level = heading[1].length;
        const title = heading[2].replace(/\s+\{#([^}]+)\}\s*$/, '');
        const explicit = heading[2].match(/\s+\{#([^}]+)\}\s*$/);
        const id = explicit ? explicit[1] : slugify(title);
        html.push(`<h${level} id="${escapeHtml(id)}">${inline(title)}</h${level}>`);
        continue;
      }
      const quote = trimmed.match(/^>\s?(.*)$/);
      if (quote) { flushParagraph(); flushList(); blockquote.push(quote[1]); continue; }
      const unordered = trimmed.match(/^[-*]\s+(.+)$/);
      const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
      if (unordered || ordered) {
        flushParagraph(); flushQuote();
        const type = unordered ? 'ul' : 'ol';
        if (!list || list.type !== type) { flushList(); list = { type, items: [] }; }
        list.items.push((unordered || ordered)[1]);
        continue;
      }
      if (trimmed.includes('|') && lines[lines.indexOf(raw) + 1]?.trim().match(/^\|?\s*:?-+/)) {
        // Table parsing is intentionally handled by the block below in a second pass.
      }
      flushList(); flushQuote(); paragraph.push(trimmed);
    }
    flushAll();
    return html.join('\n');
  }

  function flattenNavigation(groups) {
    const output = [];
    groups.forEach(group => {
      (group.pages || []).forEach(page => {
        output.push({ ...page, group: group.title || '' });
        (page.children || []).forEach(child => output.push({ ...child, group: group.title || '', parent: page.title }));
      });
    });
    return output;
  }

  function renderSidebar() {
    sidebar.innerHTML = config.navigation.map(group => {
      const links = (group.pages || []).map(page => {
        const childLinks = (page.children || []).map(child => `<a class="nav-link" data-slug="${escapeHtml(child.slug)}" href="#/${escapeHtml(child.slug)}"><span>${escapeHtml(child.title)}</span></a>`).join('');
        return `<a class="nav-link" data-slug="${escapeHtml(page.slug)}" href="#/${escapeHtml(page.slug)}"><span>${escapeHtml(page.title)}</span>${childLinks ? '<span class="nav-arrow">›</span>' : ''}</a>${childLinks ? `<div class="nav-nested">${childLinks}</div>` : ''}`;
      }).join('');
      return `<nav class="nav-section">${group.title ? `<h2 class="nav-heading">${escapeHtml(group.title)}</h2>` : ''}${links}</nav>`;
    }).join('');
  }

  function currentSlug() {
    const value = location.hash.replace(/^#\/?/, '').split('?')[0];
    return value || config?.site?.home || pages[0]?.slug || 'getting-started';
  }

  async function loadPage(page) {
    if (pageCache.has(page.file)) return pageCache.get(page.file);
    const response = await fetch(`docs/${page.file}`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Could not load docs/${page.file}`);
    const text = await response.text();
    pageCache.set(page.file, text);
    return text;
  }

  function renderBreadcrumbs(page) {
    const parts = [`<a href="#/${config.site.home}">${escapeHtml(config.site.name)}</a>`];
    if (page.group) parts.push(`<span aria-hidden="true">/</span><span>${escapeHtml(page.group)}</span>`);
    if (page.parent) parts.push(`<span aria-hidden="true">/</span><span>${escapeHtml(page.parent)}</span>`);
    return parts.join('');
  }

  function renderPagination(page) {
    const index = pages.findIndex(item => item.slug === page.slug);
    const prev = pages[index - 1];
    const next = pages[index + 1];
    return `<footer class="page-footer"><p class="page-meta">Content powered by MDX · Last updated ${escapeHtml(page.updated || 'recently')}</p><nav class="page-pagination" aria-label="Page navigation">${prev ? `<a class="page-nav-link" href="#/${escapeHtml(prev.slug)}"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg><span><small>Previous</small><strong>${escapeHtml(prev.title)}</strong></span></a>` : '<span></span>'}${next ? `<a class="page-nav-link next" href="#/${escapeHtml(next.slug)}"><span><small>Next</small><strong>${escapeHtml(next.title)}</strong></span><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></a>` : ''}</nav></footer>`;
  }

  function buildOutline() {
    if (headingObserver) headingObserver.disconnect();
    const headings = [...main.querySelectorAll('.content h2, .content h3')];
    outline.innerHTML = headings.map(heading => `<a class="${heading.tagName === 'H3' ? 'depth-3' : ''}" href="#${escapeHtml(heading.id)}">${escapeHtml(heading.textContent)}</a>`).join('');
    const links = [...outline.querySelectorAll('a')];
    links.forEach(link => link.addEventListener('click', event => {
      event.preventDefault();
      const target = main.querySelector(link.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    headingObserver = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a,b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!visible) return;
      links.forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${visible.target.id}`));
    }, { rootMargin: '-90px 0px -70% 0px', threshold: 0 });
    headings.forEach(heading => headingObserver.observe(heading));
  }

  function wireContentActions() {
    main.querySelectorAll('.copy-code').forEach(button => {
      button.addEventListener('click', async () => {
        const value = button.closest('.code-block').querySelector('code').textContent;
        await copyText(value);
        const previous = button.textContent;
        button.textContent = 'Copied';
        setTimeout(() => button.textContent = previous, 1200);
      });
    });
    main.querySelectorAll('a[href^="#"]:not([href^="#/"])').forEach(link => {
      link.addEventListener('click', event => {
        event.preventDefault();
        const target = main.querySelector(link.getAttribute('href'));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    const copyPage = document.getElementById('copyPageButton');
    if (copyPage) copyPage.addEventListener('click', async () => {
      await copyText(main.querySelector('.content').innerText.trim());
      showToast('Page copied');
    });
  }

  async function copyText(value) {
    try { await navigator.clipboard.writeText(value); }
    catch (_) {
      const area = document.createElement('textarea');
      area.value = value; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove();
    }
  }

  async function renderRoute() {
    if (!config) return;
    const slug = currentSlug();
    const page = pages.find(item => item.slug === slug) || pages[0];
    if (!page) return;
    currentPage = page;
    document.querySelectorAll('.nav-link').forEach(link => link.classList.toggle('active', link.dataset.slug === page.slug));
    body.classList.remove('nav-open');
    document.getElementById('menuButton').setAttribute('aria-expanded', 'false');
    main.innerHTML = '<div class="page-loading"><div class="loading-line loading-title"></div><div class="loading-line"></div><div class="loading-line short"></div></div>';
    try {
      const source = await loadPage(page);
      const parsed = parseFrontmatter(source);
      const title = parsed.data.title || page.title;
      const description = parsed.data.description || page.description || '';
      document.title = `${title} | ${config.site.name}`;
      document.querySelector('meta[name="description"]').setAttribute('content', description || config.site.description);
      main.innerHTML = `<div class="breadcrumbs">${renderBreadcrumbs(page)}</div><header class="page-header"><h1>${escapeHtml(title)}</h1>${description ? `<p class="subtitle">${escapeHtml(description)}</p>` : ''}<button class="copy-page" id="copyPageButton" type="button"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="10" height="10" rx="2"/><path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/></svg>Copy</button></header><article class="content">${renderMarkdown(parsed.body)}</article>${renderPagination(page)}`;
      buildOutline();
      wireContentActions();
      main.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'auto' });
    } catch (error) {
      main.innerHTML = `<section class="error-state"><h1>Unable to load this page</h1><p>${escapeHtml(error.message)}</p><p>Run this project through the included local server instead of opening <code>index.html</code> directly.</p><div class="code-block"><span class="language-label">terminal</span><pre><code>npm start</code></pre></div></section>`;
      outline.innerHTML = '';
    }
  }

  function applyTheme(mode, persist = true) {
    const safe = ['light','system','dark'].includes(mode) ? mode : 'system';
    const resolved = safe === 'system' ? (systemTheme.matches ? 'dark' : 'light') : safe;
    root.dataset.themeMode = safe;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
    document.querySelectorAll('[data-theme-choice]').forEach(button => {
      const active = button.dataset.themeChoice === safe;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if (persist) { try { localStorage.setItem('atomjs-theme', safe); } catch (_) {} }
  }

  function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 1500);
  }

  function openSearch() {
    if (!searchDialog.open) searchDialog.showModal();
    selectedSearchIndex = 0;
    searchInput.value = '';
    renderSearchResults('');
    setTimeout(() => searchInput.focus(), 0);
  }

  function renderSearchResults(query) {
    const normalized = query.trim().toLowerCase();
    const matches = pages.filter(page => !normalized || `${page.title} ${page.description || ''} ${page.group || ''}`.toLowerCase().includes(normalized)).slice(0, 12);
    if (!matches.length) {
      searchResults.innerHTML = '<div class="search-empty">No pages found.</div>';
      return;
    }
    selectedSearchIndex = Math.min(selectedSearchIndex, matches.length - 1);
    searchResults.innerHTML = matches.map((page, index) => `<button class="search-result ${index === selectedSearchIndex ? 'is-selected' : ''}" type="button" data-slug="${escapeHtml(page.slug)}" role="option" aria-selected="${index === selectedSearchIndex}"><span><strong>${escapeHtml(page.title)}</strong><span>${escapeHtml(page.description || page.group || '')}</span></span><small>${escapeHtml(page.group || 'Docs')}</small></button>`).join('');
    searchResults.querySelectorAll('.search-result').forEach(button => button.addEventListener('click', () => {
      location.hash = `#/${button.dataset.slug}`;
      searchDialog.close();
    }));
  }

  async function init() {
    try {
      const response = await fetch('docs.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error('Could not load docs.json');
      config = await response.json();
      pages = flattenNavigation(config.navigation);
      renderSidebar();
      await renderRoute();
    } catch (error) {
      main.innerHTML = `<section class="error-state"><h1>AtomJS Docs</h1><p>${escapeHtml(error.message)}</p><p>Browsers block local JSON and MDX requests when a page is opened with <code>file://</code>. Start the included server:</p><div class="code-block"><span class="language-label">terminal</span><pre><code>npm start</code></pre></div><p>Then open <a href="http://localhost:4173">http://localhost:4173</a>.</p></section>`;
      sidebar.innerHTML = '<div class="sidebar-loading">Start the local server to load navigation.</div>';
    }
  }

  document.getElementById('menuButton').addEventListener('click', () => {
    const open = body.classList.toggle('nav-open');
    document.getElementById('menuButton').setAttribute('aria-expanded', String(open));
  });
  document.getElementById('mobileOverlay').addEventListener('click', () => {
    body.classList.remove('nav-open');
    document.getElementById('menuButton').setAttribute('aria-expanded', 'false');
  });
  document.getElementById('searchTrigger').addEventListener('click', openSearch);
  searchInput.addEventListener('input', () => { selectedSearchIndex = 0; renderSearchResults(searchInput.value); });
  searchInput.addEventListener('keydown', event => {
    const results = [...searchResults.querySelectorAll('.search-result')];
    if (event.key === 'ArrowDown') { event.preventDefault(); selectedSearchIndex = Math.min(selectedSearchIndex + 1, results.length - 1); renderSearchResults(searchInput.value); }
    if (event.key === 'ArrowUp') { event.preventDefault(); selectedSearchIndex = Math.max(selectedSearchIndex - 1, 0); renderSearchResults(searchInput.value); }
    if (event.key === 'Enter' && results[selectedSearchIndex]) { event.preventDefault(); location.hash = `#/${results[selectedSearchIndex].dataset.slug}`; searchDialog.close(); }
  });
  searchDialog.addEventListener('click', event => { if (event.target === searchDialog) searchDialog.close(); });
  window.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
  });
  document.querySelectorAll('[data-theme-choice]').forEach(button => button.addEventListener('click', () => applyTheme(button.dataset.themeChoice)));
  systemTheme.addEventListener('change', () => { if (root.dataset.themeMode === 'system') applyTheme('system', false); });
  window.addEventListener('hashchange', renderRoute);
  applyTheme(root.dataset.themeMode || 'system', false);
  init();
})();
