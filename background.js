// Message listener setup
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === 'openLinks') {
    openLinks(request.links);
    return true;
  }
});

// Open links in new tabs
function openLinks(links) {
  if (!links || links.length === 0) return;

  // Process links in smaller batches to prevent browser throttling
  const batchSize = 5; // Open 5 links at a time
  const batches = [];

  // Group links into batches
  for (let i = 0; i < links.length; i += batchSize) {
    batches.push(links.slice(i, i + batchSize));
  }

  // Open each batch with a delay between batches
  batches.forEach((batch, batchIndex) => {
    setTimeout(() => {
      batch.forEach(url => {
        if (url && isValidUrl(url)) {
          try {
            // Open regular links in new tabs, explicitly set active to false to prevent focus change
            chrome.tabs.create({
              url: url,
              active: false, // This ensures the new tab won't receive focus
            });
          } catch (e) {
            console.error('Error opening tab:', e);
            // Fallback to window.open if tabs API fails
            chrome.tabs.executeScript(sender.tab.id, {
              code: `
                (function() {
                  const a = document.createElement('a');
                  a.href = '${url.replace(/'/g, "\\'")}';
                  a.target = '_blank';
                  a.rel = 'noopener';
                  document.body.appendChild(a);
                  a.click();
                  setTimeout(() => a.remove(), 100);
                })();
              `,
            });
          }
        }
      });
    }, batchIndex * 300); // 300ms delay between batches
  });
}

// URL validation
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (e) {
    console.error('Invalid URL:', url);
    return false;
  }
}
