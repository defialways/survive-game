// 游戏配置
const GRID_SIZE = 8;
const COLORS = ['🔴', '🟡', '🟢', '🔵', '🟣', '🟠'];
const SPECIAL_TYPES = {
  BOMB: '💣',
  RAINBOW: '🌈',
  HORIZONTAL: '↔️',
  VERTICAL: '↕️',
  VORTEX: '🌀'
};

// ============ 新增：能量条配置 ============
const ENERGY_MAX = 100;          // 能量条上限
const ENERGY_PER_CLEAR = 3;      // 每消除一个方块充能
const ENERGY_SPECIAL_COST = 100; // 释放技能消耗

// 游戏状态
let board = [];  // 游戏棋盘
let score = 0;   // 分数
let targetScore = 5000; // 目标分数（以前次最高分为基准，每5000分报喜）
let selectedCell = null;  // 当前选中的方块
let soundEnabled = true;  // 音效开关
let lastMilestone = 0;  // 上次达到的里程碑（每5000分）
let bgMusicInterval = null;  // 背景音乐定时器
let moveCount = 0;  // 移动次数
let comboCount = 0;  // 连击数
let totalCleared = 0;  // 累计消除方块数
let undoStack = [];  // 撤销栈
const MAX_UNDO = 5;  // 最多保存5步
let triggeredSpecials = new Set();  // 已触发的特殊方块（防止连锁二次触发）
let lastTouchTime = 0;  // 触摸事件防重复触发时间戳
let isTouchEvent = false;  // 区分触摸和点击事件（小狐狸建议）
let isProcessing = false;  // 防止重复处理（替换window.isLevelingUp）

// 新增状态
let energy = 0;                    // 当前能量
let isEnergyMode = false;          // 是否处于能量释放选择模式
let chainCount = 0;                // 连锁消除计数（一次操作内的连锁层数）
let bestChainThisTurn = 0;         // 本次操作最高连锁
let vortexTriggerCount = 0;        // 漩涡触发计数

// 音频上下文 & 混响
let audioContext = null;
let masterGain = null;
let reverbNode = null;

// 初始化音频（带混响）
function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioContext.createGain();
        masterGain.connect(audioContext.destination);
        createReverb();
    }
}

async function createReverb() {
    try {
        const sampleRate = audioContext.sampleRate;
        const length = sampleRate * 2;
        const impulse = audioContext.createBuffer(2, length, sampleRate);
        for (let channel = 0; channel < 2; channel++) {
            const data = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
            }
        }
        reverbNode = audioContext.createConvolver();
        reverbNode.buffer = impulse;
        const reverbGain = audioContext.createGain();
        reverbGain.gain.value = 0.18;
        reverbNode.connect(reverbGain);
        reverbGain.connect(audioContext.destination);
    } catch (e) {
        console.warn('Reverb creation failed:', e);
    }
}

function playWithReverb(oscillator, gainNode, reverbAmount = 0.3) {
    gainNode.connect(masterGain);
    if (reverbNode) {
        const wetGain = audioContext.createGain();
        wetGain.gain.value = reverbAmount;
        oscillator.connect(wetGain);
        wetGain.connect(reverbNode);
    }
}

function playClickSound() {
    if (!soundEnabled || !audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.08);
    gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    oscillator.connect(gainNode);
    playWithReverb(oscillator, gainNode, 0.2);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
}

function playMatchSound() {
    if (!soundEnabled || !audioContext) return;
    const notes = [1200, 1500, 1800];
    notes.forEach((freq, i) => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = i === 0 ? 'square' : 'sine';
        osc.frequency.value = freq;
        const t = audioContext.currentTime + i * 0.06;
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
        osc.connect(gain);
        playWithReverb(osc, gain, 0.3);
        osc.start(t);
        osc.stop(t + 0.15);
    });
}

// 漩涡音效
function playVortexSound() {
    if (!soundEnabled || !audioContext) return;
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.6);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
    osc.connect(gain);
    playWithReverb(osc, gain, 0.5);
    osc.start(now);
    osc.stop(now + 0.6);

    const osc2 = audioContext.createOscillator();
    const gain2 = audioContext.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(800, now);
    osc2.frequency.linearRampToValueAtTime(200, now + 0.4);
    gain2.gain.setValueAtTime(0.08, now);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc2.connect(gain2);
    playWithReverb(osc2, gain2, 0.4);
    osc2.start(now);
    osc2.stop(now + 0.4);
}

// ============ 新增：超级音效 ============

// 连锁音效 — 越连锁音调越高
function playChainSound(chainLevel) {
    if (!soundEnabled || !audioContext) return;
    const now = audioContext.currentTime;
    const baseFreq = 600 + chainLevel * 150;
    for (let i = 0; i < Math.min(chainLevel + 1, 6); i++) {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = 'triangle';
        osc.frequency.value = baseFreq + i * 200;
        const t = now + i * 0.08;
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
        osc.connect(gain);
        playWithReverb(osc, gain, 0.35);
        osc.start(t);
        osc.stop(t + 0.25);
    }
}

// 彩虹组合音效 — 华丽的上升琶音
function playRainbowComboSound() {
    if (!soundEnabled || !audioContext) return;
    const now = audioContext.currentTime;
    const scale = [523, 587, 659, 698, 784, 880, 988, 1047, 1175, 1319, 1568];
    scale.forEach((freq, i) => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = now + i * 0.04;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.12, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        osc.connect(gain);
        playWithReverb(osc, gain, 0.4);
        osc.start(t);
        osc.stop(t + 0.3);
    });
}

// 能量充能音效
function playEnergyChargeSound() {
    if (!soundEnabled || !audioContext) return;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, audioContext.currentTime + 0.15);
    gain.gain.setValueAtTime(0.1, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
    osc.connect(gain);
    playWithReverb(osc, gain, 0.2);
    osc.start(audioContext.currentTime);
    osc.stop(audioContext.currentTime + 0.15);
}

// 能量满提示音
function playEnergyFullSound() {
    if (!soundEnabled || !audioContext) return;
    const now = audioContext.currentTime;
    [523, 784, 1047].forEach((freq, i) => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const t = now + i * 0.1;
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        osc.connect(gain);
        playWithReverb(osc, gain, 0.3);
        osc.start(t);
        osc.stop(t + 0.3);
    });
}

function playMilestoneSound() {
    if (!soundEnabled || !audioContext) return;
    const notes = [523, 659, 784, 1047, 1318];
    notes.forEach((freq, i) => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const startTime = audioContext.currentTime + i * 0.12;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.4);
        osc.connect(gain);
        playWithReverb(osc, gain, 0.35);
        osc.start(startTime);
        osc.stop(startTime + 0.4);
    });
}

// === 增强版背景音乐 ===
function playPianoNote(frequency, duration, velocity = 0.1) {
    if (!soundEnabled || !audioContext) return;
    const now = audioContext.currentTime;
    const osc1 = audioContext.createOscillator();
    const gain1 = audioContext.createGain();
    osc1.type = 'triangle';
    osc1.frequency.value = frequency;
    const osc2 = audioContext.createOscillator();
    const gain2 = audioContext.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = frequency * 2;
    const osc3 = audioContext.createOscillator();
    const gain3 = audioContext.createGain();
    osc3.type = 'sine';
    osc3.frequency.value = frequency * 3;
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(velocity, now + 0.015);
    gain1.gain.exponentialRampToValueAtTime(velocity * 0.3, now + duration * 0.3);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + duration);
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.linearRampToValueAtTime(velocity * 0.3, now + 0.01);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.6);
    gain3.gain.setValueAtTime(0, now);
    gain3.gain.linearRampToValueAtTime(velocity * 0.08, now + 0.01);
    gain3.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.3);
    osc1.connect(gain1); osc2.connect(gain2); osc3.connect(gain3);
    playWithReverb(gain1, gain1, 0.25);
    playWithReverb(gain2, gain2, 0.2);
    playWithReverb(gain3, gain3, 0.15);
    gain1.connect(masterGain); gain2.connect(masterGain); gain3.connect(masterGain);
    osc1.start(now); osc1.stop(now + duration);
    osc2.start(now); osc2.stop(now + duration);
    osc3.start(now); osc3.stop(now + duration);
}

function playBassNote(frequency, duration) {
    if (!soundEnabled || !audioContext) return;
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.06, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
    osc.connect(gain);
    gain.connect(masterGain);
    if (reverbNode) {
        const wet = audioContext.createGain();
        wet.gain.value = 0.1;
        osc.connect(wet);
        wet.connect(reverbNode);
    }
    osc.start(now);
    osc.stop(now + duration);
}

function playPadChord(frequencies, duration) {
    if (!soundEnabled || !audioContext) return;
    const now = audioContext.currentTime;
    frequencies.forEach(freq => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.025, now + 0.3);
        gain.gain.setValueAtTime(0.025, now + duration - 0.3);
        gain.gain.linearRampToValueAtTime(0, now + duration);
        osc.connect(gain);
        if (reverbNode) {
            const wet = audioContext.createGain();
            wet.gain.value = 0.15;
            osc.connect(wet);
            wet.connect(reverbNode);
        }
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + duration);
    });
}

function startBgMusic() {
    if (bgMusicInterval) return;
    const melody = [
        { note: 784, dur: 0.4 }, { note: 698, dur: 0.3 }, { note: 659, dur: 0.5 },
        { note: 698, dur: 0.3 }, { note: 784, dur: 0.3 }, { note: 880, dur: 0.6 },
        { note: 0, dur: 0.2 },
        { note: 880, dur: 0.3 }, { note: 784, dur: 0.3 }, { note: 698, dur: 0.5 },
        { note: 659, dur: 0.3 }, { note: 587, dur: 0.3 }, { note: 659, dur: 0.6 },
        { note: 0, dur: 0.3 },
        { note: 784, dur: 0.3 }, { note: 880, dur: 0.3 }, { note: 988, dur: 0.5 },
        { note: 880, dur: 0.3 }, { note: 784, dur: 0.3 }, { note: 698, dur: 0.6 },
        { note: 0, dur: 0.2 },
        { note: 659, dur: 0.3 }, { note: 698, dur: 0.3 }, { note: 784, dur: 0.5 },
        { note: 659, dur: 0.3 }, { note: 587, dur: 0.3 }, { note: 523, dur: 0.8 },
        { note: 0, dur: 0.5 },
    ];
    const bassLine = [
        { note: 262, dur: 1.2 }, { note: 220, dur: 1.2 }, { note: 247, dur: 1.2 },
        { note: 196, dur: 1.2 }, { note: 262, dur: 1.2 }, { note: 294, dur: 1.2 },
        { note: 247, dur: 1.2 }, { note: 196, dur: 1.5 },
    ];
    const chords = [
        { notes: [262, 330, 392], dur: 2.4 },
        { notes: [220, 277, 330], dur: 2.4 },
        { notes: [247, 311, 370], dur: 2.4 },
        { notes: [196, 247, 294], dur: 2.4 },
    ];
    let melodyIndex = 0, bassIndex = 0, chordIndex = 0, tickCount = 0;
    const MELODY_TEMPO = 380;
    const tick = () => {
        if (!soundEnabled) return;
        const m = melody[melodyIndex];
        if (m.note > 0) playPianoNote(m.note, m.dur, 0.1);
        melodyIndex = (melodyIndex + 1) % melody.length;
        if (tickCount % 5 === 0) {
            const b = bassLine[bassIndex];
            playBassNote(b.note, b.dur);
            bassIndex = (bassIndex + 1) % bassLine.length;
        }
        if (tickCount % 12 === 0) {
            const c = chords[chordIndex];
            playPadChord(c.notes, c.dur);
            chordIndex = (chordIndex + 1) % chords.length;
        }
        tickCount++;
    };
    tick();
    bgMusicInterval = setInterval(tick, MELODY_TEMPO);
}

function stopBgMusic() {
    if (bgMusicInterval) {
        clearInterval(bgMusicInterval);
        bgMusicInterval = null;
    }
}

// ============ 初始化 ============
function initGame() {
    score = 0;
    moveCount = 0;
    comboCount = 0;
    totalCleared = 0;
    undoStack = [];
    triggeredSpecials.clear();
    isProcessing = false;
    energy = 0;               // 新增
    isEnergyMode = false;     // 新增
    chainCount = 0;           // 新增
    bestChainThisTurn = 0;    // 新增
    vortexTriggerCount = 0;

    const leaderboard = getLeaderboard();
    const lastHighScore = leaderboard.length > 0 ? leaderboard[0].score : 0;
    targetScore = Math.max(5000, Math.ceil((lastHighScore + 1) / 5000) * 5000);
    lastMilestone = Math.floor(targetScore / 5000) - 1;

    updateScore();
    updateTargetInfo();
    updateMoveCount();
    updateEnergyBar();  // 新增
    board = createBoard();
    renderBoard();

    if (soundEnabled) {
        initAudio();
        startBgMusic();
    }
}

function createBoard() {
    const newBoard = [];
    const specialChance = 0.06;
    for (let row = 0; row < GRID_SIZE; row++) {
        newBoard[row] = [];
        for (let col = 0; col < GRID_SIZE; col++) {
            if (Math.random() < specialChance) {
                const random = Math.random();
                if (random < 0.30) newBoard[row][col] = SPECIAL_TYPES.RAINBOW;
                else if (random < 0.45) newBoard[row][col] = SPECIAL_TYPES.BOMB;
                else if (random < 0.60) newBoard[row][col] = SPECIAL_TYPES.HORIZONTAL;
                else if (random < 0.75) newBoard[row][col] = SPECIAL_TYPES.VERTICAL;
                else newBoard[row][col] = SPECIAL_TYPES.VORTEX;
            } else {
                newBoard[row][col] = getRandomColor();
            }
        }
    }
    return newBoard;
}

function getRandomColor() {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
}

// ============ 渲染 ============
function renderBoard() {
    const gameBoard = document.getElementById('game-board');
    gameBoard.innerHTML = '';
    for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            const emoji = board[row][col];
            cell.textContent = emoji;
            cell.dataset.row = row;
            cell.dataset.col = col;
            cell.style.backgroundColor = getCellColor(emoji);

            if (emoji === SPECIAL_TYPES.BOMB) cell.dataset.special = 'bomb';
            else if (emoji === SPECIAL_TYPES.RAINBOW) cell.dataset.special = 'rainbow';
            else if (emoji === SPECIAL_TYPES.HORIZONTAL) cell.dataset.special = 'horizontal';
            else if (emoji === SPECIAL_TYPES.VERTICAL) cell.dataset.special = 'vertical';
            else if (emoji === SPECIAL_TYPES.VORTEX) cell.dataset.special = 'vortex';

            // 能量释放模式下所有格子可点击
            cell.addEventListener('touchstart', (e) => {
                e.preventDefault();
                isTouchEvent = true;
            }, { passive: false });
            cell.addEventListener('touchend', (e) => {
                e.preventDefault();
                const now = Date.now();
                if (now - lastTouchTime < 300) return;
                lastTouchTime = now;
                handleCellClick(row, col);
            }, { passive: false });
            cell.addEventListener('click', () => {
                if (isTouchEvent) { isTouchEvent = false; return; }
                handleCellClick(row, col);
            });
            gameBoard.appendChild(cell);
        }
    }
    // 新增：弹跳动画 — 标记需要弹跳的格子
    if (springCells.size > 0) {
        springCells.forEach(key => {
            const [r, c] = key.split(',').map(Number);
            const idx = r * GRID_SIZE + c;
            const el = gameBoard.children[idx];
            if (el) el.classList.add('spring-in');
        });
        springCells.clear();
    }
    // 能量模式高亮
    if (isEnergyMode) {
        gameBoard.classList.add('energy-mode');
    } else {
        gameBoard.classList.remove('energy-mode');
    }
}

function getCellColor(emoji) {
    const colorMap = {
        '🔴': '#ff6b6b', '🟡': '#ffd93d', '🟢': '#6bcf7f',
        '🔵': '#4d96ff', '🟣': '#b565d8', '🟠': '#ff9f43',
        '💣': '#8b0000', '🌈': '#9400d3', '↔️': '#00bfff',
        '↕️': '#00ced1', '🌀': '#6a0dad'
    };
    return colorMap[emoji] || '#ccc';
}

// ============ 点击与交换 ============
function handleCellClick(row, col) {
    if (isProcessing) return;  // 防止动画过程中重复点击
    initAudio();
    playClickSound();

    // 新增：能量释放模式
    if (isEnergyMode) {
        placeSpecialByEnergy(row, col);
        return;
    }

    if (!selectedCell) {
        selectedCell = { row, col };
        highlightCell(row, col, true);
    } else {
        if (isAdjacent(selectedCell, { row, col })) {
            swapCells(selectedCell, { row, col });
            highlightCell(selectedCell.row, selectedCell.col, false);
            selectedCell = null;
        } else {
            highlightCell(selectedCell.row, selectedCell.col, false);
            selectedCell = { row, col };
            highlightCell(row, col, true);
        }
    }
}

function highlightCell(row, col, highlight) {
    const cells = document.querySelectorAll('.cell');
    const index = row * GRID_SIZE + col;
    if (highlight) cells[index].classList.add('selected');
    else cells[index].classList.remove('selected');
}

function isAdjacent(cell1, cell2) {
    const rowDiff = Math.abs(cell1.row - cell2.row);
    const colDiff = Math.abs(cell1.col - cell2.col);
    return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
}

// ============ 核心：交换逻辑（加入彩虹组合检测） ============
function swapCells(cell1, cell2) {
    const emoji1 = board[cell1.row][cell1.col];
    const emoji2 = board[cell2.row][cell2.col];

    // 新增：彩虹+特殊方块组合检测
    const combo = detectRainbowCombo(emoji1, emoji2);
    if (combo) {
        // 彩虹组合直接执行，不走普通交换
        executeRainbowCombo(cell1, cell2, combo);
        return;
    }

    // 普通交换
    const temp = emoji1;
    board[cell1.row][cell1.col] = emoji2;
    board[cell2.row][cell2.col] = temp;
    renderBoard();

    if (hasMatches()) {
        isProcessing = true;
        saveUndoState();
        moveCount++;
        updateMoveCount();
        comboCount = 0;
        chainCount = 0;         // 重置连锁计数
        bestChainThisTurn = 0;  // 重置最高连锁
        clearComboEffects();    // 新增：新操作开始，清除上轮特效
        setTimeout(() => processMatches(), 300);
    } else {
        setTimeout(() => {
            board[cell2.row][cell2.col] = board[cell1.row][cell1.col];
            board[cell1.row][cell1.col] = temp;
            renderBoard();
        }, 300);
    }
}

// ============ 新增：彩虹组合检测 ============
// 返回组合类型或 null
function detectRainbowCombo(emoji1, emoji2) {
    const rainbow = SPECIAL_TYPES.RAINBOW;
    if (emoji1 === rainbow && emoji2 === rainbow) return 'rainbow_rainbow';
    if (emoji1 === rainbow && emoji2 === SPECIAL_TYPES.BOMB) return 'rainbow_bomb';
    if (emoji2 === rainbow && emoji1 === SPECIAL_TYPES.BOMB) return 'bomb_rainbow';
    if (emoji1 === rainbow && emoji2 === SPECIAL_TYPES.HORIZONTAL) return 'rainbow_horizontal';
    if (emoji2 === rainbow && emoji1 === SPECIAL_TYPES.HORIZONTAL) return 'horizontal_rainbow';
    if (emoji1 === rainbow && emoji2 === SPECIAL_TYPES.VERTICAL) return 'rainbow_vertical';
    if (emoji2 === rainbow && emoji1 === SPECIAL_TYPES.VERTICAL) return 'vertical_rainbow';
    if (emoji1 === rainbow && emoji2 === SPECIAL_TYPES.VORTEX) return 'rainbow_vortex';
    if (emoji2 === rainbow && emoji1 === SPECIAL_TYPES.VORTEX) return 'vortex_rainbow';
    // 彩虹+普通颜色：让该颜色所有方块变成彩虹并消除
    if (emoji1 === rainbow && COLORS.includes(emoji2)) return 'rainbow_color';
    if (emoji2 === rainbow && COLORS.includes(emoji1)) return 'color_rainbow';
    return null;
}

// ============ 新增：执行彩虹组合效果 ============
function executeRainbowCombo(cell1, cell2, combo) {
    isProcessing = true;
    rainbowComboCount++;  // 追踪彩虹组合次数
    playRainbowComboSound();
    saveUndoState();
    moveCount++;
    updateMoveCount();
    chainCount = 0;
    bestChainThisTurn = 0;

    const matchedCells = [];
    const rainbowRow = board[cell1.row][cell1.col] === SPECIAL_TYPES.RAINBOW ? cell1.row : cell2.row;
    const rainbowCol = board[cell1.row][cell1.col] === SPECIAL_TYPES.RAINBOW ? cell1.col : cell2.col;
    const specialRow = rainbowRow === cell1.row ? cell2.row : cell1.row;
    const specialCol = rainbowRow === cell1.row ? cell2.col : cell1.col;

    switch (combo) {
        case 'rainbow_rainbow':
            // 💥 全屏炸弹！消除所有方块
            for (let r = 0; r < GRID_SIZE; r++) {
                for (let c = 0; c < GRID_SIZE; c++) {
                    matchedCells.push({ row: r, col: c });
                }
            }
            showRainbowComboText('🌈🌈 全屏净化！');
            break;

        case 'rainbow_bomb':
        case 'bomb_rainbow':
            // 🌀 5x5 超级炸弹（以交换位置为中心）
            for (let dr = -2; dr <= 2; dr++) {
                for (let dc = -2; dc <= 2; dc++) {
                    const r = specialRow + dr;
                    const c = specialCol + dc;
                    if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) {
                        matchedCells.push({ row: r, col: c });
                    }
                }
            }
            showRainbowComboText('💥 超级炸弹 5×5！');
            break;

        case 'rainbow_horizontal':
        case 'horizontal_rainbow':
            // 全屏横扫：消除所有行（每行都是横消效果）
            for (let r = 0; r < GRID_SIZE; r++) {
                for (let c = 0; c < GRID_SIZE; c++) {
                    matchedCells.push({ row: r, col: c });
                }
            }
            showRainbowComboText('↔️ 全屏横扫！');
            break;

        case 'rainbow_vertical':
        case 'vertical_rainbow':
            // 全屏竖扫：消除所有列
            for (let r = 0; r < GRID_SIZE; r++) {
                for (let c = 0; c < GRID_SIZE; c++) {
                    matchedCells.push({ row: r, col: c });
                }
            }
            showRainbowComboText('↕️ 全屏竖扫！');
            break;

        case 'rainbow_vortex':
        case 'vortex_rainbow':
            // 🌀🌈 超级漩涡：5x5 范围清除 + 连锁触发范围内特殊方块
            for (let dr = -2; dr <= 2; dr++) {
                for (let dc = -2; dc <= 2; dc++) {
                    const r = specialRow + dr;
                    const c = specialCol + dc;
                    if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) {
                        matchedCells.push({ row: r, col: c });
                        // 连锁触发特殊方块
                        const innerEmoji = board[r][c];
                        if (isSpecialBlock(innerEmoji) && !(r === specialRow && c === specialCol)) {
                            triggerChainEffect(r, c, innerEmoji, matchedCells);
                        }
                    }
                }
            }
            showRainbowComboText('🌀🌈 超级漩涡 5×5！');
            break;

        case 'rainbow_color':
        case 'color_rainbow':
            // 彩虹+颜色：全棋盘同色方块全部消除
            const targetColor = board[specialRow][specialCol];
            for (let r = 0; r < GRID_SIZE; r++) {
                for (let c = 0; c < GRID_SIZE; c++) {
                    if (board[r][c] === targetColor) {
                        matchedCells.push({ row: r, col: c });
                    }
                }
            }
            // 同时消除彩虹本身
            matchedCells.push({ row: rainbowRow, col: rainbowCol });
            showRainbowComboText(`🌈 ${targetColor} 全部消除！`);
            break;
    }

    // 去重
    const unique = [];
    matchedCells.forEach(cell => {
        if (!unique.some(u => u.row === cell.row && u.col === cell.col)) {
            unique.push(cell);
        }
    });

    // 消除动画 + 计分
    showClearAnimation(unique);
    totalCleared += unique.length;
    unique.forEach(cell => { board[cell.row][cell.col] = null; });

    // 彩虹组合固定按最高连锁奖励
    const comboBonus = 50;
    score += unique.length * 15 + comboBonus;
    addEnergy(unique.length);
    updateScore();

    renderBoard();

    setTimeout(() => {
        dropCells();
        fillEmpty();
        renderBoard();
        if (hasMatches()) {
            chainCount++;
            bestChainThisTurn = Math.max(bestChainThisTurn, chainCount);
            setTimeout(() => processMatches(), 300);
        } else {
            isProcessing = false;
            chainCount = 0;
            bestChainThisTurn = 0;
            comboCount = 0;
            triggeredSpecials.clear();
            checkAchievements();
            if (!hasValidMoves()) {
                showShuffleMessage();
                setTimeout(() => shuffleBoard(), 1000);
            }
        }
    }, 300);
}

// ============ 新增：连锁奖励系统 ============
// 连锁奖励倍率表
const CHAIN_REWARDS = {
    2: { multiplier: 1.5, label: '⚡ 连锁 x2', color: '#ffd93d' },
    3: { multiplier: 2.0, label: '🔥 三重连锁！', color: '#ff6b35' },
    4: { multiplier: 3.0, label: '💥 四重连锁！！', color: '#ff3333' },
    5: { multiplier: 4.0, label: '🌟 五重连锁！！！', color: '#ff00ff' },
};

function getChainReward(chainLevel) {
    return CHAIN_REWARDS[chainLevel] || (chainLevel > 5 ? {
        multiplier: 5.0,
        label: `💫 ${chainLevel}重连锁！！！！`,
        color: '#ff0066'
    } : null);
}

function showChainReward(chainLevel, bonus) {
    const reward = getChainReward(chainLevel);
    if (!reward) return;

    const el = document.createElement('div');
    el.className = 'chain-reward-text';
    el.innerHTML = `${reward.label}<br><span style="font-size:18px">+${bonus}分</span>`;
    el.style.cssText = `
        position: fixed;
        top: 40%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.5);
        font-size: ${22 + chainLevel * 3}px;
        font-weight: bold;
        color: ${reward.color};
        text-shadow: 0 0 15px ${reward.color}, 2px 2px 4px rgba(0,0,0,0.5);
        pointer-events: none;
        z-index: 1001;
        animation: chain-pop 1.2s ease-out forwards;
        text-align: center;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1300);
}

// ============ 新增：能量条系统 ============
function addEnergy(amount) {
    const wasFull = energy >= ENERGY_MAX;
    energy = Math.min(energy + amount, ENERGY_MAX);
    updateEnergyBar();

    if (energy >= ENERGY_MAX && !wasFull) {
        playEnergyFullSound();
        showEnergyFullNotification();
    }
}

function updateEnergyBar() {
    const barEl = document.getElementById('energy-bar');
    const textEl = document.getElementById('energy-text');
    if (barEl) {
        const pct = Math.min((energy / ENERGY_MAX) * 100, 100);
        barEl.style.width = pct + '%';
        // 颜色渐变：低=蓝，中=绿，高=金
        if (pct < 33) barEl.style.background = 'linear-gradient(90deg, #4d96ff, #6bcf7f)';
        else if (pct < 66) barEl.style.background = 'linear-gradient(90deg, #6bcf7f, #ffd93d)';
        else barEl.style.background = 'linear-gradient(90deg, #ffd93d, #ff9f43)';
    }
    if (textEl) {
        textEl.textContent = `${Math.min(energy, ENERGY_MAX)}/${ENERGY_MAX}`;
    }
    // 更新按钮状态
    const energyBtn = document.getElementById('energy-btn');
    if (energyBtn) {
        energyBtn.disabled = energy < ENERGY_MAX;
        if (isEnergyMode) {
            energyBtn.textContent = '❌ 取消';
            energyBtn.classList.add('energy-active');
        } else {
            energyBtn.textContent = '⚡ 释放技能';
            energyBtn.classList.remove('energy-active');
        }
    }
}

function toggleEnergyMode() {
    if (energy < ENERGY_MAX && !isEnergyMode) return; // 能量不足不能开启
    isEnergyMode = !isEnergyMode;
    updateEnergyBar();
    renderBoard();
}

function showEnergyFullNotification() {
    const el = document.createElement('div');
    el.className = 'energy-full-notification';
    el.innerHTML = '⚡ 能量已满！点击「释放技能」选择位置';
    el.style.cssText = `
        position: fixed;
        top: 20%;
        left: 50%;
        transform: translateX(-50%);
        font-size: 16px;
        font-weight: bold;
        color: #ffd93d;
        background: rgba(0,0,0,0.85);
        padding: 12px 24px;
        border-radius: 12px;
        border: 2px solid #ffd93d;
        pointer-events: none;
        z-index: 1000;
        animation: energy-notify 2s ease-out forwards;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
}

// 释放能量：在指定位置生成随机特殊方块
function placeSpecialByEnergy(row, col) {
    if (energy < ENERGY_MAX) return;
    energy -= ENERGY_SPECIAL_COST;
    energyUsedCount++;  // 追踪能量使用次数
    isEnergyMode = false;

    // 随机生成强力特殊方块（比普通刷新概率高的特殊类型）
    const specials = [SPECIAL_TYPES.BOMB, SPECIAL_TYPES.VORTEX, SPECIAL_TYPES.RAINBOW, SPECIAL_TYPES.HORIZONTAL, SPECIAL_TYPES.VERTICAL];
    const weights = [0.25, 0.25, 0.20, 0.15, 0.15]; // 炸弹和漩涡概率最高
    const rand = Math.random();
    let cumulative = 0;
    let chosen = SPECIAL_TYPES.BOMB;
    for (let i = 0; i < specials.length; i++) {
        cumulative += weights[i];
        if (rand < cumulative) { chosen = specials[i]; break; }
    }

    board[row][col] = chosen;
    renderBoard();
    updateEnergyBar();

    // 放置音效
    playRainbowComboSound();
    showEnergyPlaceEffect(row, col, chosen);
}

function showEnergyPlaceEffect(row, col, emoji) {
    const el = document.createElement('div');
    el.innerHTML = `⚡ 已放置 ${emoji}`;
    el.style.cssText = `
        position: fixed;
        top: 35%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 20px;
        font-weight: bold;
        color: #ffd93d;
        text-shadow: 0 0 10px rgba(255,217,61,0.8);
        pointer-events: none;
        z-index: 1000;
        animation: chain-pop 1s ease-out forwards;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1100);
}

// ============ 排行榜系统 ============
const LEADERBOARD_KEY = 'survive_leaderboard';
const ACHIEVEMENTS_KEY = 'survive_achievements';

function getLeaderboard() {
    try { return JSON.parse(localStorage.getItem(LEADERBOARD_KEY)) || []; }
    catch { return []; }
}

function saveToLeaderboard(score, milestone) {
    const leaderboard = getLeaderboard();
    leaderboard.push({
        score,
        milestone: milestone || Math.floor(score / 5000) + 1,
        date: new Date().toLocaleDateString('zh-CN'),
        totalCleared
    });
    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard.splice(10);
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(leaderboard));
}

function showLeaderboard() {
    const modal = document.getElementById('leaderboard-modal');
    const list = document.getElementById('leaderboard-list');
    const leaderboard = getLeaderboard();
    list.innerHTML = leaderboard.length === 0
        ? '<li>暂无记录</li>'
        : leaderboard.map((item, i) => `
            <li class="${i < 3 ? 'top-' + (i + 1) : ''}">
                <span class="rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i + 1)}</span>
                <span class="score">${item.score}分</span>
                <span class="milestone">第${item.milestone || Math.floor(item.score / 5000) + 1}个里程碑</span>
                <span class="date">${item.date}</span>
            </li>
        `).join('');
    modal.classList.add('show');
}

// ============ 成就系统 ============
const ACHIEVEMENTS = [
    { id: 'score1000', name: '千分俱乐部', desc: '单局达到1000分', check: (s) => s.score >= 1000 },
    { id: 'score5000', name: '五千元户', desc: '单局达到5000分', check: (s) => s.score >= 5000 },
    { id: 'score10000', name: '万分达人', desc: '单局达到10000分', check: (s) => s.score >= 10000 },
    { id: 'score50000', name: '消除传奇', desc: '单局达到50000分', check: (s) => s.score >= 50000 },
    { id: 'clear100', name: '清理大师', desc: '累计消除100个方块', check: (s) => s.totalCleared >= 100 },
    { id: 'clear500', name: '消除狂人', desc: '累计消除500个方块', check: (s) => s.totalCleared >= 500 },
    { id: 'clear1000', name: '消除之神', desc: '累计消除1000个方块', check: (s) => s.totalCleared >= 1000 },
    { id: 'combo3', name: '连击新星', desc: '达成3连击', check: (s) => s.comboCount >= 3 },
    { id: 'combo5', name: '连击之王', desc: '达成5连击', check: (s) => s.comboCount >= 5 },
    { id: 'combo10', name: '连击之神', desc: '达成10连击', check: (s) => s.comboCount >= 10 },
    { id: 'vortex3', name: '风暴之眼', desc: '单局触发3次漩涡', check: (s) => s.vortexTriggered >= 3 },
    { id: 'vortex10', name: '黑洞吞噬', desc: '单局触发10次漩涡', check: (s) => s.vortexTriggered >= 10 },
    { id: 'chain3', name: '连锁反应', desc: '达成3重连锁', check: (s) => s.bestChain >= 3 },
    { id: 'chain5', name: '核裂变', desc: '达成5重连锁', check: (s) => s.bestChain >= 5 },
    { id: 'rainbow_bomb', name: '终极毁灭', desc: '合成一次彩虹炸弹组合', check: (s) => s.rainbowCombos > 0 },
    { id: 'energy10', name: '能量大师', desc: '单局释放10次能量技能', check: (s) => s.energyUsed >= 10 },
];

function getAchievements() {
    try { return JSON.parse(localStorage.getItem(ACHIEVEMENTS_KEY)) || []; }
    catch { return []; }
}

let rainbowComboCount = 0;
let energyUsedCount = 0;
let bestChainEver = 0;

function checkAchievements() {
    const unlocked = getAchievements();
    const state = {
        score, totalCleared, comboCount,
        vortexTriggered: vortexTriggerCount,
        bestChain: bestChainEver,
        rainbowCombos: rainbowComboCount,
        energyUsed: energyUsedCount
    };
    ACHIEVEMENTS.forEach(a => {
        if (!unlocked.includes(a.id) && a.check(state)) {
            unlocked.push(a.id);
            showAchievementUnlock(a);
        }
    });
    localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(unlocked));
}

function showAchievementUnlock(achievement) {
    const toast = document.createElement('div');
    toast.className = 'achievement-toast';
    toast.innerHTML = `
        <div class="achievement-icon">🏆</div>
        <div class="achievement-info">
            <div class="achievement-title">成就解锁!</div>
            <div class="achievement-name">${achievement.name}</div>
            <div class="achievement-desc">${achievement.desc}</div>
        </div>
    `;
    document.body.appendChild(toast);
    playMilestoneSound();
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => toast.classList.remove('show'), 3000);
    setTimeout(() => toast.remove(), 3500);
}

function showAchievements() {
    const modal = document.getElementById('achievements-modal');
    const list = document.getElementById('achievements-list');
    const unlocked = getAchievements();
    list.innerHTML = ACHIEVEMENTS.map(a => `
        <li class="${unlocked.includes(a.id) ? 'unlocked' : 'locked'}">
            <span class="achievement-icon">${unlocked.includes(a.id) ? '🏆' : '🔒'}</span>
            <span class="achievement-name">${a.name}</span>
            <span class="achievement-desc">${a.desc}</span>
        </li>
    `).join('');
    modal.classList.add('show');
}

function gameOver() {
    if (score > 0) saveToLeaderboard(score);
}

// ============ 匹配检测 ============
function hasMatches() {
    for (let row = 0; row < GRID_SIZE; row++)
        for (let col = 0; col < GRID_SIZE; col++)
            if (isPartOfMatch(row, col)) return true;
    return false;
}

function isPartOfMatch(row, col) {
    const color = board[row][col];
    let hCount = 1;
    let left = col - 1;
    while (left >= 0 && (board[row][left] === color || isRainbow(board[row][left]) || isRainbow(color))) { hCount++; left--; }
    let right = col + 1;
    while (right < GRID_SIZE && (board[row][right] === color || isRainbow(board[row][right]) || isRainbow(color))) { hCount++; right++; }
    let vCount = 1;
    let up = row - 1;
    while (up >= 0 && (board[up][col] === color || isRainbow(board[up][col]) || isRainbow(color))) { vCount++; up--; }
    let down = row + 1;
    while (down < GRID_SIZE && (board[down][col] === color || isRainbow(board[down][col]) || isRainbow(color))) { vCount++; down++; }
    return hCount >= 3 || vCount >= 3;
}

function isRainbow(emoji) { return emoji === SPECIAL_TYPES.RAINBOW; }
function isSpecialBlock(emoji) {
    return emoji === SPECIAL_TYPES.BOMB || emoji === SPECIAL_TYPES.HORIZONTAL ||
           emoji === SPECIAL_TYPES.VERTICAL || emoji === SPECIAL_TYPES.VORTEX;
}

// ============ 核心：消除处理（加入连锁奖励） ============
function processMatches() {
    const matchedCells = [];
    for (let row = 0; row < GRID_SIZE; row++)
        for (let col = 0; col < GRID_SIZE; col++)
            if (isPartOfMatch(row, col)) matchedCells.push({ row, col });

    const specialEffects = [];
    const vortexCells = [];

    matchedCells.forEach(cell => {
        const emoji = board[cell.row][cell.col];
        const cellKey = `${cell.row},${cell.col}`;
        if (triggeredSpecials.has(cellKey)) return;

        if (emoji === SPECIAL_TYPES.BOMB) {
            triggeredSpecials.add(cellKey);
            for (let dr = -1; dr <= 1; dr++)
                for (let dc = -1; dc <= 1; dc++) {
                    const r = cell.row + dr, c = cell.col + dc;
                    if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE && !(dr === 0 && dc === 0))
                        specialEffects.push({ row: r, col: c });
                }
        } else if (emoji === SPECIAL_TYPES.HORIZONTAL) {
            triggeredSpecials.add(cellKey);
            for (let c = 0; c < GRID_SIZE; c++) if (c !== cell.col) specialEffects.push({ row: cell.row, col: c });
        } else if (emoji === SPECIAL_TYPES.VERTICAL) {
            triggeredSpecials.add(cellKey);
            for (let r = 0; r < GRID_SIZE; r++) if (r !== cell.row) specialEffects.push({ row: r, col: cell.col });
        } else if (emoji === SPECIAL_TYPES.VORTEX) {
            triggeredSpecials.add(cellKey);
            vortexCells.push(cell);
        }
    });

    // 漩涡 3x3
    vortexCells.forEach(vCell => {
        vortexTriggerCount++;
        for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++) {
                const r = vCell.row + dr, c = vCell.col + dc;
                if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) {
                    if (!specialEffects.some(e => e.row === r && e.col === c))
                        specialEffects.push({ row: r, col: c });
                    const key = `${r},${c}`;
                    const innerEmoji = board[r][c];
                    if (!triggeredSpecials.has(key) && isSpecialBlock(innerEmoji) && !(dr === 0 && dc === 0)) {
                        triggeredSpecials.add(key);
                        triggerChainEffect(r, c, innerEmoji, specialEffects);
                    }
                }
            }
    });

    // 合并
    specialEffects.forEach(effect => {
        if (!matchedCells.some(c => c.row === effect.row && c.col === effect.col))
            matchedCells.push(effect);
    });

    comboCount++;
    chainCount++;  // 连锁层数 +1
    bestChainThisTurn = Math.max(bestChainThisTurn, chainCount);
    bestChainEver = Math.max(bestChainEver, chainCount);
    totalCleared += matchedCells.length;

    // 音效
    if (vortexCells.length > 0) playVortexSound();
    else playMatchSound();

    // 连锁音效（3层以上）
    if (chainCount >= 2) playChainSound(chainCount);

    showClearAnimation(matchedCells);
    if (vortexCells.length > 0) showVortexAnimation(vortexCells);

    matchedCells.forEach(cell => { board[cell.row][cell.col] = null; });

    // ====== 计算分数（加入连锁奖励） ======
    const baseScore = matchedCells.length * 10;
    const comboBonus = comboCount > 1 ? comboCount * 5 : 0;
    const vortexBonus = vortexCells.length * 50;

    // 连锁奖励
    let chainBonus = 0;
    const chainReward = getChainReward(chainCount);
    if (chainReward) {
        chainBonus = Math.floor(baseScore * (chainReward.multiplier - 1));
        showChainReward(chainCount, chainBonus);
    }

    score += baseScore + comboBonus + vortexBonus + chainBonus;

    // 能量充能
    addEnergy(matchedCells.length);

    updateScore();

    if (comboCount > 1) showComboText(comboCount);
    if (vortexCells.length > 0) showVortexText(vortexCells.length);

    // 新增：连击边框特效
    updateComboEffects(comboCount);

    renderBoard();

    setTimeout(() => {
        dropCells();
        fillEmpty();
        renderBoard();

        if (hasMatches()) {
            // 自动连锁 — 不需要额外处理，chainCount 会在下一轮 processMatches 中继续递增
            setTimeout(() => processMatches(), 300);
        } else {
            isProcessing = false;
            comboCount = 0;
            chainCount = 0;
            bestChainThisTurn = 0;
            triggeredSpecials.clear();
            clearComboEffects();  // 新增：清除连击特效
            checkAchievements();

            if (!hasValidMoves()) {
                showShuffleMessage();
                setTimeout(() => shuffleBoard(), 1000);
            }
        }
    }, 300);
}

function triggerChainEffect(row, col, emoji, effects) {
    if (emoji === SPECIAL_TYPES.BOMB) {
        for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++) {
                const r = row + dr, c = col + dc;
                if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE)
                    effects.push({ row: r, col: c });
            }
    } else if (emoji === SPECIAL_TYPES.HORIZONTAL) {
        for (let c = 0; c < GRID_SIZE; c++) effects.push({ row, col: c });
    } else if (emoji === SPECIAL_TYPES.VERTICAL) {
        for (let r = 0; r < GRID_SIZE; r++) effects.push({ row: r, col });
    } else if (emoji === SPECIAL_TYPES.VORTEX) {
        // 漩涡在连锁中也触发3x3
        for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++) {
                const r = row + dr, c = col + dc;
                if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE)
                    effects.push({ row: r, col: c });
            }
    }
}

// ============ 动画显示 ============
// ============ 新增：粒子系统 ============
const PARTICLE_COLORS = {
    '🔴': ['#ff6b6b', '#ff3333', '#ff8888', '#cc0000'],
    '🟡': ['#ffd93d', '#ffea00', '#ffcc00', '#ffaa00'],
    '🟢': ['#6bcf7f', '#00e676', '#4caf50', '#2e7d32'],
    '🔵': ['#4d96ff', '#2979ff', '#00b0ff', '#0091ea'],
    '🟣': ['#b565d8', '#9c27b0', '#e040fb', '#7b1fa2'],
    '🟠': ['#ff9f43', '#ff6d00', '#ffa726', '#e65100'],
    '💣': ['#ff0000', '#8b0000', '#ff4444', '#cc0000'],
    '🌈': ['#ff6b6b', '#ffd93d', '#6bcf7f', '#4d96ff', '#b565d8'],
    '↔️': ['#00bfff', '#00e5ff', '#0091ea', '#00b0ff'],
    '↕️': ['#00ced1', '#00bfa5', '#00897b', '#26a69a'],
    '🌀': ['#9b30ff', '#6a0dad', '#bf5fff', '#e040fb'],
};

const PARTICLE_DEFAULT = ['#ffffff', '#ffd700', '#ff6b6b', '#4d96ff', '#b565d8'];

function getParticleColors(emoji) {
    return PARTICLE_COLORS[emoji] || PARTICLE_DEFAULT;
}

function spawnParticles(row, col, emoji, count = 10) {
    const boardEl = document.getElementById('game-board');
    const cell = boardEl.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (!cell) return;

    const rect = cell.getBoundingClientRect();
    const boardRect = boardEl.getBoundingClientRect();
    const cx = rect.left - boardRect.left + rect.width / 2;
    const cy = rect.top - boardRect.top + rect.height / 2;
    const colors = getParticleColors(emoji);

    boardEl.style.position = 'relative';
    boardEl.style.overflow = 'hidden';

    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.5;
        const distance = 30 + Math.random() * 50;
        const size = 4 + Math.random() * 5;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const duration = 300 + Math.random() * 200;

        p.style.cssText = `
            position: absolute;
            left: ${cx}px;
            top: ${cy}px;
            width: ${size}px;
            height: ${size}px;
            border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
            background: ${color};
            box-shadow: 0 0 ${size}px ${color};
            pointer-events: none;
            z-index: 50;
            transition: all ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
            opacity: 1;
        `;
        boardEl.appendChild(p);

        // 触发动画
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                p.style.left = (cx + Math.cos(angle) * distance) + 'px';
                p.style.top = (cy + Math.sin(angle) * distance) + 'px';
                p.style.opacity = '0';
                p.style.transform = `scale(0.2) rotate(${Math.random() * 360}deg)`;
            });
        });

        setTimeout(() => p.remove(), duration + 50);
    }
}

// ============ 消除动画（加入粒子） ============
function showClearAnimation(cells) {
    const allCells = document.querySelectorAll('.cell');
    cells.forEach(({ row, col }) => {
        const index = row * GRID_SIZE + col;
        if (allCells[index]) {
            const emoji = board[row][col];
            // 保留原清除动画
            allCells[index].classList.add('clearing');
            // 同时生成粒子
            spawnParticles(row, col, emoji, 8);
        }
    });
}

function showVortexAnimation(cells) {
    cells.forEach(({ row, col }) => {
        const vortex = document.createElement('div');
        vortex.className = 'vortex-effect';
        const boardEl = document.getElementById('game-board');
        const cellSize = boardEl.querySelector('.cell')?.offsetWidth || 50;
        const gap = 4;
        vortex.style.cssText = `
            position: absolute;
            left: ${10 + col * (cellSize + gap) + cellSize / 2}px;
            top: ${10 + row * (cellSize + gap) + cellSize / 2}px;
            width: ${cellSize * 3 + gap * 2}px;
            height: ${cellSize * 3 + gap * 2}px;
            transform: translate(-50%, -50%);
            pointer-events: none;
            z-index: 100;
        `;
        boardEl.style.position = 'relative';
        boardEl.appendChild(vortex);
        setTimeout(() => vortex.remove(), 800);
    });
}

function showVortexText(count) {
    const el = document.createElement('div');
    el.innerHTML = `🌀 漩涡吞噬 x${count}!`;
    el.style.cssText = `
        position: fixed; top: 45%; left: 50%;
        transform: translate(-50%, -50%);
        font-size: 24px; font-weight: bold;
        color: #bf5fff;
        text-shadow: 0 0 10px #6a0dad, 0 0 20px #6a0dad;
        pointer-events: none; z-index: 1000;
        animation: vortex-pop 1s ease-out forwards;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
}

function showComboText(combo) {
    const el = document.createElement('div');
    el.textContent = `${combo}x 连击! 🔥`;
    el.style.cssText = `
        position: fixed; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        font-size: ${20 + combo * 5}px;
        font-weight: bold; color: #ff6b6b;
        text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        animation: combo-pop 0.8s ease-out forwards;
        pointer-events: none; z-index: 1000;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 800);
}

function showRainbowComboText(text) {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = `
        position: fixed; top: 38%; left: 50%;
        transform: translate(-50%, -50%) scale(0.5);
        font-size: 28px; font-weight: bold;
        color: #ffd700;
        text-shadow: 0 0 20px #ff6b00, 0 0 40px #ff0000;
        pointer-events: none; z-index: 1002;
        animation: rainbow-combo-pop 1.5s ease-out forwards;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1600);
}

// ============ 新增：连击边框特效 ============
const COMBO_EFFECT_LEVELS = [
    { min: 2, cls: 'combo-glow-1' },   // 温和的橙色光晕
    { min: 3, cls: 'combo-fire-1' },   // 火焰
    { min: 4, cls: 'combo-fire-2' },   // 猛烈火焰
    { min: 5, cls: 'combo-lightning' }, // 闪电
];

let comboEffectTimer = null;

function updateComboEffects(combo) {
    const boardWrapper = document.querySelector('.board-wrapper');
    if (!boardWrapper) return;

    // 清除旧效果
    COMBO_EFFECT_LEVELS.forEach(e => boardWrapper.classList.remove(e.cls));

    // 确定当前等级
    let activeEffect = null;
    for (let i = COMBO_EFFECT_LEVELS.length - 1; i >= 0; i--) {
        if (combo >= COMBO_EFFECT_LEVELS[i].min) {
            activeEffect = COMBO_EFFECT_LEVELS[i];
            break;
        }
    }

    if (activeEffect) {
        boardWrapper.classList.add(activeEffect.cls);
    }
}

function clearComboEffects() {
    const boardWrapper = document.querySelector('.board-wrapper');
    if (!boardWrapper) return;
    // 延迟清除，让效果有个渐退的感觉
    if (comboEffectTimer) clearTimeout(comboEffectTimer);
    comboEffectTimer = setTimeout(() => {
        COMBO_EFFECT_LEVELS.forEach(e => boardWrapper.classList.remove(e.cls));
    }, 800);
}

function showMilestoneText(milestone) {
    const msg = document.createElement('div');
    msg.className = 'milestone-text';
    msg.innerHTML = `🎉 恭喜达到 <strong>${milestone}</strong> 分！`;
    msg.style.cssText = `
        position: fixed; top: 50%; left: 50%;
        transform: translate(-50%, -50%) scale(0);
        font-size: 28px; font-weight: bold; color: #ffd700;
        text-shadow: 2px 2px 8px rgba(0,0,0,0.5);
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        padding: 20px 40px; border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.4);
        animation: milestone-pop 2s ease-out forwards;
        pointer-events: none; z-index: 1000;
    `;
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 2500);
}

// ============ 撤销 ============
function saveUndoState() {
    undoStack.push({
        board: board.map(row => [...row]),
        score, comboCount, totalCleared,
        energy,  // 新增：能量也回滚
        chainCount, bestChainThisTurn
    });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    updateUndoButton();
}

function undo() {
    if (undoStack.length === 0) return;
    const state = undoStack.pop();
    board = state.board;
    score = state.score;
    comboCount = state.comboCount;
    totalCleared = state.totalCleared;
    energy = state.energy || 0;
    chainCount = state.chainCount || 0;
    bestChainThisTurn = state.bestChainThisTurn || 0;
    updateScore();
    updateMoveCount();
    updateEnergyBar();
    renderBoard();
    updateUndoButton();
}

function updateUndoButton() {
    const btn = document.getElementById('undo');
    if (btn) {
        btn.disabled = undoStack.length === 0;
        btn.textContent = `↩️ 撤销 (${undoStack.length})`;
    }
}

// ============ 提示 ============
function showHint() {
    for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
            if (col < GRID_SIZE - 1) {
                swapInPlace(row, col, row, col + 1);
                if (hasMatches()) { swapInPlace(row, col, row, col + 1); highlightHint(row, col, row, col + 1); return; }
                swapInPlace(row, col, row, col + 1);
            }
            if (row < GRID_SIZE - 1) {
                swapInPlace(row, col, row + 1, col);
                if (hasMatches()) { swapInPlace(row, col, row + 1, col); highlightHint(row, col, row + 1, col); return; }
                swapInPlace(row, col, row + 1, col);
            }
        }
    }
}

function swapInPlace(r1, c1, r2, c2) {
    const temp = board[r1][c1]; board[r1][c1] = board[r2][c2]; board[r2][c2] = temp;
}

function highlightHint(r1, c1, r2, c2) {
    const cells = document.querySelectorAll('.cell');
    const i1 = r1 * GRID_SIZE + c1, i2 = r2 * GRID_SIZE + c2;
    cells[i1].classList.add('hint');
    cells[i2].classList.add('hint');
    setTimeout(() => { cells[i1].classList.remove('hint'); cells[i2].classList.remove('hint'); }, 1500);
}

function updateMoveCount() {
    const el = document.getElementById('move-count');
    if (el) el.textContent = moveCount;
}

// ============ 死局检测 ============
function hasValidMoves() {
    for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
            if (col < GRID_SIZE - 1) {
                swapInPlace(row, col, row, col + 1);
                if (hasMatches()) { swapInPlace(row, col, row, col + 1); return true; }
                swapInPlace(row, col, row, col + 1);
            }
            if (row < GRID_SIZE - 1) {
                swapInPlace(row, col, row + 1, col);
                if (hasMatches()) { swapInPlace(row, col, row + 1, col); return true; }
                swapInPlace(row, col, row + 1, col);
            }
        }
    }
    return false;
}

function shuffleBoard(maxRetries = 10) {
    if (maxRetries <= 0) { board = createBoard(); renderBoard(); return; }
    const allCells = [];
    for (let row = 0; row < GRID_SIZE; row++)
        for (let col = 0; col < GRID_SIZE; col++) allCells.push(board[row][col]);
    for (let i = allCells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allCells[i], allCells[j]] = [allCells[j], allCells[i]];
    }
    let index = 0;
    for (let row = 0; row < GRID_SIZE; row++)
        for (let col = 0; col < GRID_SIZE; col++) board[row][col] = allCells[index++];
    renderBoard();
    if (!hasValidMoves()) setTimeout(() => shuffleBoard(maxRetries - 1), 300);
}

function showShuffleMessage() {
    const msg = document.createElement('div');
    msg.textContent = '🔄 没有可移动的方块，自动重新排列中...';
    msg.style.cssText = `
        position: fixed; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.8); color: white;
        padding: 20px 30px; border-radius: 12px;
        font-size: 16px; z-index: 1000;
    `;
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 1500);
}

// ============ 下落与填充 ============
// 新增：记录需要弹跳动画的格子
let springCells = new Set();

function dropCells() {
    for (let col = 0; col < GRID_SIZE; col++) {
        let emptyRow = GRID_SIZE - 1;
        for (let row = GRID_SIZE - 1; row >= 0; row--) {
            if (board[row][col] !== null) {
                if (row !== emptyRow) {
                    board[emptyRow][col] = board[row][col];
                    board[row][col] = null;
                    // 标记移动到新位置的格子（弹跳动画）
                    springCells.add(`${emptyRow},${col}`);
                }
                emptyRow--;
            }
        }
    }
}

function fillEmpty() {
    for (let row = 0; row < GRID_SIZE; row++)
        for (let col = 0; col < GRID_SIZE; col++)
            if (board[row][col] === null) {
                board[row][col] = getRandomColor();
                // 新填充的格子也要弹跳
                springCells.add(`${row},${col}`);
            }
}

// ============ 分数与里程碑 ============
function updateScore() {
    document.getElementById('score').textContent = score;
    const currentMilestone = Math.floor(score / 5000);
    if (currentMilestone > lastMilestone) {
        lastMilestone = currentMilestone;
        celebrateMilestone();
        targetScore = (currentMilestone + 1) * 5000;
        updateTargetInfo();
        saveToLeaderboard(score, Math.floor(score / 5000) + 1);
    }
}

function updateTargetInfo() { document.getElementById('target-score').textContent = targetScore; }

function awardRainbowForMilestone() {
    board[Math.floor(Math.random() * GRID_SIZE)][Math.floor(Math.random() * GRID_SIZE)] = SPECIAL_TYPES.RAINBOW;
    renderBoard();
}

function celebrateMilestone() {
    awardRainbowForMilestone();
    document.body.classList.add('flash');
    setTimeout(() => document.body.classList.remove('flash'), 1000);
    playMilestoneSound();
    createConfetti();
    showMilestoneText(lastMilestone * 5000);
}

function createConfetti() {
    const colors = ['#ff6b6b', '#ffd93d', '#6bcf7f', '#4d96ff', '#b565d8', '#ff9f43'];
    const container = document.querySelector('.container');
    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.top = '-10px';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
        confetti.style.animationDelay = Math.random() * 0.3 + 's';
        container.appendChild(confetti);
        setTimeout(() => confetti.remove(), 2000);
    }
}

// ============ 事件绑定 ============
document.addEventListener('DOMContentLoaded', () => {
    initGame();

    document.getElementById('restart').addEventListener('click', () => {
        gameOver();
        score = 0;
        vortexTriggerCount = 0;
        rainbowComboCount = 0;
        energyUsedCount = 0;
        bestChainEver = 0;
        lastMilestone = 0;
        initGame();
    });

    document.getElementById('sound-toggle').addEventListener('click', (e) => {
        soundEnabled = !soundEnabled;
        e.target.textContent = soundEnabled ? '🔊 音效' : '🔇 静音';
        if (soundEnabled) { initAudio(); startBgMusic(); } else { stopBgMusic(); }
    });

    document.getElementById('undo').addEventListener('click', undo);
    document.getElementById('hint').addEventListener('click', showHint);
    document.getElementById('leaderboard-btn').addEventListener('click', showLeaderboard);
    document.getElementById('achievements-btn').addEventListener('click', showAchievements);

    // 新增：能量按钮绑定
    document.getElementById('energy-btn').addEventListener('click', toggleEnergyMode);

    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(m => m.classList.remove('show'));
        });
    });

    window.addEventListener('beforeunload', () => {
        if (score > 0) saveToLeaderboard(score);
    });

    // 移动端：页面隐藏时停止音乐，回到前台时恢复
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopBgMusic();
        } else if (soundEnabled) {
            initAudio();
            startBgMusic();
        }
    });

    // 兼容部分浏览器的 pagehide 事件
    window.addEventListener('pagehide', () => {
        stopBgMusic();
    });
});
