(function () {
  var msgs = document.getElementById('msgs');
  var input = document.getElementById('input');
  var sendBtn = document.getElementById('sendBtn');
  var waiting = false;

  // ---- Minimal Markdown → HTML ----
  function md2html(text) {
    // Escape HTML first
    var html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks (```...```)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function (_, lang, code) {
      return '<pre><code class="lang-' + (lang || '') + '">' + code.trim() + '</code></pre>';
    });

    // Inline code (`...`)
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Headings (# ## ###)
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Unordered lists (- or *)
    html = html.replace(/^[*-] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    // Ordered lists (1. 2. etc)
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    // Wrap consecutive <li> groups that aren't already in <ul>
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, function (match) {
      if (match.indexOf('<ul>') === -1) return '<ol>' + match + '</ol>';
      return match;
    });

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr>');

    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Paragraphs: double newlines
    html = html.replace(/\n\n+/g, '</p><p>');
    html = '<p>' + html + '</p>';

    // Clean up empty paragraphs and nested issues
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/<p>(<h[123]>)<\/p>/g, '$1');
    html = html.replace(/(<\/h[123]>)<\/p>/g, '$1');
    html = html.replace(/<p>(<pre>)<\/p>/g, '$1');
    html = html.replace(/(<\/pre>)<\/p>/g, '$1');
    html = html.replace(/<p>(<ul>)<\/p>/g, '$1');
    html = html.replace(/(<\/ul>)<\/p>/g, '$1');
    html = html.replace(/<p>(<ol>)<\/p>/g, '$1');
    html = html.replace(/(<\/ol>)<\/p>/g, '$1');
    html = html.replace(/<p>(<blockquote>)<\/p>/g, '$1');
    html = html.replace(/(<\/blockquote>)<\/p>/g, '$1');
    html = html.replace(/<p>(<hr>)<\/p>/g, '$1');

    return html;
  }

  function addMsg(text, type, isMarkdown) {
    var loading = msgs.querySelector('.msg.loading');
    if (loading) loading.remove();

    var div = document.createElement('div');
    div.className = 'msg ' + type;
    if (isMarkdown && type === 'bot') {
      div.innerHTML = md2html(text);
    } else {
      // Plain text: escape and use textContent
      div.textContent = text;
    }
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function addLoading() {
    var div = document.createElement('div');
    div.className = 'msg bot loading';
    div.textContent = '...';
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function send() {
    var text = input.value.trim();
    if (!text || waiting) return;
    addMsg(text, 'user', false);
    input.value = '';
    waiting = true;
    addLoading();

    if (window.screenToyDialog) {
      window.screenToyDialog.send(text);
    }
  }

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') send();
  });

  var clearBtn = document.getElementById('clearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      msgs.innerHTML = '<div class="msg system">新会话</div>';
      if (window.screenToyDialog) window.screenToyDialog.clear();
    });
  }

  if (window.screenToyDialog) {
    window.screenToyDialog.onReceive(function (msg) {
      waiting = false;
      if (msg === '...') return;
      if (msg.startsWith('(新会话)')) return;
      addMsg(msg, 'bot', true);

      if (msg.length > 20 && window.screenToyDialog.triggerBubble) {
        // Send first 300 chars to bubble (supports Markdown now)
        var bubbleText = msg.length > 300 ? msg.slice(0, 300) + '...' : msg;
        window.screenToyDialog.triggerBubble(bubbleText);
      }
    });

    window.screenToyDialog.onBorder(function (show) {
      var wb = document.getElementById('winBorder');
      if (wb) wb.style.display = show ? 'block' : 'none';
    });
  }
})();
