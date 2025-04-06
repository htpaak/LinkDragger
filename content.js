// Default settings
let settings = {
  modifierKey: 'ctrl',
  mouseButton: 'left',
  enabled: true,
  excludedKeywords: '',
};

// Load settings
function loadSettings() {
  chrome.storage.sync.get(
    {
      modifierKey: 'ctrl',
      mouseButton: 'left',
      enabled: true,
      excludedKeywords: '',
    },
    function (items) {
      settings = items;
    }
  );
}

// Initial settings load
loadSettings();

// Detect settings changes
chrome.storage.onChanged.addListener(function (changes, namespace) {
  if (namespace === 'sync') {
    if (changes.modifierKey)
      settings.modifierKey = changes.modifierKey.newValue;
    if (changes.mouseButton)
      settings.mouseButton = changes.mouseButton.newValue;
    if (changes.enabled) settings.enabled = changes.enabled.newValue;
    if (changes.excludedKeywords)
      settings.excludedKeywords = changes.excludedKeywords.newValue;
  }
});

// Mouse button mapping
const MOUSE_BUTTON_MAP = {
  left: 0,
  middle: 1,
  right: 2,
};

// Key press state tracking
let keyState = {
  ctrl: false,
  alt: false,
  shift: false,
};

// Drag state
let isDragging = false;
let startX = 0;
let startY = 0;
let currentX = 0;
let currentY = 0;

// Auto-scroll related variables
let autoScrolling = false;
let scrollInterval = null;
const SCROLL_SENSITIVITY = 50; // Scroll detection area size (pixels)
const SCROLL_SPEED = 30; // Scroll speed (pixels) - increased from 15 to 30
let lastScrollY = 0; // Last scroll position

// Key state tracking
document.addEventListener('keydown', function (e) {
  if (e.key === 'Control') keyState.ctrl = true;
  if (e.key === 'Alt') keyState.alt = true;
  if (e.key === 'Shift') keyState.shift = true;
});

document.addEventListener('keyup', function (e) {
  if (e.key === 'Control') keyState.ctrl = false;
  if (e.key === 'Alt') keyState.alt = false;
  if (e.key === 'Shift') keyState.shift = false;
});

// Mouse event tracking
document.addEventListener('mousedown', function (e) {
  if (!settings.enabled) return;

  // Key combination check
  const isModifierActive =
    (settings.modifierKey === 'ctrl' && keyState.ctrl) ||
    (settings.modifierKey === 'alt' && keyState.alt) ||
    (settings.modifierKey === 'shift' && keyState.shift) ||
    settings.modifierKey === 'none';

  // Mouse button check
  const isCorrectButton = e.button === MOUSE_BUTTON_MAP[settings.mouseButton];

  if (isModifierActive && isCorrectButton) {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    currentX = e.clientX;
    currentY = e.clientY;
    lastScrollY = window.scrollY; // Initial scroll position storage

    // Prevent default base event actions (e.g., text selection)
    e.preventDefault();

    // Create selection box visualization element
    createSelectionBox();

    // Create link counter
    createLinkCounter();
  }
});

document.addEventListener('mousemove', function (e) {
  if (isDragging) {
    // Save current mouse position
    currentX = e.clientX;
    currentY = e.clientY;

    // Auto-scroll processing
    checkAutoScroll(e.clientY);

    // Ensure selection box exists and is up to date
    if (!document.getElementById('linkdragger-selection')) {
      createSelectionBox();
    }

    // Ensure link counter exists
    if (!document.getElementById('linkdragger-counter')) {
      createLinkCounter();
    }

    updateSelectionBox();

    // Update selected link count
    updateLinkCounter(e.clientX, e.clientY);

    e.preventDefault();
  }
});

document.addEventListener('mouseup', function (e) {
  if (isDragging) {
    isDragging = false;

    // Auto-scroll stop
    stopAutoScroll();

    // Collect links in selected area and open
    const links = collectLinksInSelection();

    // Unique links array without duplicates
    const uniqueLinks = removeDuplicateLinks(links);

    // Add excluded keyword filtering
    const filteredLinks = filterExcludedLinks(uniqueLinks);

    openLinksInNewTabs(filteredLinks);

    // Remove selection box element
    removeSelectionBox();

    // Remove link counter
    removeLinkCounter();

    e.preventDefault();
  }
});

// Check if auto-scroll is needed and start/stop
function checkAutoScroll(mouseY) {
  const windowHeight = window.innerHeight;

  // Check if near top or bottom scroll area
  const isNearTop = mouseY < SCROLL_SENSITIVITY;
  const isNearBottom = mouseY > windowHeight - SCROLL_SENSITIVITY;

  // Check if we're already at scroll limits
  const atTop = window.scrollY <= 0;
  const atBottom =
    window.scrollY >=
    document.documentElement.scrollHeight - window.innerHeight - 2;

  if ((isNearTop && !atTop) || (isNearBottom && !atBottom)) {
    // Start scroll if not already scrolling and we're not at the scroll limits
    if (!autoScrolling) {
      startAutoScroll(isNearTop ? -SCROLL_SPEED : SCROLL_SPEED);
    }
  } else {
    // Stop scroll if out of scroll area or at scroll limits
    stopAutoScroll();
  }
}

// Auto-scroll start
function startAutoScroll(speed) {
  if (autoScrolling) return;

  autoScrolling = true;
  scrollInterval = setInterval(function () {
    // Check if we're already at scroll limits
    const atTop = window.scrollY <= 0;
    const atBottom =
      window.scrollY >=
      document.documentElement.scrollHeight - window.innerHeight;

    // If we're at the top and trying to scroll up, or at the bottom and trying to scroll down, stop
    if ((speed < 0 && atTop) || (speed > 0 && atBottom)) {
      stopAutoScroll();
      return;
    }

    // Current scroll position
    const beforeScrollY = window.scrollY;

    // Scroll execution
    window.scrollBy(0, speed);

    // Scroll after position
    const afterScrollY = window.scrollY;
    const actualScrollDelta = afterScrollY - beforeScrollY;

    // Correct only for actually scrolled amount
    if (actualScrollDelta !== 0) {
      // startY correction (start point should move with scroll)
      startY -= actualScrollDelta;

      // Update selection box and link counter
      updateSelectionBox();
      updateLinkCounter(currentX, currentY);
    } else {
      // If no actual scroll happened despite trying, we're at the edge
      stopAutoScroll();
    }

    // Stop auto-scroll if no more scrollable
    if (
      (speed > 0 &&
        afterScrollY >=
          document.documentElement.scrollHeight - window.innerHeight) ||
      (speed < 0 && afterScrollY <= 0)
    ) {
      stopAutoScroll();
    }
  }, 10); // Faster update rate (changed from 16ms to 10ms)
}

// Auto-scroll stop
function stopAutoScroll() {
  if (!autoScrolling) return;

  autoScrolling = false;
  if (scrollInterval) {
    clearInterval(scrollInterval);
    scrollInterval = null;
  }
}

// Selection box creation
function createSelectionBox() {
  const selectionBox = document.createElement('div');
  selectionBox.id = 'linkdragger-selection';
  selectionBox.style.position = 'fixed';
  selectionBox.style.border = '2px solid #4285f4';
  selectionBox.style.backgroundColor = 'rgba(66, 133, 244, 0.1)';
  selectionBox.style.zIndex = '9999';
  selectionBox.style.pointerEvents = 'none';
  document.body.appendChild(selectionBox);
  updateSelectionBox();
}

// Link counter creation
function createLinkCounter() {
  const linkCounter = document.createElement('div');
  linkCounter.id = 'linkdragger-counter';
  linkCounter.style.position = 'fixed';
  linkCounter.style.backgroundColor = '#4285f4';
  linkCounter.style.color = 'white';
  linkCounter.style.padding = '4px 8px';
  linkCounter.style.borderRadius = '12px';
  linkCounter.style.fontSize = '12px';
  linkCounter.style.fontWeight = 'bold';
  linkCounter.style.zIndex = '10000';
  linkCounter.style.pointerEvents = 'none';
  linkCounter.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
  linkCounter.style.transition = 'opacity 0.2s';
  linkCounter.textContent = '0 links';
  document.body.appendChild(linkCounter);
}

// Selection box update
function updateSelectionBox() {
  const selectionBox = document.getElementById('linkdragger-selection');
  if (!selectionBox) return;

  // Convert coordinates to current viewport base (fixed position)
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);

  selectionBox.style.left = left + 'px';
  selectionBox.style.top = top + 'px';
  selectionBox.style.width = width + 'px';
  selectionBox.style.height = height + 'px';
}

// Link counter update
function updateLinkCounter(mouseX, mouseY) {
  const linkCounter = document.getElementById('linkdragger-counter');
  if (!linkCounter) return;

  // Calculate link count in selected area
  const links = collectLinksInSelection();
  const uniqueLinks = removeDuplicateLinks(links);
  const filteredLinks = filterExcludedLinks(uniqueLinks);
  const linkCount = filteredLinks.length;

  // Update counter text
  linkCounter.textContent = `${linkCount} links`;

  // Update counter color (blue if links exist, gray if no links)
  linkCounter.style.backgroundColor = linkCount > 0 ? '#4285f4' : '#9e9e9e';

  // Set counter position (slightly above mouse cursor right)
  linkCounter.style.left = mouseX + 15 + 'px';
  linkCounter.style.top = mouseY - 25 + 'px';
}

// Selection box removal
function removeSelectionBox() {
  const selectionBox = document.getElementById('linkdragger-selection');
  if (selectionBox) {
    selectionBox.remove();
  }
}

// Link counter removal
function removeLinkCounter() {
  const linkCounter = document.getElementById('linkdragger-counter');
  if (linkCounter) {
    linkCounter.remove();
  }
}

// Duplicate links removal
function removeDuplicateLinks(links) {
  return [...new Set(links)];
}

// Collect links in selected area
function collectLinksInSelection() {
  const scrollY = window.scrollY;

  // Absolute document coordinates calculation (including scroll)
  const left = Math.min(startX, currentX);
  const top = Math.min(startY + scrollY, currentY + scrollY);
  const right = Math.max(startX, currentX);
  const bottom = Math.max(startY + scrollY, currentY + scrollY);

  // Do not collect links if drag area is too small
  const minSize = 5; // Minimum 5 pixels of drag area must exist
  if (right - left < minSize && bottom - top < minSize) {
    return [];
  }

  const links = [];
  const allLinks = document.querySelectorAll('a');

  allLinks.forEach(link => {
    const rect = link.getBoundingClientRect();

    // Calculate absolute position of link (considering scroll position)
    const linkLeft = rect.left;
    const linkTop = rect.top + scrollY;
    const linkRight = rect.right;
    const linkBottom = rect.bottom + scrollY;

    // Check if link overlaps with drag area
    if (
      linkLeft < right &&
      linkRight > left &&
      linkTop < bottom &&
      linkBottom > top
    ) {
      // Only add links with valid URL (excluding event-only links)
      if (isValidLink(link)) {
        links.push(link.href);
      }
    }
  });

  return links;
}

// Check if valid link (actual URL exists and is not event-only)
function isValidLink(link) {
  // href is missing or empty string
  if (!link.href || link.href.trim() === '') {
    return false;
  }

  // href starts with javascript:
  if (link.href.toLowerCase().startsWith('javascript:')) {
    return false;
  }

  // href starts with # (page anchor)
  if (link.href.endsWith('#') || link.href.includes('/#')) {
    return false;
  }

  // Compare current page URL (excluding #)
  const currentUrlWithoutHash = window.location.href.split('#')[0];
  const linkUrlWithoutHash = link.href.split('#')[0];
  if (currentUrlWithoutHash === linkUrlWithoutHash) {
    return false;
  }

  // Text content is missing (possible button with only icon)
  if (
    link.textContent.trim() === '' &&
    !link.querySelector('img') &&
    link.children.length < 2
  ) {
    // No image and child elements less than or equal to 1 (possible like button)
    // Check class or ID
    const classAndId = (link.className + ' ' + link.id).toLowerCase();
    if (
      classAndId.includes('like') ||
      classAndId.includes('vote') ||
      classAndId.includes('rating') ||
      classAndId.includes('thumb') ||
      classAndId.includes('favorite') ||
      classAndId.includes('bookmark') ||
      classAndId.includes('react') ||
      classAndId.includes('btn') ||
      classAndId.includes('button')
    ) {
      return false;
    }
  }

  return true;
}

// Filter links containing excluded keywords
function filterExcludedLinks(links) {
  if (!settings.excludedKeywords || settings.excludedKeywords.trim() === '') {
    return links;
  }

  const keywords = settings.excludedKeywords
    .split(',')
    .map(keyword => keyword.trim().toLowerCase())
    .filter(keyword => keyword.length > 0);

  if (keywords.length === 0) {
    return links;
  }

  return links.filter(url => {
    const lowerUrl = url.toLowerCase();
    // Return true if no keyword is included in URL (not filtered)
    return !keywords.some(keyword => lowerUrl.includes(keyword));
  });
}

// Open links in new tabs
function openLinksInNewTabs(links) {
  if (links.length === 0) return;

  // Open each link without changing focus
  links.forEach(url => {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener'; // This prevents focus from changing to the new tab

    // Add to document, click and remove
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });
}

// Prevent wheel event from interrupting drag
document.addEventListener(
  'wheel',
  function (e) {
    if (isDragging) {
      // Prevent default to avoid breaking the drag operation
      e.preventDefault();

      // Check if we can scroll in the requested direction
      const canScrollUp = window.scrollY > 0;
      const canScrollDown =
        window.scrollY <
        document.documentElement.scrollHeight - window.innerHeight;

      // Only scroll if we're not at the limits or if we're scrolling in the valid direction
      if ((e.deltaY < 0 && canScrollUp) || (e.deltaY > 0 && canScrollDown)) {
        // Update scroll position manually
        window.scrollBy(0, e.deltaY);

        // Adjust startY to maintain correct selection box position
        startY -= e.deltaY;
      }

      // Always update UI elements, even if we didn't scroll
      updateSelectionBox();
      updateLinkCounter(currentX, currentY);
    }
  },
  { passive: false }
);
