document.addEventListener('DOMContentLoaded', function () {
  // 저장된 설정 불러오기
  chrome.storage.sync.get(
    {
      modifierKey: 'ctrl',
      mouseButton: 'left',
      enabled: true,
      excludedKeywords: '',
    },
    function (items) {
      document.getElementById('modifier-key').value = items.modifierKey;
      document.getElementById('mouse-button').value = items.mouseButton;
      document.getElementById('enabled').checked = items.enabled;
      document.getElementById('excluded-keywords').value =
        items.excludedKeywords;
    }
  );

  // 저장 버튼 클릭 이벤트
  document.getElementById('save-btn').addEventListener('click', function () {
    const modifierKey = document.getElementById('modifier-key').value;
    const mouseButton = document.getElementById('mouse-button').value;
    const enabled = document.getElementById('enabled').checked;
    const excludedKeywords = document.getElementById('excluded-keywords').value;

    // 설정 저장
    chrome.storage.sync.set(
      {
        modifierKey: modifierKey,
        mouseButton: mouseButton,
        enabled: enabled,
        excludedKeywords: excludedKeywords,
      },
      function () {
        // 저장 성공 표시
        const button = document.getElementById('save-btn');
        const originalText = button.textContent;

        button.textContent = 'Saved!';
        button.style.backgroundColor = '#43a047';

        setTimeout(function () {
          button.textContent = originalText;
          button.style.backgroundColor = '#4285f4';
        }, 1500);
      }
    );
  });
});
