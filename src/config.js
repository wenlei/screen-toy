// Default parameters — single source of truth
// Loaded before all other scripts in index.html
(function () {
  var DEFAULTS = {
    // Animation folder (subfolder under assets/doodles/)
    spriteFolder: 'dog',

    // Display
    displayScale: 0.7,

    // Walk
    walkSpeed: 150,

    // Frame durations (ms)
    idleFrame: 180,
    walkFrame: 120,
    sitFrame: 400,
    pokeFrame: 70,
    flyFrame: 80,

    // Paper airplane
    airplaneFolder: 'paper_plane',
    airplaneFrameW: 181,
    airplaneFrameH: 362,
    airplaneCols: 12,
    airplaneRows: 2,

    // Bubble
    randomQuotes: [
      '你好~', '累了，休息一下',
      '你点我干嘛？', '今天天气不错', '想吃火锅', 'zZZ...',
    ],
    sequences: [
      [
        { text: '你好呀~', wait: 1500 },
        { text: '今天天气真不错', wait: 2000 },
        { text: '要不要出去玩？', wait: 0 },
      ],
      [
        { text: '我想吃火锅', wait: 2000 },
        { text: '算了还是睡觉吧', wait: 0 },
      ],
      [
        { text: '我在思考狐生...', wait: 2000 },
        { text: '汪...', wait: 0 },
      ],
    ],
    bubbleDuration: 3000,
    bubbleInterval: 15000,
    bubbleChunkSize: 15,

    // Apps
    defaultSelectedApps: ['sublime', 'calc', 'mail', 'notion', 'zhihu'],
    winWidth: 152,
    winHeight: 132,
  };

  window.__CONFIG = DEFAULTS;
})();
