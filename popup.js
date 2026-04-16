document.addEventListener('DOMContentLoaded', () => {
  const extractBtn = document.getElementById('extractBtn');
  const copyAllBtn = document.getElementById('copyAllBtn');
  const exportBtn = document.getElementById('exportBtn');
  const searchInput = document.getElementById('searchInput');
  const filterInternal = document.getElementById('filterInternal');
  const filterExternal = document.getElementById('filterExternal');
  const uniqueOnly = document.getElementById('uniqueOnly');
  const linksList = document.getElementById('linksList');
  const loading = document.getElementById('loading');
  const pageUrlEl = document.getElementById('pageUrl');
  const totalCount = document.getElementById('totalCount');
  const internalCount = document.getElementById('internalCount');
  const externalCount = document.getElementById('externalCount');

  let allLinks = [];
  let currentPageUrl = '';

  // Get current tab URL
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      currentPageUrl = tabs[0].url;
      pageUrlEl.textContent = currentPageUrl;
    }
  });

  // Extract links
  extractBtn.addEventListener('click', async () => {
    loading.classList.remove('hidden');
    linksList.innerHTML = '';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractLinksFromPage
      });

      if (results && results[0] && results[0].result) {
        allLinks = results[0].result;
        renderLinks();
        copyAllBtn.disabled = false;
        exportBtn.disabled = false;
      } else {
        linksList.innerHTML = '<p class="no-results">No links found on this page.</p>';
      }
    } catch (error) {
      linksList.innerHTML = `<p class="no-results">Error: Cannot access this page.<br><small>${error.message}</small></p>`;
    }

    loading.classList.add('hidden');
  });

  // Function injected into the page
  function extractLinksFromPage() {
    const anchors = document.querySelectorAll('a[href]');
    const pageOrigin = window.location.origin;
    const links = [];

    anchors.forEach((a) => {
      const href = a.href;
      const text = a.textContent.trim().replace(/\s+/g, ' ').substring(0, 100);

      if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
        let type = 'external';
        try {
          const linkUrl = new URL(href);
          if (linkUrl.origin === pageOrigin) {
            type = 'internal';
          }
        } catch (e) {
          // relative or malformed
          type = 'internal';
        }

        links.push({
          url: href,
          text: text || '(no text)',
          type: type
        });
      }
    });

    return links;
  }

  // Render links based on filters
  function renderLinks() {
    const searchTerm = searchInput.value.toLowerCase();
    const showInternal = filterInternal.checked;
    const showExternal = filterExternal.checked;
    const unique = uniqueOnly.checked;

    let filtered = allLinks.filter((link) => {
      const matchesSearch =
        link.url.toLowerCase().includes(searchTerm) ||
        link.text.toLowerCase().includes(searchTerm);

      const matchesType =
        (link.type === 'internal' && showInternal) ||
        (link.type === 'external' && showExternal);

      return matchesSearch && matchesType;
    });

    if (unique) {
      const seen = new Set();
      filtered = filtered.filter((link) => {
        if (seen.has(link.url)) return false;
        seen.add(link.url);
        return true;
      });
    }

    // Update stats
    const intCount = filtered.filter((l) => l.type === 'internal').length;
    const extCount = filtered.filter((l) => l.type === 'external').length;
    totalCount.textContent = `Total: ${filtered.length}`;
    internalCount.textContent = `Internal: ${intCount}`;
    externalCount.textContent = `External: ${extCount}`;

    // Render
    if (filtered.length === 0) {
      linksList.innerHTML = '<p class="no-results">No links match your filters.</p>';
      return;
    }

    linksList.innerHTML = '';
    filtered.forEach((link, index) => {
      const item = document.createElement('div');
      item.className = `link-item ${link.type}`;
      item.innerHTML = `
        <span class="link-index">${index + 1}.</span>
        <div class="link-content">
          <div class="link-text">${escapeHtml(link.text)}</div>
          <a href="${escapeHtml(link.url)}" class="link-url" target="_blank" title="${escapeHtml(link.url)}">${escapeHtml(link.url)}</a>
          <div class="link-actions">
            <button class="copy-btn" data-url="${escapeHtml(link.url)}">📋 Copy</button>
          </div>
        </div>
        <span class="link-type ${link.type}">${link.type}</span>
      `;
      linksList.appendChild(item);
    });

    // Copy individual link buttons
    linksList.querySelectorAll('.copy-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const url = btn.getAttribute('data-url');
        navigator.clipboard.writeText(url).then(() => {
          showToast('Link copied!');
        });
      });
    });
  }

  // Search filter
  searchInput.addEventListener('input', () => {
    if (allLinks.length > 0) renderLinks();
  });

  // Checkbox filters
  filterInternal.addEventListener('change', () => {
    if (allLinks.length > 0) renderLinks();
  });
  filterExternal.addEventListener('change', () => {
    if (allLinks.length > 0) renderLinks();
  });
  uniqueOnly.addEventListener('change', () => {
    if (allLinks.length > 0) renderLinks();
  });

  // Copy all links
  copyAllBtn.addEventListener('click', () => {
    const urls = getFilteredLinks().map((l) => l.url).join('\n');
    navigator.clipboard.writeText(urls).then(() => {
      showToast('All links copied to clipboard!');
    });
  });

  // Export as CSV
  exportBtn.addEventListener('click', () => {
    const filtered = getFilteredLinks();
    let csv = 'Index,Text,URL,Type\n';
    filtered.forEach((link, i) => {
      const text = `"${link.text.replace(/"/g, '""')}"`;
      const url = `"${link.url.replace(/"/g, '""')}"`;
      csv += `${i + 1},${text},${url},${link.type}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `links_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported!');
  });

  function getFilteredLinks() {
    const searchTerm = searchInput.value.toLowerCase();
    const showInternal = filterInternal.checked;
    const showExternal = filterExternal.checked;
    const unique = uniqueOnly.checked;

    let filtered = allLinks.filter((link) => {
      const matchesSearch =
        link.url.toLowerCase().includes(searchTerm) ||
        link.text.toLowerCase().includes(searchTerm);
      const matchesType =
        (link.type === 'internal' && showInternal) ||
        (link.type === 'external' && showExternal);
      return matchesSearch && matchesType;
    });

    if (unique) {
      const seen = new Set();
      filtered = filtered.filter((link) => {
        if (seen.has(link.url)) return false;
        seen.add(link.url);
        return true;
      });
    }

    return filtered;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }
});