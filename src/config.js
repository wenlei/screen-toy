// Default parameters — single source of truth
// Loaded before all other scripts in index.html
(function () {
  var DEFAULTS = {
    // Animation folder (subfolder under assets/doodles/)
    spriteFolder: 'arctic_fox',

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

    // Special animation frame intervals (ms)
    twistFrameMs:  80,
    hulaFrameMs:   80,
    sneezeFrameMs: 80,
    meltFrameMs:   120,
    appleFrameMs:  80,
    okFrameMs:     80,
    enterFrameMs:  80,
    quitFrameMs:   80,
    // Random animation cooldown range (seconds)
    animCooldownMinSec: 25,
    animCooldownMaxSec: 60,

    // Bubble
    randomQuotes: [
      '你好~ 喵', '累了，休息一下，咩', '狐狸是怎么叫的？',
    ],
    sequences: [
      [
        { text: '我想吃火锅', wait: 2000 },
        { text: '算了，还是睡觉吧', wait: 0 },
      ],
      [
        { text: '我一直有个狐生问题', wait: 0 },
        { text: '狐狸是怎么叫的？', wait: 1000 },

      ],
      [
        { text: '小猫叫Meow~~~', wait: 1000 },
        { text: '小狗叫Woof~~~ Woof', wait: 1000 },
        { text: '小鸭子叫Quack~~~ Quack', wait: 1000 },
        { text: '那狐狸是怎么叫的?', wait: 1000 },
        { text: '汪。', wait: 1000 },
      ],
      [
        { text: '小猪叫Oink~~~ Oink', wait: 1000 },
        { text: '小牛叫Moooo~~~', wait: 1000 },
        { text: '小马叫Baa~~~ Baa', wait: 1000 },
        { text: '那狐狸是怎么叫的?', wait: 1000 },
        { text: '汪。', wait: 1000 },
      ],
    ],
    bubbleDuration: 3000,
    bubbleInterval: 15000,
    bubbleChunkSize: 15,

    // Scheduled triggers: fire once when clock hits hour:minute
    // anim: 'poke' | 'sit' | 'idle' | 'sleep' | 'wakeup' | 'wander'
    // text: string or [{text, wait}] sequence — both optional, can be combined
    scheduledQuotes: [
      { hour: 9, minute: 0, text: '早上好！新的一天开始了 ☀️' },
      { hour: 12, minute: 0, text: [{ text: '到饭点啦！', wait: 1500 }, { text: '去吃午饭吧 🍱', wait: 0 }] },
      { hour: 18, minute: 0, text: [{ text: '下班了！', wait: 1500 }, { text: '辛苦了今天 🌆', wait: 0 }] },
      { hour: 22, minute: 0, anim: 'sleep', text: [{ text: '该休息了', wait: 1500 }, { text: '晚安 🌙', wait: 0 }] },
    ],

    // Apps
    defaultSelectedApps: ['sublime', 'calc', 'mail', 'notion', 'zhihu'],
    winWidth: 152,
    winHeight: 132,
  };

  window.__CONFIG = DEFAULTS;
})();
