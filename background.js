// Message listener setup
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === 'openLinks') {
    // 메시지는 받되 아무 작업도 수행하지 않음
    return true;
  }
});

// Open links in new tabs
function openLinks(links) {
  // 비활성화 (content.js에서 직접 링크를 열기로 변경되었음)
  return;
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
