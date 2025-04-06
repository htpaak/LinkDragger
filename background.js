// Message listener setup - 새 탭 열린 후 현재 탭 포커스 유지를 위한 처리
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  // 다른 메시지는 필요 없음
  return true;
});

// URL validation 유틸리티 함수 (필요시 사용)
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (e) {
    console.error('Invalid URL:', url);
    return false;
  }
}
