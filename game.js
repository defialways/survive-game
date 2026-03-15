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
let level = 1;   // 当前关卡
let targetScore = 500; // 当前关卡目标分数
let selectedCell = null;  // 当前选中的方块
let soundEnabled = true;  // 音效开关
let lastMilestone = 0;  // 上次达到的里程碑
let bgMusicInterval = null;  // 背景音乐定时器

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

// 播放背景音乐音符
function playBgNote(frequency, duration) {
    if (!soundEnabled || !audioContext) return;
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = frequency;
    oscillator.type = 'triangle';
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
}

// 开始背景音乐
function startBgMusic() {
    if (bgMusicInterval) return;
    
    // 舒缓的旋律（C大调）
    const melody = [
        { note: 262, duration: 0.5 },  // C
        { note: 294, duration: 0.5 },  // D
        { note: 330, duration: 0.5 },  // E
        { note: 349, duration: 0.5 },  // F
        { note: 392, duration: 0.5 },  // G
        { note: 349, duration: 0.5 },  // F
        { note: 330, duration: 0.5 },  // E
        { note: 294, duration: 0.5 }   // D
    ];
    
    let noteIndex = 0;
    
    const playNextNote = () => {
        if (!soundEnabled) return;
        
        const currentNote = melody[noteIndex];
        // 根据分数调整音高和速度（分数越高越紧张）
        const speedMultiplier = 1 + (score / 2000); // 分数越高速度越快
        const pitchMultiplier = 1 + (score / 5000); // 分数越高音调越高
        
        playBgNote(currentNote.note * pitchMultiplier, currentNote.duration / speedMultiplier);
        
        noteIndex = (noteIndex + 1) % melody.length;
    };
    
    playNextNote();
    bgMusicInterval = setInterval(() => {
        playNextNote();
    }, 600); // 基础间隔
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
    level = 1;
    targetScore = 500;
    window.isLevelingUp = false;
    updateScore();
    updateLevelInfo();
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
    // 特殊方块概率随关卡降低，防止后期太简单
    const specialChance = Math.max(0.05, 0.1 - (level * 0.01));
    
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
            
            cell.addEventListener('click', () => handleCellClick(row, col));
            cell.addEventListener('touchstart', (e) => {
                e.preventDefault();
                handleCellClick(row, col);
            }, { passive: false });
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
    const temp = board[cell1.row][cell1.col];
    board[cell1.row][cell1.col] = board[cell2.row][cell2.col];
    board[cell2.row][cell2.col] = temp;
    
    renderBoard();
    
    // 检查是否有匹配
    if (hasMatches()) {
        setTimeout(() => {
            processMatches();
        }, 300);
    } else {
        // 没有匹配，交换回去
        setTimeout(() => {
            board[cell2.row][cell2.col] = board[cell1.row][cell1.col];
            board[cell1.row][cell1.col] = temp;
            renderBoard();
        }, 300);
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
    
    // 处理特殊方块效果
    const specialEffects = [];
    matchedCells.forEach(cell => {
        const emoji = board[cell.row][cell.col];
        if (emoji === SPECIAL_TYPES.BOMB) {
            // 炸弹：消除周围8个方块
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
            // 水平消除：消除整行
            for (let c = 0; c < GRID_SIZE; c++) {
                if (c !== cell.col) {
                    specialEffects.push({ row: cell.row, col: c });
                }
            }
        } else if (emoji === SPECIAL_TYPES.VERTICAL) {
            // 垂直消除：消除整列
            for (let r = 0; r < GRID_SIZE; r++) {
                if (r !== cell.row) {
                    specialEffects.push({ row: r, col: cell.col });
                }
            }
        }
    });
    
    // 合并特殊效果到匹配的方块中
    specialEffects.forEach(effect => {
        const alreadyMatched = matchedCells.some(cell => cell.row === effect.row && cell.col === effect.col);
        if (!alreadyMatched) {
            matchedCells.push(effect);
        }
    });
    
    // 播放消除音效
    playMatchSound();
    
    // 消除匹配的方块
    matchedCells.forEach(cell => {
        board[cell.row][cell.col] = null;
    });
    
    // 增加分数
    score += matchedCells.length * 10;
    updateScore();
    
    renderBoard();
    
    // 方块下落
    setTimeout(() => {
        dropCells();
        fillEmpty();
        renderBoard();
        
        // 检查是否还有新的匹配
        if (hasMatches()) {
            setTimeout(() => processMatches(), 300);
        }
    }, 300);
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
    
    // 检查是否达到新的里程碑（每1000分）
    const currentMilestone = Math.floor(score / 1000);
    if (currentMilestone > lastMilestone) {
        lastMilestone = currentMilestone;
        celebrateMilestone();
    }
    
    // 检查是否达到关卡目标（使用临时变量防止重复升级）
    if (score >= targetScore && !window.isLevelingUp) {
        window.isLevelingUp = true;
        setTimeout(() => {
            levelUp();
            window.isLevelingUp = false;
        }, 500);
    }
}

// 更新关卡信息显示
function updateLevelInfo() {
    document.getElementById('level').textContent = level;
    document.getElementById('target-score').textContent = targetScore;
}

// 升级处理
function levelUp() {
    level++;
    // 目标分数：基础500 + 每关增加，上限5000
    const baseScore = 500;
    const increment = level * 300;
    targetScore = Math.min(baseScore + increment, 5000);
    updateLevelInfo();
    
    // 每5关给予奖励（生成额外特殊方块）
    if (level % 5 === 0) {
        // 奖励关卡：增加一个彩虹方块到随机位置
        const rewardRow = Math.floor(Math.random() * GRID_SIZE);
        const rewardCol = Math.floor(Math.random() * GRID_SIZE);
        board[rewardRow][rewardCol] = SPECIAL_TYPES.RAINBOW;
        renderBoard();
    }
    
    // 页面闪烁庆祝升级
    document.body.classList.add('flash');
    setTimeout(() => {
        document.body.classList.remove('flash');
    }, 1000);
    
    // 播放升级音效
    playMilestoneSound();
    
    // 创建更多爆米花效果
    createConfetti();
}

// 庆祝里程碑
function celebrateMilestone() {
    // 页面闪烁
    document.body.classList.add('flash');
    setTimeout(() => {
        document.body.classList.remove('flash');
    }, 1000);
    
    // 播放音效
    playMilestoneSound();
    
    // 爆米花效果
    createConfetti();
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
    document.getElementById('restart').addEventListener('click', () => {
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
});
