(function () {
  var msgs = document.getElementById('msgs');
  var input = document.getElementById('input');
  var sendBtn = document.getElementById('sendBtn');
  var searchTypeEl = document.getElementById('searchType');
  var waiting = false;
  var streamingEl = null;
  var streamingText = '';

  // ---- Minimal Markdown → HTML ----
  function md2html(text) {
    if (!text) return '';
    
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

    // Ordered lists (1. 2. etc) — convert to <li> and collect
    var orderedItems = [];
    html = html.replace(/^\d+\.\s+(.+)$/gm, function (_, text) {
      orderedItems.push(text);
      return '___OL_ITEM___';
    });
    // Wrap consecutive <li> groups that aren't already in <ul>
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, function (match) {
      if (match.indexOf('<ul>') === -1) return '<ol>' + match + '</ol>';
      return match;
    });
    // Replace collected ordered items into a single <ol> at the top
    if (orderedItems.length > 0) {
      var olHtml = '<ol>';
      orderedItems.forEach(function (item, i) {
        olHtml += '<li>' + (i + 1) + '. ' + item + '</li>';
      });
      olHtml += '</ol>';
      html = html.replace(/___OL_ITEM___(\n?)*/g, '');
      // Insert the <ol> after the first paragraph or heading
      var insertPos = html.indexOf('<p>');
      if (insertPos === -1) insertPos = html.indexOf('<h');
      if (insertPos === -1) insertPos = 0;
      html = html.slice(0, insertPos) + olHtml + html.slice(insertPos);
    }

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr>');

    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Markdown links [text](url) → <a> (must run before bare URL transform)
    // Handle fallback: [🔗 来源](url) → [域名](url)
    html = html.replace(/\[🔗\s*来源\]\(([^)]+)\)/g, function (_, url) {
      try {
        var domain = new URL(url).hostname;
        return '<a href="' + url + '" target="_blank" rel="noopener" style="color:#007AFF;text-decoration:underline;">🔗 ' + domain + '</a>';
      } catch (e) {
        return '<a href="' + url + '" target="_blank" rel="noopener" style="color:#007AFF;text-decoration:underline;">🔗 来源</a>';
      }
    });
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, text, url) {
      return '<a href="' + url + '" target="_blank" rel="noopener" style="color:#007AFF;text-decoration:underline;">' + text + '</a>';
    });

    // URLs → clickable links (skip URLs already inside HTML attributes)
    html = html.replace(/(?<!["=])(https?:\/\/[^\s<>"')\]]+)/g, function (url) {
      return '<a href="' + url + '" target="_blank" rel="noopener" style="color:#007AFF;text-decoration:underline;">' + url + '</a>';
    });

    // Single newlines → <br> (before paragraph wrapping)
    html = html.replace(/\n/g, '<br>');

    // Clean up multiple consecutive <br>
    html = html.replace(/(<br>)+/g, '<br>');

    // Paragraphs
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
    // Add copy button for bot messages
    if (type === 'bot') {
      var copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">content_copy</span>';
      copyBtn.title = '复制';
      copyBtn.addEventListener('click', function () {
        navigator.clipboard.writeText(text).then(function () {
          copyBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">check</span>';
          setTimeout(function () {
            copyBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">content_copy</span>';
          }, 1500);
        });
      });
      div.style.position = 'relative';
      div.appendChild(copyBtn);
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
    if (sendBtn.disabled) return;
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

  // ---- 会话历史下拉框（自定义） ----
  var convTrigger = document.getElementById('convTrigger');
  var convMenu = document.getElementById('convMenu');
  var currentConvId = '';
  var conversationList = [];

  function openConvMenu() {
    convMenu.style.display = 'block';
    renderConvMenu();
  }

  function closeConvMenu() {
    convMenu.style.display = 'none';
  }

  function renderConvMenu() {
    convMenu.innerHTML = '';
    // 新会话选项
    var newItem = document.createElement('div');
    newItem.className = 'conv-menu-new';
    newItem.textContent = '+ 新会话';
    newItem.addEventListener('click', function () {
      msgs.innerHTML = '<div class="msg system">新会话</div>';
      if (window.screenToyDialog) window.screenToyDialog.clear();
      currentConvId = '';
      convTrigger.textContent = '+ 新会话';
      closeConvMenu();
    });
    convMenu.appendChild(newItem);
    // 历史会话
    conversationList.forEach(function (c) {
      var item = document.createElement('div');
      item.className = 'conv-menu-item' + (c.id === currentConvId ? ' active' : '');
      var title = document.createElement('span');
      title.className = 'conv-title';
      title.textContent = (c.hasStyleChanges ? '🔄 ' : '') + c.title;
      title.addEventListener('click', function () {
        loadConv(c.id);
        closeConvMenu();
      });
      item.appendChild(title);
      var del = document.createElement('span');
      del.className = 'conv-del';
      del.textContent = '✕';
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!window.screenToyDialog || !window.screenToyDialog.deleteConversation) return;
        window.screenToyDialog.deleteConversation(c.id).then(function () {
          // 立即从列表中移除
          conversationList = conversationList.filter(function (x) { return x.id !== c.id; });
          if (currentConvId === c.id) {
            msgs.innerHTML = '<div class="msg system">会话已删除</div>';
            currentConvId = '';
            convTrigger.textContent = '+ 新会话';
            if (window.screenToyDialog) window.screenToyDialog.clear();
          }
          renderConvMenu();
        });
      });
      item.appendChild(del);
      convMenu.appendChild(item);
    });
  }

  function loadConv(id) {
    if (!window.screenToyDialog || !window.screenToyDialog.loadConversation) return;
    msgs.innerHTML = '<div class="msg system">加载中...</div>';
    window.screenToyDialog.loadConversation(id).then(function (record) {
      if (!record || !record.messages) {
        msgs.innerHTML = '<div class="msg system">加载失败</div>';
        return;
      }
      msgs.innerHTML = '';
      record.messages.forEach(function (m) {
        if (m.role === 'user') addMsg(m.content, 'user', false);
        else if (m.role === 'assistant') addMsg(m.content, 'bot', true);
      });
      currentConvId = id;
      // 更新 trigger 文字
      var item = conversationList.find(function (c) { return c.id === id; });
      convTrigger.textContent = item ? item.title : '会话';
    });
  }

  function loadConversationList() {
    if (!window.screenToyDialog || !window.screenToyDialog.getConversationList) return;
    window.screenToyDialog.getConversationList().then(function (list) {
      conversationList = list || [];
    });
  }

  convTrigger.addEventListener('click', function (e) {
    e.stopPropagation();
    if (convMenu.style.display === 'block') closeConvMenu();
    else openConvMenu();
  });

  // 点击外部关闭下拉框
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.conv-dropdown')) closeConvMenu();
  });

  // 监听 conversation ID（新会话开启时自动选中）
  if (window.screenToyDialog && window.screenToyDialog.onConversationId) {
    window.screenToyDialog.onConversationId(function (id) {
      currentConvId = id;
      // 更新 trigger 文字
      var item = conversationList.find(function (c) { return c.id === id; });
      convTrigger.textContent = item ? item.title : '会话';
      // 刷新会话列表
      loadConversationList();
    });
  }

  // 监听会话列表刷新
  if (window.screenToyDialog && window.screenToyDialog.onRefreshConversationList) {
    window.screenToyDialog.onRefreshConversationList(function () {
      loadConversationList();
    });
  }

  // 监听风格变更
  if (window.screenToyDialog && window.screenToyDialog.onStyleChanged) {
    window.screenToyDialog.onStyleChanged(function (style) {
      var mbtiType = (style.mbtiEI || 'E') + (style.mbtiSN || 'N') + (style.mbtiTF || 'F') + (style.mbtiJP || 'J');
      var typeNames = {
        'INTJ': '建筑师', 'INTP': '逻辑学家', 'ENTJ': '指挥官', 'ENTP': '辩论家',
        'INFJ': '提倡者', 'INFP': '调停者', 'ENFJ': '主人公', 'ENFP': '竞选者',
        'ISTJ': '物流师', 'ISFJ': '守卫者', 'ESTJ': '总经理', 'ESFJ': '执政官',
        'ISTP': '鉴赏家', 'ISFP': '探险家', 'ESTP': '企业家', 'ESFP': '表演者',
      };
      var typeName = typeNames[mbtiType] ? ' ' + typeNames[mbtiType] : '';
      addMsg('[风格变更] 回答风格已切换：' + mbtiType + typeName, 'system', false);
    });
  }

  // ---- 启用直答开关 ----
  var enableDirectAnswerEl = document.getElementById('enableDirectAnswer');
  function updateSearchMode() {
    var enableDA = enableDirectAnswerEl && enableDirectAnswerEl.checked;
    if (window.screenToySettings && window.screenToySettings.apply) {
      window.screenToySettings.apply({ enableDirectAnswer: enableDA });
    }
    searchTypeEl.style.display = enableDA ? 'none' : '';
    sendBtn.textContent = enableDA ? '发送' : '搜索';
    refreshPlaceholder();
    // 更新欢迎语
    var initMsg = document.getElementById('initMsg');
    if (initMsg) {
      initMsg.textContent = enableDA
        ? '你连上我的脑仁儿了。'
        : '你想问点儿什么？';
    }
  }

  function refreshPlaceholder() {
    var enableDA = enableDirectAnswerEl && enableDirectAnswerEl.checked;
    if (enableDA) {
      input.placeholder = '输入问题...';
    } else {
      var isZh = searchTypeEl && searchTypeEl.value === 'zhihu';
      input.placeholder = isZh ? '搜索知乎信息...' : '搜索全网信息...';
    }
  }
  if (enableDirectAnswerEl) {
    enableDirectAnswerEl.addEventListener('change', updateSearchMode);
  }
  if (searchTypeEl) {
    searchTypeEl.addEventListener('change', function () {
      refreshPlaceholder();
      if (window.screenToySettings) {
        window.screenToySettings.apply({ searchType: searchTypeEl.value });
      }
    });
  }

  // 初始加载会话列表
  setTimeout(loadConversationList, 300);

  // 初始模式设置
  setTimeout(function () {
    var enableDA = enableDirectAnswerEl && enableDirectAnswerEl.checked;
    if (!enableDA) {
      searchTypeEl.style.display = '';
      sendBtn.textContent = '搜索';
    }
    // 初始欢迎语
    var initMsg = document.getElementById('initMsg');
    if (initMsg) {
      initMsg.textContent = enableDA
        ? '你连上我的脑仁儿了。'
        : '你想问点儿什么？';
    }
  }, 600);

  if (window.screenToyDialog) {
    // 流式响应：逐片段渲染
    window.screenToyDialog.onChunk(function (chunk) {
      if (!streamingEl) {
        var loading = msgs.querySelector('.msg.loading');
        if (loading) loading.remove();
        streamingEl = document.createElement('div');
        streamingEl.className = 'msg bot';
        msgs.appendChild(streamingEl);
        streamingText = '';
      }
      streamingText += chunk;
      streamingEl.innerHTML = md2html(streamingText);
      msgs.scrollTop = msgs.scrollHeight;
    });

    // 完整响应：最终渲染
    window.screenToyDialog.onReceive(function (msg) {
      waiting = false;
      if (msg === '...') return;
      if (msg.startsWith('(新会话)') || msg.startsWith('(新会话)')) {
        msgs.innerHTML = '<div class="msg system">' + msg + '</div>';
        return;
      }
      if (streamingEl) {
        // 流式已完成，最终渲染
        streamingEl.innerHTML = md2html(msg);
        streamingEl = null;
        streamingText = '';
      } else {
        addMsg(msg, 'bot', true);
      }

      if (msg.length > 20 && window.screenToyDialog.triggerBubble) {
        window.screenToyDialog.triggerBubble('来消息了');
      }
    });
  }

  // ---- 热榜按钮 ----
  var hotListBtn = document.getElementById('hotListBtn');
  if (hotListBtn) {
    hotListBtn.addEventListener('click', function () {
      if (window.screenToyDialog && window.screenToyDialog.getHotList) {
        addMsg('🔍 正在获取知乎热榜...', 'system', false);
        window.screenToyDialog.getHotList().then(function (result) {
          if (result.error) {
            addMsg('⚠️ ' + result.error, 'system', false);
            return;
          }
          var items = result.data;
          if (!items || items.length === 0) {
            addMsg('暂无热榜数据', 'system', false);
            return;
          }
          var text = '🔥 **知乎热榜 Top ' + items.length + '**\n\n';
          items.forEach(function (item, i) {
            if (item.url) {
              text += '**' + (i + 1) + '.** [' + item.title + '](' + item.url + ')\n';
            } else {
              text += '**' + (i + 1) + '.** ' + item.title + '\n';
            }
            if (item.summary) text += item.summary.slice(0, 200) + '\n';
            text += '\n';
          });
          addMsg(text, 'bot', true);
          // 保存热榜结果到会话历史
          if (window.screenToyDialog && window.screenToyDialog.saveHotlistToHistory) {
            window.screenToyDialog.saveHotlistToHistory(text);
          }
        });
      }
    });
  }
})();
