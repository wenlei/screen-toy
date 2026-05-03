(function () {
  var msgs = document.getElementById('msgs');
  var input = document.getElementById('input');
  var sendBtn = document.getElementById('sendBtn');

  function addMsg(text, type) {
    var div = document.createElement('div');
    div.className = 'msg ' + type;
    div.textContent = text;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function addSystem(msg) {
    addMsg(msg, 'system');
  }

  function send() {
    var text = input.value.trim();
    if (!text) return;
    addMsg(text, 'user');
    input.value = '';

    // Mock response — will be replaced by real Zhihu API later
    setTimeout(function () {
      var reply = mockReply(text);
      addMsg(reply, 'bot');
      // Also send to bubble system
      if (window.screenToyDialog && window.screenToyDialog.triggerBubble) {
        window.screenToyDialog.triggerBubble(reply);
      }
    }, 600);
  }

  function mockReply(q) {
    var replies = [
      '这是一个好问题！目前还在学习中，未来会接入知乎 API 给出真实回答。',
      '让我想想...嗯，这个问题可以先查查知乎上的相关讨论。',
      '好的，我会记下这个问题。等 API 接好后给你找最佳答案。',
      '关于「' + q.slice(0, 12) + '...」，知乎上应该有不少优质回答。',
      '收到！这个问题很有意思。目前我是 mock 模式，回答仅供参考。',
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') send();
  });

  // Expose for IPC if needed
  if (window.screenToyDialog) {
    window.screenToyDialog.onReceive(function (msg) {
      addMsg(msg, 'bot');
    });
    window.screenToyDialog.onBorder(function (s) {
      document.getElementById('winBorder').style.display = s ? 'block' : 'none';
    });
  }
})();
