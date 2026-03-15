// 游戏配置
const GRID_SIZE = 8;  // 8x8 网格
const COLORS = ['🔴', '🟡', '🟢', '🔵', '🟣', '🟠'];  // 6种颜色的方块
const SPECIAL_TYPES = {
  BOMB: '💣',      // 炸弹：消除周围8个方块
  RAINBOW: '🌈',   // 彩虹：可以与任何颜色匹配
  HORIZONTAL: '↔️', // 水平消除：消除整行
  VERTICAL: '↕️'    // 垂直消除：消除整列
};

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
let level = 1;  // 当前里程碑等级（每5000分升一级）

// 音频上下文
let audioContext = null;

// 初始化音频
function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
}

// 播放点击音效
function playClickSound() {
    if (!soundEnabled || !audioContext) return;
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
}

// 播放消除音效
function playMatchSound() {
    if (!soundEnabled || !audioContext) return;
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 1200;
    oscillator.type = 'square';
    
    gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
}

// 播放里程碑音效
function playMilestoneSound() {
    if (!soundEnabled || !audioContext) return;
    
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = freq;
        oscillator.type = 'sine';
        
        const startTime = audioContext.currentTime + i * 0.1;
        gainNode.gain.setValueAtTime(0.3, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);
        
        oscillator.start(startTime);
        oscillator.stop(startTime + 0.3);
    });
}

// 播放背景音乐音符 - 使用更柔和的音色
function playBgNote(frequency, duration) {
    if (!soundEnabled || !audioContext) return;
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine'; // 使用正弦波，更柔和
    
    // 更低的音量，更轻柔
    gainNode.gain.setValueAtTime(0.06, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
}

// 开始背景音乐 - River Flows in You (简化版)
function startBgMusic() {
    if (bgMusicInterval) return;
    
    // River Flows in You 主旋律 (Yiruma)
    // 简化版本，保留原曲精髓
    // A大调: F# G# A B C# D E F#
    const melody = [
        // 第一句 - 经典开头
        { note: 698, duration: 0.3 },  // F5
        { note: 659, duration: 0.3 },  // E5
        { note: 587, duration: 0.6 },  // D5
        { note: 659, duration: 0.3 },  // E5
        { note: 698, duration: 0.3 },  // F5
        { note: 880, duration: 0.6 },  // A5
        { note: 0, duration: 0.3 },    // 休止
        
        // 第二句 - 上升
        { note: 698, duration: 0.3 },  // F5
        { note: 659, duration: 0.3 },  // E5
        { note: 587, duration: 0.6 },  // D5
        { note: 659, duration: 0.3 },  // E5
        { note: 698, duration: 0.3 },  // F5
        { note: 784, duration: 0.6 },  // G5
        { note: 0, duration: 0.3 },    // 休止
        
        // 第三句 - 高潮
        { note: 698, duration: 0.3 },  // F5
        { note: 659, duration: 0.3 },  // E5
        { note: 587, duration: 0.3 },  // D5
        { note: 523, duration: 0.3 },  // C5
        { note: 587, duration: 0.3 },  // D5
        { note: 659, duration: 0.6 },  // E5
        { note: 587, duration: 0.6 },  // D5
        { note: 0, duration: 0.3 },    // 休止
        
        // 第四句 - 回落
        { note: 523, duration: 0.3 },  // C5
        { note: 587, duration: 0.3 },  // D5
        { note: 659, duration: 0.6 },  // E5
        { note: 587, duration: 0.3 },  // D5
        { note: 523, duration: 0.3 },  // C5
        { note: 440, duration: 0.9 },  // A4
        { note: 0, duration: 0.6 },    // 休止
    ];
    
    let noteIndex = 0;
    
    const playNextNote = () => {
        if (!soundEnabled) return;
        
        const currentNote = melody[noteIndex];
        if (currentNote.note > 0) {
            // 柔和的钢琴音色
            playPianoNote(currentNote.note, currentNote.duration);
        }
        
        noteIndex = (noteIndex + 1) % melody.length;
    };
    
    playNextNote();
    bgMusicInterval = setInterval(() => {
        playNextNote();
    }, 400); // 400ms间隔
}

// 播放钢琴音符 - 更接近钢琴音色
function playPianoNote(frequency, duration) {
    if (!soundEnabled || !audioContext) return;
    
    // 主振荡器 - 基础音
    const osc1 = audioContext.createOscillator();
    const gain1 = audioContext.createGain();
    
    // 第二振荡器 - 泛音，增加丰富度
    const osc2 = audioContext.createOscillator();
    const gain2 = audioContext.createGain();
    
    osc1.connect(gain1);
    gain1.connect(audioContext.destination);
    
    osc2.connect(gain2);
    gain2.connect(audioContext.destination);
    
    // 主音 - 使用三角波，接近钢琴
    osc1.frequency.value = frequency;
    osc1.type = 'triangle';
    
    // 泛音 - 高八度，音量更小
    osc2.frequency.value = frequency * 2;
    osc2.type = 'sine';
    
    // 钢琴包络：快速起音，缓慢衰减
    const now = audioContext.currentTime;
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.08, now + 0.02); // 快速起音
    gain1.gain.exponentialRampToValueAtTime(0.01, now + duration); // 缓慢衰减
    
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.linearRampToValueAtTime(0.02, now + 0.02);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + duration);
    
    osc1.start(now);
    osc1.stop(now + duration);
    
    osc2.start(now);
    osc2.stop(now + duration);
}

// 停止背景音乐
function stopBgMusic() {
    if (bgMusicInterval) {
        clearInterval(bgMusicInterval);
        bgMusicInterval = null;
    }
}

// 初始化游戏
function initGame() {
    score = 0;
    moveCount = 0;
    comboCount = 0;
    totalCleared = 0;
    undoStack = [];
    triggeredSpecials.clear();
    isProcessing = false;
    
    // 从排行榜获取上次最高分，作为初始目标
    const leaderboard = getLeaderboard();
    const lastHighScore = leaderboard.length > 0 ? leaderboard[0].score : 0;
    // 目标为上次最高分向上取整到5000的倍数，最低5000
    targetScore = Math.max(5000, Math.ceil((lastHighScore + 1) / 5000) * 5000);
    lastMilestone = Math.floor(targetScore / 5000) - 1;
    
    updateScore();
    updateTargetInfo();
    updateMoveCount();
    board = createBoard();
    renderBoard();
    
    // 启动背景音乐
    if (soundEnabled) {
        initAudio();
        startBgMusic();
    }
}

// 创建游戏棋盘
function createBoard() {
    const newBoard = [];
    // 特殊方块概率固定5%
    const specialChance = 0.05;
    
    for (let row = 0; row < GRID_SIZE; row++) {
        newBoard[row] = [];
        for (let col = 0; col < GRID_SIZE; col++) {
            if (Math.random() < specialChance) {
                // 炸弹和消除类方块概率较低（防止连锁太强）
                const random = Math.random();
                if (random < 0.4) {
                    newBoard[row][col] = SPECIAL_TYPES.RAINBOW;
                } else if (random < 0.6) {
                    newBoard[row][col] = SPECIAL_TYPES.BOMB;
                } else if (random < 0.8) {
                    newBoard[row][col] = SPECIAL_TYPES.HORIZONTAL;
                } else {
                    newBoard[row][col] = SPECIAL_TYPES.VERTICAL;
                }
            } else {
                newBoard[row][col] = getRandomColor();
            }
        }
    }
    return newBoard;
}

// 获取随机颜色
function getRandomColor() {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
}

// 渲染游戏棋盘
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
            
            // 为特殊方块添加标识属性
            if (emoji === SPECIAL_TYPES.BOMB) cell.dataset.special = 'bomb';
            else if (emoji === SPECIAL_TYPES.RAINBOW) cell.dataset.special = 'rainbow';
            else if (emoji === SPECIAL_TYPES.HORIZONTAL) cell.dataset.special = 'horizontal';
            else if (emoji === SPECIAL_TYPES.VERTICAL) cell.dataset.special = 'vertical';
            
            // 触摸事件优先处理（小狐狸建议：避免touch和click重复触发）
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
                if (isTouchEvent) {
                    isTouchEvent = false;  // 如果是触摸触发的，忽略click
                    return;
                }
                handleCellClick(row, col);
            });
            gameBoard.appendChild(cell);
        }
    }
}

// 获取方块背景色
function getCellColor(emoji) {
    const colorMap = {
        '🔴': '#ff6b6b',
        '🟡': '#ffd93d',
        '🟢': '#6bcf7f',
        '🔵': '#4d96ff',
        '🟣': '#b565d8',
        '🟠': '#ff9f43',
        '💣': '#8b0000',      // 炸弹 - 深红色
        '🌈': '#9400d3',      // 彩虹 - 紫色
        '↔️': '#00bfff',      // 水平消除 - 深天蓝
        '↕️': '#00ced1'       // 垂直消除 - 暗青色
    };
    return colorMap[emoji] || '#ccc';
}

// 处理方块点击
function handleCellClick(row, col) {
    initAudio(); // 确保音频已初始化
    playClickSound(); // 播放点击音效
    
    if (!selectedCell) {
        // 第一次点击：选中方块
        selectedCell = { row, col };
        highlightCell(row, col, true);
    } else {
        // 第二次点击：尝试交换
        if (isAdjacent(selectedCell, { row, col })) {
            swapCells(selectedCell, { row, col });
            highlightCell(selectedCell.row, selectedCell.col, false);
            selectedCell = null;
        } else {
            // 点击了不相邻的方块，重新选择
            highlightCell(selectedCell.row, selectedCell.col, false);
            selectedCell = { row, col };
            highlightCell(row, col, true);
        }
    }
}

// 高亮显示选中的方块
function highlightCell(row, col, highlight) {
    const cells = document.querySelectorAll('.cell');
    const index = row * GRID_SIZE + col;
    if (highlight) {
        cells[index].classList.add('selected');
    } else {
        cells[index].classList.remove('selected');
    }
}

// 判断两个方块是否相邻
function isAdjacent(cell1, cell2) {
    const rowDiff = Math.abs(cell1.row - cell2.row);
    const colDiff = Math.abs(cell1.col - cell2.col);
    return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
}

// 交换两个方块
function swapCells(cell1, cell2) {
    // 先检查是否有匹配，不匹配就不保存撤销状态（小狐狸建议）
    const temp = board[cell1.row][cell1.col];
    board[cell1.row][cell1.col] = board[cell2.row][cell2.col];
    board[cell2.row][cell2.col] = temp;
    
    renderBoard();
    
    // 检查是否有匹配
    if (hasMatches()) {
        // 有匹配才保存撤销状态
        saveUndoState();
        moveCount++;
        updateMoveCount();
        comboCount = 0;
        setTimeout(() => {
            processMatches();
        }, 300);
    } else {
        // 没有匹配，直接交换回去
        setTimeout(() => {
            board[cell2.row][cell2.col] = board[cell1.row][cell1.col];
            board[cell1.row][cell1.col] = temp;
            renderBoard();
        }, 300);
    }
}

// 保存撤销状态
function saveUndoState() {
    undoStack.push({
        board: board.map(row => [...row]),
        score: score,
        level: level,
        comboCount: comboCount,
        totalCleared: totalCleared
    });
    if (undoStack.length > MAX_UNDO) {
        undoStack.shift();
    }
    updateUndoButton();
}

// 执行撤销
function undo() {
    if (undoStack.length === 0) return;
    
    const state = undoStack.pop();
    board = state.board;
    score = state.score;
    level = state.level;
    comboCount = state.comboCount;
    totalCleared = state.totalCleared;
    
    updateScore();
    updateLevelInfo();
    updateMoveCount();
    renderBoard();
    updateUndoButton();
}

// 更新撤销按钮状态
function updateUndoButton() {
    const undoBtn = document.getElementById('undo');
    if (undoBtn) {
        undoBtn.disabled = undoStack.length === 0;
        undoBtn.textContent = `↩️ 撤销 (${undoStack.length})`;
    }
}

// 提示功能
function showHint() {
    // 找到一个可执行的匹配
    for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
            // 检查与右边交换
            if (col < GRID_SIZE - 1) {
                swapInPlace(row, col, row, col + 1);
                if (hasMatches()) {
                    swapInPlace(row, col, row, col + 1);
                    highlightHint(row, col, row, col + 1);
                    return;
                }
                swapInPlace(row, col, row, col + 1);
            }
            // 检查与下面交换
            if (row < GRID_SIZE - 1) {
                swapInPlace(row, col, row + 1, col);
                if (hasMatches()) {
                    swapInPlace(row, col, row + 1, col);
                    highlightHint(row, col, row + 1, col);
                    return;
                }
                swapInPlace(row, col, row + 1, col);
            }
        }
    }
}

// 临时交换（用于提示检测）
function swapInPlace(r1, c1, r2, c2) {
    const temp = board[r1][c1];
    board[r1][c1] = board[r2][c2];
    board[r2][c2] = temp;
}

// 高亮显示提示
function highlightHint(r1, c1, r2, c2) {
    const cells = document.querySelectorAll('.cell');
    const index1 = r1 * GRID_SIZE + c1;
    const index2 = r2 * GRID_SIZE + c2;
    
    cells[index1].classList.add('hint');
    cells[index2].classList.add('hint');
    
    setTimeout(() => {
        cells[index1].classList.remove('hint');
        cells[index2].classList.remove('hint');
    }, 1500);
}

// 更新移动次数显示
function updateMoveCount() {
    const moveCountEl = document.getElementById('move-count');
    if (moveCountEl) {
        moveCountEl.textContent = moveCount;
    }
}

// 更新里程碑等级显示
function updateLevelInfo() {
    const levelEl = document.getElementById('level');
    if (levelEl) {
        levelEl.textContent = level;
    }
}

// ============ 排行榜系统 ============
const LEADERBOARD_KEY = 'survive_leaderboard';
const ACHIEVEMENTS_KEY = 'survive_achievements';

// 获取排行榜数据
function getLeaderboard() {
    try {
        const data = localStorage.getItem(LEADERBOARD_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

// 保存到排行榜
function saveToLeaderboard(score, milestone) {
    const leaderboard = getLeaderboard();
    leaderboard.push({
        score,
        milestone: milestone || Math.floor(score / 5000) + 1,
        date: new Date().toLocaleDateString('zh-CN'),
        totalCleared
    });
    // 按分数排序，保留前10名
    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard.splice(10);
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(leaderboard));
}

// 显示排行榜
function showLeaderboard() {
    const modal = document.getElementById('leaderboard-modal');
    const list = document.getElementById('leaderboard-list');
    const leaderboard = getLeaderboard();
    
    list.innerHTML = leaderboard.length === 0 
        ? '<li>暂无记录，快来创造第一个记录吧！</li>'
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
    { id: 'combo10', name: '连击之神', desc: '达成10连击', check: (s) => s.comboCount >= 10 }
];

// 获取已解锁成就
function getAchievements() {
    try {
        const data = localStorage.getItem(ACHIEVEMENTS_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

// 检查成就
function checkAchievements() {
    const unlocked = getAchievements();
    const state = { score, totalCleared, comboCount };
    
    ACHIEVEMENTS.forEach(achievement => {
        if (!unlocked.includes(achievement.id) && achievement.check(state)) {
            unlocked.push(achievement.id);
            showAchievementUnlock(achievement);
        }
    });
    
    localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(unlocked));
}

// 显示成就解锁
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

// 显示成就列表
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

// 游戏结束时保存记录
function gameOver() {
    if (score > 0) {
        saveToLeaderboard(score);
    }
}

// 检查是否有匹配
function hasMatches() {
    for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
            if (isPartOfMatch(row, col)) {
                return true;
            }
        }
    }
    return false;
}

// 检查某个方块是否是匹配的一部分
function isPartOfMatch(row, col) {
    const color = board[row][col];
    
    // 检查横向匹配
    let horizontalCount = 1;
    let left = col - 1;
    while (left >= 0 && (board[row][left] === color || isRainbow(board[row][left]) || isRainbow(color))) {
        horizontalCount++;
        left--;
    }
    let right = col + 1;
    while (right < GRID_SIZE && (board[row][right] === color || isRainbow(board[row][right]) || isRainbow(color))) {
        horizontalCount++;
        right++;
    }
    
    // 检查纵向匹配
    let verticalCount = 1;
    let up = row - 1;
    while (up >= 0 && (board[up][col] === color || isRainbow(board[up][col]) || isRainbow(color))) {
        verticalCount++;
        up--;
    }
    let down = row + 1;
    while (down < GRID_SIZE && (board[down][col] === color || isRainbow(board[down][col]) || isRainbow(color))) {
        verticalCount++;
        down++;
    }
    
    return horizontalCount >= 3 || verticalCount >= 3;
}

// 检查是否是彩虹方块（万能方块）
function isRainbow(emoji) {
    return emoji === SPECIAL_TYPES.RAINBOW;
}

// 处理匹配：消除并计分
function processMatches() {
    const matchedCells = [];
    
    // 找出所有匹配的方块
    for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
            if (isPartOfMatch(row, col)) {
                matchedCells.push({ row, col });
            }
        }
    }
    
    // 处理特殊方块效果（连锁保护：已触发的特殊方块当作普通方块处理）
    const specialEffects = [];
    matchedCells.forEach(cell => {
        const emoji = board[cell.row][cell.col];
        const cellKey = `${cell.row},${cell.col}`;
        
        // 如果这个特殊方块是被连锁消除的，不再触发特殊效果
        if (triggeredSpecials.has(cellKey)) return;
        
        if (emoji === SPECIAL_TYPES.BOMB) {
            triggeredSpecials.add(cellKey);
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const r = cell.row + dr;
                    const c = cell.col + dc;
                    if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE && !(dr === 0 && dc === 0)) {
                        specialEffects.push({ row: r, col: c });
                    }
                }
            }
        } else if (emoji === SPECIAL_TYPES.HORIZONTAL) {
            triggeredSpecials.add(cellKey);
            for (let c = 0; c < GRID_SIZE; c++) {
                if (c !== cell.col) {
                    specialEffects.push({ row: cell.row, col: c });
                }
            }
        } else if (emoji === SPECIAL_TYPES.VERTICAL) {
            triggeredSpecials.add(cellKey);
            for (let r = 0; r < GRID_SIZE; r++) {
                if (r !== cell.row) {
                    specialEffects.push({ row: r, col: cell.col });
                }
            }
        }
    });
    
    // 合并特殊效果
    specialEffects.forEach(effect => {
        const alreadyMatched = matchedCells.some(cell => cell.row === effect.row && cell.col === effect.col);
        if (!alreadyMatched) {
            matchedCells.push(effect);
        }
    });
    
    // 增加连击数
    comboCount++;
    totalCleared += matchedCells.length;
    
    // 播放消除音效
    playMatchSound();
    
    // 显示消除动画
    showClearAnimation(matchedCells);
    
    // 消除匹配的方块
    matchedCells.forEach(cell => {
        board[cell.row][cell.col] = null;
    });
    
    // 计算分数（连击加成）
    const comboBonus = comboCount > 1 ? comboCount * 5 : 0;
    score += matchedCells.length * 10 + comboBonus;
    updateScore();
    
    // 显示连击提示
    if (comboCount > 1) {
        showComboText(comboCount);
    }
    
    renderBoard();
    
    // 方块下落
    setTimeout(() => {
        dropCells();
        fillEmpty();
        renderBoard();
        
        if (hasMatches()) {
            setTimeout(() => processMatches(), 300);
        } else {
            comboCount = 0;
            triggeredSpecials.clear();
            checkAchievements();
            
            // 检查死局并自动洗牌
            if (!hasValidMoves()) {
                showShuffleMessage();
                setTimeout(() => {
                    shuffleBoard();
                }, 1000);
            }
        }
    }, 300);
}

// 显示消除动画
function showClearAnimation(cells) {
    const allCells = document.querySelectorAll('.cell');
    cells.forEach(({ row, col }) => {
        const index = row * GRID_SIZE + col;
        if (allCells[index]) {
            allCells[index].classList.add('clearing');
        }
    });
}

// 显示连击文字
function showComboText(combo) {
    const comboEl = document.createElement('div');
    comboEl.className = 'combo-text';
    comboEl.textContent = `${combo}x 连击! 🔥`;
    comboEl.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: ${20 + combo * 5}px;
        font-weight: bold;
        color: #ff6b6b;
        text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        animation: combo-pop 0.8s ease-out forwards;
        pointer-events: none;
        z-index: 1000;
    `;
    document.body.appendChild(comboEl);
    setTimeout(() => comboEl.remove(), 800);
}

// 显示里程碑祝贺文字
function showMilestoneText(milestone) {
    const msg = document.createElement('div');
    msg.className = 'milestone-text';
    msg.innerHTML = `🎉 恭喜达到 <strong>${milestone}</strong> 分！`;
    msg.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0);
        font-size: 28px;
        font-weight: bold;
        color: #ffd700;
        text-shadow: 2px 2px 8px rgba(0,0,0,0.5);
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        padding: 20px 40px;
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.4);
        animation: milestone-pop 2s ease-out forwards;
        pointer-events: none;
        z-index: 1000;
    `;
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 2500);
}

// ============ 死局检测和洗牌（小狐狸建议）============
// 检查是否有有效移动
function hasValidMoves() {
    for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
            // 检查与右边交换
            if (col < GRID_SIZE - 1) {
                swapInPlace(row, col, row, col + 1);
                if (hasMatches()) {
                    swapInPlace(row, col, row, col + 1);
                    return true;
                }
                swapInPlace(row, col, row, col + 1);
            }
            // 检查与下面交换
            if (row < GRID_SIZE - 1) {
                swapInPlace(row, col, row + 1, col);
                if (hasMatches()) {
                    swapInPlace(row, col, row + 1, col);
                    return true;
                }
                swapInPlace(row, col, row + 1, col);
            }
        }
    }
    return false;
}

// 洗牌棋盘（带安全计数器）
function shuffleBoard(maxRetries = 10) {
    if (maxRetries <= 0) {
        // 重试太多次，直接重新初始化
        board = createBoard();
        renderBoard();
        return;
    }
    
    // 收集所有方块
    const allCells = [];
    for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
            allCells.push(board[row][col]);
        }
    }
    
    // Fisher-Yates 洗牌
    for (let i = allCells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allCells[i], allCells[j]] = [allCells[j], allCells[i]];
    }
    
    // 重新填充棋盘
    let index = 0;
    for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
            board[row][col] = allCells[index++];
        }
    }
    
    renderBoard();
    
    // 如果洗牌后还是死局，再次洗牌（带递减计数器）
    if (!hasValidMoves()) {
        setTimeout(() => shuffleBoard(maxRetries - 1), 300);
    }
}

// 显示洗牌提示
function showShuffleMessage() {
    const msg = document.createElement('div');
    msg.className = 'shuffle-message';
    msg.textContent = '🔄 没有可移动的方块，自动重新排列中...';
    msg.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 20px 30px;
        border-radius: 12px;
        font-size: 16px;
        z-index: 1000;
        animation: fade-in 0.3s ease-out;
    `;
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 1500);
}

// 方块下落
function dropCells() {
    for (let col = 0; col < GRID_SIZE; col++) {
        let emptyRow = GRID_SIZE - 1;
        for (let row = GRID_SIZE - 1; row >= 0; row--) {
            if (board[row][col] !== null) {
                if (row !== emptyRow) {
                    board[emptyRow][col] = board[row][col];
                    board[row][col] = null;
                }
                emptyRow--;
            }
        }
    }
}

// 填充空位
function fillEmpty() {
    for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
            if (board[row][col] === null) {
                board[row][col] = getRandomColor();
            }
        }
    }
}

// 更新分数显示
function updateScore() {
    document.getElementById('score').textContent = score;
    
    // 每5000分庆祝一次（小狐狸建议）
    const currentMilestone = Math.floor(score / 5000);
    if (currentMilestone > lastMilestone) {
        lastMilestone = currentMilestone;
        level = currentMilestone + 1;  // 更新里程碑等级
        updateLevelInfo();  // 更新显示
        celebrateMilestone();
        
        // 更新目标到下一个5000分
        targetScore = (currentMilestone + 1) * 5000;
        updateTargetInfo();
        
        // 保存记录
        saveToLeaderboard(score, Math.floor(score / 5000) + 1);
    }
}

// 更新目标分数显示
function updateTargetInfo() {
    document.getElementById('target-score').textContent = targetScore;
}

// 升级处理
// 每达到一个5000分里程碑，奖励一个彩虹方块
function awardRainbowForMilestone() {
    const rewardRow = Math.floor(Math.random() * GRID_SIZE);
    const rewardCol = Math.floor(Math.random() * GRID_SIZE);
    board[rewardRow][rewardCol] = SPECIAL_TYPES.RAINBOW;
    renderBoard();
}

// 庆祝里程碑（每5000分）
function celebrateMilestone() {
    // 奖励彩虹方块
    awardRainbowForMilestone();
    
    // 页面闪烁
    document.body.classList.add('flash');
    setTimeout(() => {
        document.body.classList.remove('flash');
    }, 1000);
    
    // 播放音效
    playMilestoneSound();
    
    // 爆米花效果
    createConfetti();
    
    // 显示祝贺文字
    showMilestoneText(lastMilestone * 5000);
}

// 创建爆米花效果
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

// 页面加载完成后初始化游戏
document.addEventListener('DOMContentLoaded', () => {
    initGame();
    
    // 重新开始
    document.getElementById('restart').addEventListener('click', () => {
        gameOver(); // 保存记录
        score = 0;
        lastMilestone = 0;
        initGame();
    });
    
    // 音效开关
    document.getElementById('sound-toggle').addEventListener('click', (e) => {
        soundEnabled = !soundEnabled;
        e.target.textContent = soundEnabled ? '🔊 音效' : '🔇 静音';
        if (soundEnabled) {
            initAudio();
            startBgMusic();
        } else {
            stopBgMusic();
        }
    });
    
    // 撤销按钮
    document.getElementById('undo').addEventListener('click', undo);
    
    // 提示按钮
    document.getElementById('hint').addEventListener('click', showHint);
    
    // 排行榜按钮
    document.getElementById('leaderboard-btn').addEventListener('click', showLeaderboard);
    
    // 成就按钮
    document.getElementById('achievements-btn').addEventListener('click', showAchievements);
    
    // 关闭模态框
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(m => m.classList.remove('show'));
        });
    });
    
    // 页面关闭前保存记录（小狐狸建议）
    window.addEventListener('beforeunload', () => {
        if (score > 0) {
            saveToLeaderboard(score);
        }
    });
    
    // 每次分数变化时也保存（防止数据丢失）
    const originalUpdateScore = updateScore;
});


