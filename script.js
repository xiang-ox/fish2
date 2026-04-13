// 安静养鱼系统 - 主逻辑文件

// ==================== 游戏配置 ====================
const FISH_TYPES = [
    '海胆', '龙虾', '海星', '海马', '海蚌', '海龟', '水母', '章鱼', '黄鲫鱼', '小丑鱼',
    '鹦鹉鱼', '石斑鱼', '剑鱼', '狮子鱼', '鳗鱼', '海蛇', '鳐鱼', '海豚', '海豹', '虎鲨',
    '锤头鲨', '大白鲨', '翻车鱼', '蓝鲸', '饕餮', '白泽', '麒麟', '毕方', '凤凰', '神龙'
];

const CONFIG = {
    BASE_SIZE: 5, // 1级鱼的基础大小（百分比）
    SIZE_MULTIPLIER: 1.08, // 每级大小倍数
    FISH_PER_LEVEL: 5, // 合成所需鱼的数量
    MAX_LEVEL: 30, // 最大等级
    FISH_INTERVAL: 60, // 生成鱼的间隔（秒）
    MERGE_ANIMATION_DURATION: 500, // 合成动画时长（毫秒）
    POPUP_DURATION: 2000, // 升级弹窗显示时长（毫秒）
    HISTORY_DAYS: 30, // 历史记录保存天数
    DB_CHECK_INTERVAL: 100, // 分贝检测间隔（毫秒）
};

// ==================== 游戏状态 ====================
class GameState {
    constructor() {
        this.level = 1;
        this.fishCount = 0;
        this.currentQuietTime = 0; // 本次安静时间（秒）
        this.totalQuietTime = 0; // 累计安静时间（秒）
        this.nextFishCountdown = CONFIG.FISH_INTERVAL;
        this.isRunning = false;
        this.isPaused = false;
        this.threshold = 50;
        this.currentDb = 0;
        this.fishes = []; // 存储鱼的数据
        this.foods = []; // 存储鱼食的数据
        this.lastDbViolation = 0; // 上次分贝超标时间
        this.dbViolationCooldown = 2000; // 分贝超标冷却时间（毫秒）
        
        // 音频相关
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.dataArray = null;
        
        // 定时器
        this.gameLoopId = null;
        this.audioCheckId = null;
        this.lastTime = 0;
        
        this.loadFromStorage();
    }

    // 从本地存储加载数据
    loadFromStorage() {
        const saved = localStorage.getItem('quietFishGameState');
        const lastSaveDate = localStorage.getItem('quietFishLastDate');
        const today = new Date().toDateString();
        
        if (saved && lastSaveDate === today) {
            const data = JSON.parse(saved);
            // 同一天内刷新或关闭重启，保留所有数据
            this.totalQuietTime = data.totalQuietTime || 0;
            this.level = data.level || 1;
            this.fishCount = data.fishCount || 0;
            // 加载保存的鱼数据
            this.savedFishes = data.fishes || [];
        }
        // 如果是新的一天，不加载任何数据，保持默认值（等级=1，鱼的数量=0，累计安静时间=0）
    }

    // 保存到本地存储
    saveToStorage() {
        // 保存鱼的基本数据（不包括DOM元素）
        const fishesData = this.fishes.map(fish => ({
            id: fish.id,
            level: fish.level,
            type: fish.type,
            size: fish.size,
            x: fish.x,
            y: fish.y,
            vx: fish.vx,
            vy: fish.vy,
            speed: fish.speed
        }));
        
        const data = {
            totalQuietTime: this.totalQuietTime,
            level: this.level,
            fishCount: this.fishCount,
            fishes: fishesData,
            lastSaveDate: new Date().toDateString()
        };
        localStorage.setItem('quietFishGameState', JSON.stringify(data));
    }

    // 获取当前鱼的类型
    getCurrentFishType() {
        return FISH_TYPES[Math.min(this.level - 1, FISH_TYPES.length - 1)];
    }

    // 获取当前鱼的大小（百分比）
    getCurrentFishSize() {
        return CONFIG.BASE_SIZE * Math.pow(CONFIG.SIZE_MULTIPLIER, this.level - 1);
    }

    // 格式化时间显示
    static formatTime(seconds) {
        const totalSeconds = Math.floor(seconds);
        const hours = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;
        
        if (hours > 0) {
            return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}

// ==================== 鱼的行为类 ====================
class Fish {
    constructor(id, level, type, size, containerWidth, containerHeight) {
        this.id = id;
        this.level = level;
        this.type = type;
        this.size = size; // 百分比
        this.containerWidth = containerWidth;
        this.containerHeight = containerHeight;
        
        // 位置（百分比）
        this.x = Math.random() * 80 + 10; // 10% - 90%
        this.y = Math.random() * 80 + 10; // 10% - 90%
        
        // 移动方向和速度
        const angle = Math.random() * Math.PI * 2;
        this.speed = 0.3 + Math.random() * 0.4; // 每帧移动的百分比
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
        
        // 元素引用
        this.element = null;
        
        this.createElement();
    }

    createElement() {
        this.element = document.createElement('div');
        this.element.className = 'fish breathing';
        this.element.id = `fish-${this.id}`;
        this.element.style.width = `${this.size}%`;
        this.element.style.height = 'auto';
        this.element.style.left = `${this.x}%`;
        this.element.style.top = `${this.y}%`;
        
        const img = document.createElement('img');
        img.src = `images/${this.type}.png`;
        img.alt = this.type;
        img.draggable = false;
        
        this.element.appendChild(img);
    }

    update() {
        // 更新位置
        this.x += this.vx * 0.1;
        this.y += this.vy * 0.1;

        // 边界检测和反弹
        const margin = 2; // 边距
        if (this.x <= margin || this.x >= 90 - margin) {
            this.vx = -this.vx;
            this.x = Math.max(margin, Math.min(90 - margin, this.x));
        }
        if (this.y <= margin || this.y >= 90 - margin) {
            this.vy = -this.vy;
            this.y = Math.max(margin, Math.min(90 - margin, this.y));
        }

        // 随机改变方向（偶尔）
        if (Math.random() < 0.005) {
            const angle = Math.random() * Math.PI * 2;
            this.vx = Math.cos(angle) * this.speed;
            this.vy = Math.sin(angle) * this.speed;
        }

        // 更新DOM
        if (this.element) {
            this.element.style.left = `${this.x}%`;
            this.element.style.top = `${this.y}%`;
            
            // 根据移动方向翻转
            const scaleX = this.vx > 0 ? -1 : 1;
            this.element.style.transform = `scaleX(${scaleX})`;
        }
    }

    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
}

// ==================== 音频管理器 ====================
class AudioManager {
    constructor(gameState) {
        this.gameState = gameState;
        this.isInitialized = false;
    }

    async init(deviceId = null) {
        try {
            // 创建音频上下文
            this.gameState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // 请求麦克风权限
            const constraints = {
                audio: deviceId ? { deviceId: { exact: deviceId } } : true
            };
            
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // 创建分析器
            this.gameState.analyser = this.gameState.audioContext.createAnalyser();
            this.gameState.analyser.fftSize = 256;
            this.gameState.analyser.smoothingTimeConstant = 0.8;
            
            // 连接麦克风
            this.gameState.microphone = this.gameState.audioContext.createMediaStreamSource(stream);
            this.gameState.microphone.connect(this.gameState.analyser);
            
            // 创建数据数组
            const bufferLength = this.gameState.analyser.frequencyBinCount;
            this.gameState.dataArray = new Uint8Array(bufferLength);
            
            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error('音频初始化失败:', error);
            alert('无法访问麦克风，请检查权限设置');
            return false;
        }
    }

    // 获取当前分贝值
    getDecibels() {
        if (!this.isInitialized || !this.gameState.analyser) return 0;
        
        this.gameState.analyser.getByteFrequencyData(this.gameState.dataArray);
        
        // 计算平均音量
        let sum = 0;
        for (let i = 0; i < this.gameState.dataArray.length; i++) {
            sum += this.gameState.dataArray[i];
        }
        const average = sum / this.gameState.dataArray.length;
        
        // 转换为分贝值（0-100范围）
        const db = Math.min(100, Math.max(0, average * 100 / 255));
        
        return Math.round(db);
    }

    // 获取可用麦克风列表
    async getMicrophones() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return devices.filter(device => device.kind === 'audioinput');
        } catch (error) {
            console.error('获取麦克风列表失败:', error);
            return [];
        }
    }

    stop() {
        if (this.gameState.microphone && this.gameState.microphone.mediaStream) {
            this.gameState.microphone.mediaStream.getTracks().forEach(track => track.stop());
        }
        if (this.gameState.audioContext) {
            this.gameState.audioContext.close();
        }
        this.isInitialized = false;
    }
}

// ==================== 历史记录管理器 ====================
class HistoryManager {
    static STORAGE_KEY = 'quietFishHistory';

    // 格式化日期为中文格式：2026年3月30日
    static formatDate(dateString) {
        const date = new Date(dateString);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        return `${year}年${month}月${day}日`;
    }

    // 获取所有历史记录
    static getAll() {
        const data = localStorage.getItem(this.STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    }

    // 添加记录
    static add(level, fishType) {
        const history = this.getAll();
        const today = new Date().toDateString();
        
        // 检查今天是否已有记录
        const existingIndex = history.findIndex(h => h.date === today);
        
        if (existingIndex >= 0) {
            // 更新今天的记录（如果等级更高）
            if (history[existingIndex].level < level) {
                history[existingIndex] = {
                    date: today,
                    level: level,
                    fishType: fishType
                };
            }
        } else {
            // 添加新记录
            history.push({
                date: today,
                level: level,
                fishType: fishType
            });
        }
        
        // 只保留最近30天的记录
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const filtered = history.filter(h => new Date(h.date) >= thirtyDaysAgo);
        
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
    }

    // 清空历史
    static clear() {
        localStorage.removeItem(this.STORAGE_KEY);
    }

    // 删除单条记录
    static remove(date) {
        const history = this.getAll();
        const filtered = history.filter(h => h.date !== date);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
    }
}

// ==================== UI管理器 ====================
class UIManager {
    constructor(game, gameState) {
        this.game = game;
        this.gameState = gameState;
        this.elements = {};
        this.isLocked = false;
        this.savedButtonState = null;
        this.initElements();
        this.bindEvents();
    }

    initElements() {
        // 状态显示元素
        this.elements.currentQuietTime = document.getElementById('current-quiet-time');
        this.elements.nextFishTime = document.getElementById('next-fish-time');
        this.elements.currentLevel = document.getElementById('current-level');
        this.elements.fishCount = document.getElementById('fish-count');
        this.elements.totalQuietTime = document.getElementById('total-quiet-time');
        this.elements.currentDb = document.getElementById('current-db');
        
        // 控制元素
        this.elements.thresholdSlider = document.getElementById('threshold-slider');
        this.elements.thresholdValue = document.getElementById('threshold-value');
        this.elements.startBtn = document.getElementById('start-btn');
        this.elements.pauseBtn = document.getElementById('pause-btn');
        this.elements.resetBtn = document.getElementById('reset-btn');
        this.elements.historyBtn = document.getElementById('history-btn');
        this.elements.settingsBtn = document.getElementById('settings-btn');
        this.elements.fullscreenBtn = document.getElementById('fullscreen-btn');
        this.elements.lockBtn = document.getElementById('lock-btn');
        this.elements.lockIcon = document.getElementById('lock-icon');
        this.elements.lockText = document.getElementById('lock-text');
        
        // 弹窗元素
        this.elements.upgradePopup = document.getElementById('upgrade-popup');
        this.elements.upgradeMessage = document.getElementById('upgrade-message');
        this.elements.historyModal = document.getElementById('history-modal');
        this.elements.settingsModal = document.getElementById('settings-modal');
        this.elements.historyList = document.getElementById('history-list');
        this.elements.micSelect = document.getElementById('mic-select');
        
        // 关闭按钮
        this.elements.closeHistory = document.getElementById('close-history');
        this.elements.closeSettings = document.getElementById('close-settings');
        this.elements.clearHistory = document.getElementById('clear-history');
        
        // 养鱼区域
        this.elements.fishTank = document.getElementById('fish-tank');
    }

    bindEvents() {
        // 阈值滑块
        this.elements.thresholdSlider.addEventListener('input', (e) => {
            this.gameState.threshold = parseInt(e.target.value);
            this.elements.thresholdValue.textContent = this.gameState.threshold;
        });

        // 开始按钮
        this.elements.startBtn.addEventListener('click', () => {
            this.game.start();
        });

        // 暂停/继续按钮
        this.elements.pauseBtn.addEventListener('click', () => {
            this.game.togglePause();
        });

        // 重置按钮
        this.elements.resetBtn.addEventListener('click', () => {
            this.game.reset();
        });

        // 历史记录按钮
        this.elements.historyBtn.addEventListener('click', () => {
            this.showHistoryModal();
        });

        // 设置按钮
        this.elements.settingsBtn.addEventListener('click', () => {
            this.showSettingsModal();
        });

        // 全屏按钮
        this.elements.fullscreenBtn.addEventListener('click', () => {
            this.toggleFullscreen();
        });

        // 锁定/解锁按钮
        this.elements.lockBtn.addEventListener('click', () => {
            this.toggleLock();
        });

        // 监听解锁成功事件
        document.addEventListener('unlockSuccess', () => {
            this.unlockControls();
        });

        // 关闭历史记录
        this.elements.closeHistory.addEventListener('click', () => {
            this.hideModal(this.elements.historyModal);
        });

        // 关闭设置
        this.elements.closeSettings.addEventListener('click', () => {
            this.hideModal(this.elements.settingsModal);
        });

        // 清空历史
        this.elements.clearHistory.addEventListener('click', () => {
            if (confirm('确定要清空所有历史记录吗？')) {
                HistoryManager.clear();
                this.renderHistoryList();
            }
        });

        // 点击模态框背景关闭
        this.elements.historyModal.addEventListener('click', (e) => {
            if (e.target === this.elements.historyModal) {
                this.hideModal(this.elements.historyModal);
            }
        });

        this.elements.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.elements.settingsModal) {
                this.hideModal(this.elements.settingsModal);
            }
        });

        // 麦克风选择
        this.elements.micSelect.addEventListener('change', (e) => {
            this.game.changeMicrophone(e.target.value);
        });
    }

    updateDisplay() {
        // 更新状态显示
        this.elements.currentQuietTime.textContent = GameState.formatTime(this.gameState.currentQuietTime);
        this.elements.totalQuietTime.textContent = GameState.formatTime(this.gameState.totalQuietTime);
        this.elements.nextFishTime.textContent = `${Math.ceil(this.gameState.nextFishCountdown)}秒`;
        this.elements.currentLevel.textContent = `LV${this.gameState.level} ${this.gameState.getCurrentFishType()}`;
        this.elements.fishCount.textContent = this.gameState.fishCount;
        this.elements.currentDb.textContent = `${this.gameState.currentDb} dB`;
        
        // 分贝过高警告
        if (this.gameState.currentDb > this.gameState.threshold) {
            this.elements.currentDb.classList.add('db-warning');
        } else {
            this.elements.currentDb.classList.remove('db-warning');
        }
    }

    updateButtons() {
        if (this.isLocked) {
            // 锁定状态下，所有按钮保持禁用
            this.elements.startBtn.disabled = true;
            this.elements.pauseBtn.disabled = true;
            return;
        }
        
        if (this.gameState.isRunning) {
            this.elements.startBtn.disabled = true;
            this.elements.pauseBtn.disabled = false;
            this.elements.pauseBtn.textContent = this.gameState.isPaused ? '继续' : '暂停';
        } else {
            this.elements.startBtn.disabled = false;
            this.elements.pauseBtn.disabled = true;
            this.elements.pauseBtn.textContent = '暂停';
        }
    }

    showUpgradePopup(message) {
        this.elements.upgradeMessage.textContent = message;
        this.elements.upgradePopup.classList.add('show');
        
        setTimeout(() => {
            this.elements.upgradePopup.classList.remove('show');
        }, CONFIG.POPUP_DURATION);
    }

    showHistoryModal() {
        this.renderHistoryList();
        this.showModal(this.elements.historyModal);
    }

    async showSettingsModal() {
        await this.loadMicrophones();
        this.showModal(this.elements.settingsModal);
    }

    showModal(modal) {
        modal.classList.add('show');
    }

    hideModal(modal) {
        modal.classList.remove('show');
    }

    renderHistoryList() {
        const history = HistoryManager.getAll();
        
        if (history.length === 0) {
            this.elements.historyList.innerHTML = '<div class="history-empty">暂无历史记录</div>';
            return;
        }
        
        // 按日期倒序排列
        history.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        this.elements.historyList.innerHTML = history.map(item => `
            <div class="history-item" data-date="${item.date}">
                <span class="history-date">${HistoryManager.formatDate(item.date)}</span>
                <span class="history-level">LV${item.level}</span>
                <span class="history-fish">${item.fishType}</span>
                <button class="history-delete-btn btn btn-warning" style="flex: 0 0 auto; padding: 2px 6px; font-size: 0.7rem; width: 20%;">删除</button>
            </div>
        `).join('');
        
        // 添加删除按钮事件监听器
        document.querySelectorAll('.history-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const date = btn.closest('.history-item').dataset.date;
                if (confirm('确定要删除这条记录吗？')) {
                    HistoryManager.remove(date);
                    this.renderHistoryList();
                }
            });
        });
    }

    async loadMicrophones() {
        const microphones = await this.game.audioManager.getMicrophones();
        
        this.elements.micSelect.innerHTML = `
            <option value="">默认麦克风</option>
            ${microphones.map((mic, index) => `
                <option value="${mic.deviceId}">${mic.label || `麦克风 ${index + 1}`}</option>
            `).join('')}
        `;
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().then(() => {
                document.body.classList.add('fullscreen');
                this.elements.fullscreenBtn.textContent = '退出全屏';
            }).catch(err => {
                console.error('全屏失败:', err);
            });
        } else {
            document.exitFullscreen().then(() => {
                document.body.classList.remove('fullscreen');
                this.elements.fullscreenBtn.textContent = '全屏';
            });
        }
    }

    toggleLock() {
        if (this.isLocked) {
            // 已经锁定，需要输入密码解锁
            if (typeof showUnlockModal === 'function') {
                showUnlockModal();
            }
        } else {
            // 未锁定，直接锁定
            this.lockControls();
        }
    }

    lockControls() {
        this.isLocked = true;
        
        // 更新按钮样式
        this.elements.lockBtn.classList.add('locked');
        this.elements.lockIcon.textContent = '🔒';
        this.elements.lockText.textContent = '解锁';
        
        // 禁用左侧区域所有按钮
        this.elements.startBtn.disabled = true;
        this.elements.pauseBtn.disabled = true;
        this.elements.resetBtn.disabled = true;
        this.elements.historyBtn.disabled = true;
        this.elements.settingsBtn.disabled = true;
        this.elements.fullscreenBtn.disabled = true;
        this.elements.thresholdSlider.disabled = true;
        
        // 保存当前按钮状态以便恢复
        this.savedButtonState = {
            startBtnDisabled: this.elements.startBtn.disabled,
            pauseBtnDisabled: this.elements.pauseBtn.disabled
        };
    }

    unlockControls() {
        this.isLocked = false;
        
        // 更新按钮样式
        this.elements.lockBtn.classList.remove('locked');
        this.elements.lockIcon.textContent = '🔓';
        this.elements.lockText.textContent = '解锁';
        
        // 恢复按钮状态，根据游戏状态
        this.elements.thresholdSlider.disabled = false;
        this.elements.resetBtn.disabled = false;
        this.elements.historyBtn.disabled = false;
        this.elements.settingsBtn.disabled = false;
        this.elements.fullscreenBtn.disabled = false;
        
        // 调用updateButtons来正确更新开始/暂停按钮状态
        this.updateButtons();
    }

    addFishToTank(fish) {
        this.elements.fishTank.appendChild(fish.element);
    }

    removeFishFromTank(fish) {
        fish.destroy();
    }

    clearFishTank() {
        this.elements.fishTank.innerHTML = '';
    }
}

// ==================== 游戏主类 ====================
class Game {
    constructor() {
        this.gameState = new GameState();
        this.audioManager = new AudioManager(this.gameState);
        this.uiManager = new UIManager(this, this.gameState);
        this.fishIdCounter = 0;
        this.foodIdCounter = 0;
        
        // 绑定动画帧
        this.gameLoop = this.gameLoop.bind(this);
        this.checkAudio = this.checkAudio.bind(this);
        this.handleTankClick = this.handleTankClick.bind(this);
        
        // 检查是否需要自动重置（新的一天）
        this.checkDailyReset();
        
        // 网页刷新或重新打开时重置鱼的条数
        this.resetFishCountOnLoad();
        
        // 初始化显示
        this.uiManager.updateDisplay();
        this.uiManager.updateButtons();
        
        // 添加鱼缸点击事件
        this.uiManager.elements.fishTank.addEventListener('click', this.handleTankClick);
    }

    // 网页刷新或重新打开时恢复鱼的条数
    resetFishCountOnLoad() {
        // 重置本次安静时间和倒计时
        this.gameState.currentQuietTime = 0;
        this.gameState.nextFishCountdown = CONFIG.FISH_INTERVAL;
        
        // 清理鱼食
        this.gameState.foods.forEach(food => {
            if (food.element && food.element.parentNode) {
                food.element.parentNode.removeChild(food.element);
            }
        });
        this.gameState.foods = [];
        
        // 恢复之前保存的鱼
        if (this.gameState.savedFishes && this.gameState.savedFishes.length > 0) {
            const tank = this.uiManager.elements.fishTank;
            
            this.gameState.savedFishes.forEach(fishData => {
                // 创建鱼对象
                const fish = new Fish(
                    fishData.id,
                    fishData.level,
                    fishData.type,
                    fishData.size,
                    tank.clientWidth,
                    tank.clientHeight
                );
                
                // 恢复鱼的位置和速度
                fish.x = fishData.x;
                fish.y = fishData.y;
                fish.vx = fishData.vx;
                fish.vy = fishData.vy;
                fish.speed = fishData.speed;
                
                // 更新DOM位置
                fish.element.style.left = `${fish.x}%`;
                fish.element.style.top = `${fish.y}%`;
                
                this.gameState.fishes.push(fish);
                this.uiManager.addFishToTank(fish);
            });
            
            // 更新鱼计数器
            this.fishIdCounter = Math.max(...this.gameState.savedFishes.map(f => f.id), 0) + 1;
            
            // 清除已加载的保存数据
            this.gameState.savedFishes = [];
        }
        
        // 保存状态
        this.gameState.saveToStorage();
    }

    // 检查每日重置
    checkDailyReset() {
        const lastSaveDate = localStorage.getItem('quietFishLastDate');
        const today = new Date().toDateString();
        
        if (lastSaveDate !== today) {
            // 保存昨天的记录
            if (lastSaveDate) {
                HistoryManager.add(this.gameState.level, this.gameState.getCurrentFishType());
            }
            // 重置游戏状态（保留总时间）
            this.gameState.level = 1;
            this.gameState.fishCount = 0;
            this.gameState.currentQuietTime = 0;
            this.gameState.nextFishCountdown = CONFIG.FISH_INTERVAL;
            this.gameState.fishes = [];
            
            // 清理鱼食
            this.gameState.foods.forEach(food => {
                if (food.element && food.element.parentNode) {
                    food.element.parentNode.removeChild(food.element);
                }
            });
            this.gameState.foods = [];
            
            this.gameState.saveToStorage();
            localStorage.setItem('quietFishLastDate', today);
        }
    }

    // 开始游戏
    async start() {
        if (this.gameState.isRunning) return;
        
        // 初始化音频
        const audioInitialized = await this.audioManager.init();
        if (!audioInitialized) return;
        
        this.gameState.isRunning = true;
        this.gameState.isPaused = false;
        this.gameState.lastTime = Date.now();
        
        this.uiManager.updateButtons();
        
        // 启动游戏循环
        this.gameState.gameLoopId = requestAnimationFrame(this.gameLoop);
        
        // 启动音频检测
        this.gameState.audioCheckId = setInterval(this.checkAudio, CONFIG.DB_CHECK_INTERVAL);
    }

    // 暂停/继续
    togglePause() {
        if (!this.gameState.isRunning) return;
        
        this.gameState.isPaused = !this.gameState.isPaused;
        
        if (!this.gameState.isPaused) {
            this.gameState.lastTime = Date.now();
            this.gameState.gameLoopId = requestAnimationFrame(this.gameLoop);
        } else {
            cancelAnimationFrame(this.gameState.gameLoopId);
        }
        
        this.uiManager.updateButtons();
    }

    // 重置游戏
    reset() {
        if (!confirm('确定要重置当前游戏吗？')) return;
        
        // 停止游戏
        this.stop();
        
        // 保存历史记录
        HistoryManager.add(this.gameState.level, this.gameState.getCurrentFishType());
        
        // 重置状态
        this.gameState.level = 1;
        this.gameState.fishCount = 0;
        this.gameState.currentQuietTime = 0;
        this.gameState.nextFishCountdown = CONFIG.FISH_INTERVAL;
        this.gameState.fishes = [];
        
        // 清理鱼食
        this.gameState.foods.forEach(food => {
            if (food.element && food.element.parentNode) {
                food.element.parentNode.removeChild(food.element);
            }
        });
        this.gameState.foods = [];
        
        this.gameState.saveToStorage();
        
        // 清空鱼缸
        this.uiManager.clearFishTank();
        this.uiManager.updateDisplay();
        this.uiManager.updateButtons();
    }

    // 停止游戏
    stop() {
        this.gameState.isRunning = false;
        this.gameState.isPaused = false;
        
        cancelAnimationFrame(this.gameState.gameLoopId);
        clearInterval(this.gameState.audioCheckId);
        
        this.audioManager.stop();
        
        this.gameState.saveToStorage();
    }

    // 游戏主循环
    gameLoop() {
        if (!this.gameState.isRunning || this.gameState.isPaused) return;
        
        const now = Date.now();
        const deltaTime = (now - this.gameState.lastTime) / 1000; // 转换为秒
        this.gameState.lastTime = now;
        
        // 更新安静时间
        this.gameState.currentQuietTime += deltaTime;
        this.gameState.totalQuietTime += deltaTime;
        
        // 更新倒计时
        this.gameState.nextFishCountdown -= deltaTime;
        
        // 检查是否生成新鱼
        if (this.gameState.nextFishCountdown <= 0) {
            this.spawnFish();
            this.gameState.nextFishCountdown = CONFIG.FISH_INTERVAL;
        }
        
        // 更新所有鱼的位置
        if (this.gameState.foods.length > 0) {
            // 有鱼食时，鱼向鱼食移动
            this.moveFishToFood();
            // 检查碰撞
            this.checkFoodCollision();
        } else {
            // 没有鱼食时，鱼自由移动
            this.gameState.fishes.forEach(fish => fish.update());
        }
        
        // 更新显示
        this.uiManager.updateDisplay();
        
        // 继续循环
        this.gameState.gameLoopId = requestAnimationFrame(this.gameLoop);
    }

    // 音频检测
    checkAudio() {
        if (!this.gameState.isRunning || this.gameState.isPaused) return;
        
        this.gameState.currentDb = this.audioManager.getDecibels();
        
        // 检查是否超过阈值
        if (this.gameState.currentDb > this.gameState.threshold) {
            const now = Date.now();
            
            // 检查冷却时间
            if (now - this.gameState.lastDbViolation > this.gameState.dbViolationCooldown) {
                this.gameState.lastDbViolation = now;
                this.handleDbViolation();
            }
        }
        
        this.uiManager.updateDisplay();
    }

    // 处理分贝超标
    handleDbViolation() {
        // 重置本次安静时间
        this.gameState.currentQuietTime = 0;
        this.gameState.nextFishCountdown = CONFIG.FISH_INTERVAL;
        
        // 失去一条鱼
        if (this.gameState.fishCount > 0) {
            this.gameState.fishCount--;
            
            // 移除一条鱼
            if (this.gameState.fishes.length > 0) {
                const fishToRemove = this.gameState.fishes.pop();
                this.uiManager.removeFishFromTank(fishToRemove);
            }
            
            this.uiManager.updateDisplay();
        }
    }

    // 生成鱼
    spawnFish() {
        this.gameState.fishCount++;
        
        // 创建鱼对象
        const fishType = this.gameState.getCurrentFishType();
        const fishSize = this.gameState.getCurrentFishSize();
        const tank = this.uiManager.elements.fishTank;
        
        const fish = new Fish(
            this.fishIdCounter++,
            this.gameState.level,
            fishType,
            fishSize,
            tank.clientWidth,
            tank.clientHeight
        );
        
        this.gameState.fishes.push(fish);
        this.uiManager.addFishToTank(fish);
        
        // 检查是否需要合成
        this.checkMerge();
        
        this.uiManager.updateDisplay();
    }

    // 检查合成
    checkMerge() {
        if (this.gameState.fishCount >= CONFIG.FISH_PER_LEVEL) {
            // 检查是否达到最大等级
            if (this.gameState.level >= CONFIG.MAX_LEVEL) {
                // 达到最高级，不再合成，只保留5条鱼
                while (this.gameState.fishes.length > CONFIG.FISH_PER_LEVEL) {
                    const fishToRemove = this.gameState.fishes.pop();
                    this.uiManager.removeFishFromTank(fishToRemove);
                }
                this.gameState.fishCount = CONFIG.FISH_PER_LEVEL;
                return;
            }
            
            this.performMerge();
        }
    }

    // 执行合成
    performMerge() {
        // 获取要合成的5条鱼
        const fishesToMerge = this.gameState.fishes.slice(0, CONFIG.FISH_PER_LEVEL);
        
        // 计算合成位置（中心点）
        let centerX = 0, centerY = 0;
        fishesToMerge.forEach(fish => {
            centerX += fish.x;
            centerY += fish.y;
        });
        centerX /= CONFIG.FISH_PER_LEVEL;
        centerY /= CONFIG.FISH_PER_LEVEL;
        
        // 播放合成动画
        fishesToMerge.forEach(fish => {
            fish.element.classList.add('merging');
        });
        
        // 延迟后完成合成
        setTimeout(() => {
            // 移除旧鱼
            fishesToMerge.forEach(fish => {
                this.uiManager.removeFishFromTank(fish);
            });
            
            // 从数组中移除
            this.gameState.fishes = this.gameState.fishes.slice(CONFIG.FISH_PER_LEVEL);
            this.gameState.fishCount -= CONFIG.FISH_PER_LEVEL;
            
            // 升级
            this.gameState.level++;
            
            // 生成新等级的鱼
            const newFishType = this.gameState.getCurrentFishType();
            const newFishSize = this.gameState.getCurrentFishSize();
            const tank = this.uiManager.elements.fishTank;
            
            const newFish = new Fish(
                this.fishIdCounter++,
                this.gameState.level,
                newFishType,
                newFishSize,
                tank.clientWidth,
                tank.clientHeight
            );
            
            // 设置位置为合成中心
            newFish.x = centerX;
            newFish.y = centerY;
            newFish.element.style.left = `${centerX}%`;
            newFish.element.style.top = `${centerY}%`;
            
            this.gameState.fishes.unshift(newFish);
            this.gameState.fishCount++;
            
            this.uiManager.addFishToTank(newFish);
            
            // 显示升级弹窗
            this.uiManager.showUpgradePopup(`升级成功！当前品种为${newFishType}`);
            
            this.uiManager.updateDisplay();
            this.gameState.saveToStorage();
        }, CONFIG.MERGE_ANIMATION_DURATION);
    }

    // 切换麦克风
    async changeMicrophone(deviceId) {
        // 停止当前音频
        this.audioManager.stop();
        
        // 重新初始化
        if (this.gameState.isRunning) {
            await this.audioManager.init(deviceId);
        }
    }

    // 处理鱼缸点击事件
    handleTankClick(e) {
        if (!this.gameState.isRunning || this.gameState.isPaused) return;
        
        const tank = this.uiManager.elements.fishTank;
        const rect = tank.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        
        // 生成5颗鱼食
        for (let i = 0; i < 5; i++) {
            this.spawnFood(x, y);
        }
    }

    // 生成鱼食
    spawnFood(x, y) {
        const foodId = this.foodIdCounter++;
        const food = {
            id: foodId,
            x: x + (Math.random() - 0.5) * 10, // 随机偏移
            y: y + (Math.random() - 0.5) * 10,
            element: null
        };
        
        // 创建鱼食元素
        food.element = document.createElement('div');
        food.element.className = 'food falling';
        food.element.id = `food-${foodId}`;
        food.element.style.left = `${food.x}%`;
        food.element.style.top = `${food.y}%`;
        
        this.uiManager.elements.fishTank.appendChild(food.element);
        this.gameState.foods.push(food);
        
        // 3秒后移除鱼食
        setTimeout(() => {
            this.removeFood(foodId);
        }, 3000);
    }

    // 移除鱼食
    removeFood(foodId) {
        const index = this.gameState.foods.findIndex(f => f.id === foodId);
        if (index !== -1) {
            const food = this.gameState.foods[index];
            if (food.element && food.element.parentNode) {
                food.element.parentNode.removeChild(food.element);
            }
            this.gameState.foods.splice(index, 1);
        }
    }

    // 检查鱼和鱼食的碰撞
    checkFoodCollision() {
        for (let i = this.gameState.foods.length - 1; i >= 0; i--) {
            const food = this.gameState.foods[i];
            
            for (let j = 0; j < this.gameState.fishes.length; j++) {
                const fish = this.gameState.fishes[j];
                
                // 简单的碰撞检测
                const distance = Math.sqrt(
                    Math.pow(fish.x - food.x, 2) + Math.pow(fish.y - food.y, 2)
                );
                
                // 减小碰撞半径，提高精准度
                if (distance < 3) { // 3% 的碰撞半径
                    this.removeFood(food.id);
                    break;
                }
            }
        }
    }

    // 鱼向鱼食移动
    moveFishToFood() {
        if (this.gameState.foods.length === 0) return;
        
        // 更新鱼食的实际位置（从DOM元素获取）
        this.gameState.foods.forEach(food => {
            if (food.element) {
                const rect = food.element.getBoundingClientRect();
                const tankRect = this.uiManager.elements.fishTank.getBoundingClientRect();
                food.x = ((rect.left + rect.width/2 - tankRect.left) / tankRect.width) * 100;
                food.y = ((rect.top + rect.height/2 - tankRect.top) / tankRect.height) * 100;
            }
        });
        
        // 找到最近的鱼食
        let closestFood = this.gameState.foods[0];
        
        this.gameState.fishes.forEach(fish => {
            // 计算方向向量
            const dx = closestFood.x - fish.x;
            const dy = closestFood.y - fish.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 0) {
                // 标准化方向向量
                const nx = dx / distance;
                const ny = dy / distance;
                
                // 以相同速度移动（增加速度提高精准度）
                const speed = 0.8;
                fish.x += nx * speed;
                fish.y += ny * speed;
                
                // 边界检测
                const margin = 2;
                fish.x = Math.max(margin, Math.min(90 - margin, fish.x));
                fish.y = Math.max(margin, Math.min(90 - margin, fish.y));
                
                // 更新DOM
                if (fish.element) {
                    fish.element.style.left = `${fish.x}%`;
                    fish.element.style.top = `${fish.y}%`;
                    
                    // 根据移动方向翻转
                    const scaleX = nx > 0 ? -1 : 1;
                    fish.element.style.transform = `scaleX(${scaleX})`;
                }
            }
        });
    }
}

// ==================== 初始化游戏 ====================
document.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    
    // 页面关闭前保存数据
    window.addEventListener('beforeunload', () => {
        game.gameState.saveToStorage();
        HistoryManager.add(game.gameState.level, game.gameState.getCurrentFishType());
    });
    
    // 每分钟自动保存
    setInterval(() => {
        if (game.gameState.isRunning) {
            game.gameState.saveToStorage();
        }
    }, 60000);
});
