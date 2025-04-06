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
// 드래그 종료 시간 추적 변수
let lastDragEndTime = 0;
// 마지막 드래그 거리
let lastDragDistance = 0;

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

// 기존 이벤트 리스너 제거 및 새 리스너 추가 (capture 단계에서 처리)
document.removeEventListener('mousedown', onMouseDown);
document.removeEventListener('mousemove', onMouseMove);
document.removeEventListener('mouseup', onMouseUp);

// mousedown 핸들러 함수
function onMouseDown(e) {
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

    // 드래그 시작시 드래그 거리 초기화
    lastDragDistance = 0;

    // Prevent default base event actions (e.g., text selection)
    e.preventDefault();

    // 우클릭이나 휠클릭인 경우 버블링도 막습니다
    if (
      e.button === MOUSE_BUTTON_MAP.right ||
      e.button === MOUSE_BUTTON_MAP.middle
    ) {
      e.stopPropagation();
      return false;
    }

    // Create selection box visualization element
    createSelectionBox();

    // Create link counter
    createLinkCounter();
  }
}

// mousemove 핸들러 함수
function onMouseMove(e) {
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
}

// mouseup 핸들러 함수
function onMouseUp(e) {
  if (isDragging) {
    // 드래그 거리 계산
    lastDragDistance = Math.sqrt(
      Math.pow(Math.abs(startX - currentX), 2) +
        Math.pow(Math.abs(startY - currentY), 2)
    );

    // 드래그 종료 시간 기록
    lastDragEndTime = Date.now();

    isDragging = false;

    // 자동 스크롤 중지
    stopAutoScroll();

    // 선택 영역의 링크 수집 및 처리
    const links = collectLinksInSelection();
    const uniqueLinks = removeDuplicateLinks(links);
    const filteredLinks = filterExcludedLinks(uniqueLinks);
    openLinksInNewTabs(filteredLinks);

    // UI 요소 제거
    removeSelectionBox();
    removeLinkCounter();

    // 이벤트 기본 동작 방지
    e.preventDefault();
    e.stopPropagation();

    // 우클릭이나 휠클릭인 경우 컨텍스트 메뉴 방지
    if (
      e.button === MOUSE_BUTTON_MAP.right ||
      e.button === MOUSE_BUTTON_MAP.middle
    ) {
      return false;
    }
  }
}

// capture 단계에서 이벤트 핸들러 등록
document.addEventListener('mousedown', onMouseDown, true);
document.addEventListener('mousemove', onMouseMove, true);
document.addEventListener('mouseup', onMouseUp, true);

// 우클릭 메뉴(contextmenu)를 차단하는 핸들러
function onContextMenu(e) {
  // 드래그 중에만 우클릭 메뉴를 차단합니다
  if (isDragging) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }

  // 드래그가 종료된 직후인지 확인 (실제 드래그 감지)
  if (settings.mouseButton === 'right') {
    // 드래그 종료 시간이 최근이고 드래그 거리가 짧지 않은 경우에만 차단

    // 실제 드래그가 있었을 때만 차단 (최소 드래그 거리 1px)
    // 시간 간격 200ms로 줄임
    if (Date.now() - lastDragEndTime < 200 && lastDragDistance > 1) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }
}

// 휠클릭 이벤트(auxclick)를 차단하는 핸들러
function onAuxClick(e) {
  // 드래그 중에만 휠클릭 동작을 차단합니다
  if (isDragging) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }

  // 드래그가 종료된 직후인지 확인 (실제 드래그 감지)
  if (settings.mouseButton === 'middle') {
    // 드래그 종료 시간이 최근이고 드래그 거리가 짧지 않은 경우에만 차단

    // 실제 드래그가 있었을 때만 차단 (최소 드래그 거리 1px)
    // 시간 간격 200ms로 줄임
    if (Date.now() - lastDragEndTime < 200 && lastDragDistance > 1) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }
}

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

  // 스크롤이 가능한 방향으로만 스크롤 시작
  if (isNearTop && !atTop) {
    // 위로 스크롤 가능한 경우
    if (!autoScrolling) {
      startAutoScroll(-SCROLL_SPEED);
    }
  } else if (isNearBottom && !atBottom) {
    // 아래로 스크롤 가능한 경우
    if (!autoScrolling) {
      startAutoScroll(SCROLL_SPEED);
    }
  } else {
    // 스크롤 영역 밖이거나 스크롤 경계에 도달한 경우
    stopAutoScroll();
  }
}

// Auto-scroll start
function startAutoScroll(speed) {
  if (autoScrolling) return;

  autoScrolling = true;
  scrollInterval = setInterval(function () {
    // 현재 스크롤 위치 확인
    const atTop = window.scrollY <= 0;
    const atBottom =
      window.scrollY >=
      document.documentElement.scrollHeight - window.innerHeight - 2;

    // 스크롤 경계에 도달했으면 중지
    if ((speed < 0 && atTop) || (speed > 0 && atBottom)) {
      stopAutoScroll();
      return;
    }

    // 스크롤 전 위치 저장
    const beforeScrollY = window.scrollY;

    // 스크롤 실행
    window.scrollBy(0, speed);

    // 스크롤 후 위치 확인
    const afterScrollY = window.scrollY;
    const actualScrollDelta = afterScrollY - beforeScrollY;

    // 실제로 스크롤된 경우에만 위치 조정
    if (actualScrollDelta !== 0) {
      // startY 위치 보정 (스크롤을 고려하여 시작점 이동)
      startY -= actualScrollDelta;

      // 선택 영역과 카운터 업데이트
      updateSelectionBox();
      updateLinkCounter(currentX, currentY);
    } else {
      // 스크롤이 발생하지 않았으면 경계에 도달한 것으로 간주하고 중지
      stopAutoScroll();
    }
  }, 10); // 10ms 간격으로 업데이트 (부드러운 스크롤 효과)
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
  const minSize = 1; // Minimum 1 pixel of drag area must exist
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

  // 현재 활성 요소 저장 (포커스 복원용)
  const currentActiveElement = document.activeElement;

  // 모든 링크를 Ctrl+Click으로 열기 (새 탭에서 열고 현재 탭 유지)
  links.forEach(url => {
    // 링크 요소 생성
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);

    // Ctrl+Click 시뮬레이션 (새 탭 열기 + 현재 탭 유지)
    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
      ctrlKey: true, // Ctrl 키 활성화
      shiftKey: false, // Shift 키 비활성화
    });

    // 이벤트 발생
    a.dispatchEvent(clickEvent);

    // 요소 제거
    document.body.removeChild(a);
  });

  // 포커스 복원
  window.focus();
  if (currentActiveElement && document.contains(currentActiveElement)) {
    currentActiveElement.focus();
  }

  // 약간의 지연 후 추가 포커스 복원 시도
  setTimeout(() => window.focus(), 0);
}

// Prevent wheel event from interrupting drag
document.addEventListener(
  'wheel',
  function (e) {
    if (isDragging) {
      // 기본 동작 방지
      e.preventDefault();

      // 현재 스크롤 가능 여부 확인
      const atTop = window.scrollY <= 0;
      const atBottom =
        window.scrollY >=
        document.documentElement.scrollHeight - window.innerHeight - 2;

      // 스크롤 방향 확인 (deltaY > 0: 아래로, deltaY < 0: 위로)
      const isScrollingDown = e.deltaY > 0;
      const isScrollingUp = e.deltaY < 0;

      // 스크롤 한계에 도달했을 때는 startY를 조정하지 않음
      if ((isScrollingUp && atTop) || (isScrollingDown && atBottom)) {
        // 스크롤 한계에 도달했을 때는 startY 위치를 유지
        // 하지만 UI는 여전히 업데이트
        updateSelectionBox();
        updateLinkCounter(currentX, currentY);
        return;
      }

      // 스크롤 실행 전 위치 저장
      const beforeScrollY = window.scrollY;

      // 수동으로 스크롤 조정
      window.scrollBy(0, e.deltaY);

      // 스크롤 후 위치 확인
      const afterScrollY = window.scrollY;
      const actualScrollDelta = afterScrollY - beforeScrollY;

      // 실제로 스크롤된 경우에만 startY 조정
      if (actualScrollDelta !== 0) {
        // 드래그 시작 위치 조정 (스크롤에 맞춰 이동)
        startY -= actualScrollDelta;
      }

      // 선택 상자와 링크 카운터 업데이트
      updateSelectionBox();
      updateLinkCounter(currentX, currentY);
    }
  },
  { passive: false }
);

// 추가 이벤트 리스너 등록
document.addEventListener('contextmenu', onContextMenu, true);
document.addEventListener('auxclick', onAuxClick, true);
