// 番茄钟主程序
class PomodoroTimer {
    constructor() {
        // 状态
        this.isRunning = false;
        this.timeLeft = 25 * 60; // 秒
        this.totalTime = 25 * 60;
        this.currentMode = 'pomodoro';
        this.intervalId = null;
        this.completedPomodoros = 0;
        this.totalFocusMinutes = 0;

        // 时间配置
        this.times = {
            pomodoro: 25,
            shortBreak: 5,
            longBreak: 15
        };

        // DOM 元素
        this.elements = {
            timeDisplay: document.getElementById('time-display'),
            timerLabel: document.getElementById('timer-label'),
            progress: document.getElementById('progress'),
            startBtn: document.getElementById('start-btn'),
            resetBtn: document.getElementById('reset-btn'),
            skipBtn: document.getElementById('skip-btn'),
            playIcon: document.getElementById('play-icon'),
            pauseIcon: document.getElementById('pause-icon'),
            completedPomodoros: document.getElementById('completed-pomodoros'),
            totalFocusTime: document.getElementById('total-focus-time'),
            pomodoroList: document.getElementById('pomodoro-list'),
            alarmSound: document.getElementById('alarm-sound')
        };

        // 初始化
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadFromStorage();
        this.updateDisplay();

        // 页面标题显示时间
        this.updateTitle();
    }

    bindEvents() {
        // 开始/暂停按钮
        this.elements.startBtn.addEventListener('click', () => this.toggle());

        // 重置按钮
        this.elements.resetBtn.addEventListener('click', () => this.reset());

        // 跳过按钮
        this.elements.skipBtn.addEventListener('click', () => this.skip());

        // 模式切换按钮
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchMode(e.target));
        });

        // 设置输入框
        const settings = {
            'pomodoro-time': 'pomodoro',
            'short-break-time': 'shortBreak',
            'long-break-time': 'longBreak'
        };

        Object.entries(settings).forEach(([id, mode]) => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('change', (e) => {
                    let value = parseInt(e.target.value) || 1;
                    value = Math.max(1, Math.min(60, value));
                    e.target.value = value;
                    this.times[mode] = value;

                    if (this.currentMode === mode && !this.isRunning) {
                        this.setTimer(value * 60);
                    }

                    this.saveToStorage();
                });
            }
        });

        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;

            if (e.code === 'Space') {
                e.preventDefault();
                this.toggle();
            } else if (e.code === 'KeyR') {
                this.reset();
            } else if (e.code === 'KeyS') {
                this.skip();
            }
        });

        // 可见性变化时暂停
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.isRunning) {
                // 继续在后台运行，但更新标题
            }
        });
    }

    toggle() {
        if (this.isRunning) {
            this.pause();
        } else {
            this.start();
        }
    }

    start() {
        this.isRunning = true;
        document.body.classList.add('running');

        this.elements.playIcon.style.display = 'none';
        this.elements.pauseIcon.style.display = 'block';

        this.intervalId = setInterval(() => this.tick(), 1000);

        this.saveToStorage();
    }

    pause() {
        this.isRunning = false;
        document.body.classList.remove('running');

        this.elements.playIcon.style.display = 'block';
        this.elements.pauseIcon.style.display = 'none';

        clearInterval(this.intervalId);
        this.intervalId = null;

        this.saveToStorage();
    }

    reset() {
        this.pause();
        this.setTimer(this.totalTime);
    }

    skip() {
        this.completeSession(true);
    }

    tick() {
        if (this.timeLeft > 0) {
            this.timeLeft--;
            this.updateDisplay();
            this.updateTitle();
            this.saveToStorage();
        } else {
            this.completeSession(false);
        }
    }

    completeSession(skipped = false) {
        this.pause();
        this.playAlarm();

        if (this.currentMode === 'pomodoro' && !skipped) {
            this.completedPomodoros++;
            this.totalFocusMinutes += this.times.pomodoro;
            this.addPomodoroItem();
            this.updateStats();

            // 每4个番茄后进入长休息
            if (this.completedPomodoros % 4 === 0) {
                this.switchToMode('longBreak');
            } else {
                this.switchToMode('shortBreak');
            }

            // 发送浏览器通知
            this.sendNotification('🍅 番茄完成！', '休息一下吧，你做得很好！');
        } else if (!skipped) {
            this.switchToMode('pomodoro');
            this.sendNotification('☕ 休息结束', '准备好继续专注了吗？');
        } else {
            this.setTimer(this.totalTime);
        }

        this.saveToStorage();
    }

    switchMode(btn) {
        if (this.isRunning) {
            this.pause();
        }

        // 更新按钮状态
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // 切换模式
        const mode = btn.dataset.mode;
        this.switchToMode(mode);
    }

    switchToMode(mode) {
        this.currentMode = mode;
        const minutes = this.times[mode];
        this.setTimer(minutes * 60);

        // 更新模式选择器UI
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        // 更新标签和颜色
        const labels = {
            pomodoro: { text: '专注时间', isBreak: false },
            shortBreak: { text: '短休息', isBreak: true },
            longBreak: { text: '长休息', isBreak: true }
        };

        const config = labels[mode];
        this.elements.timerLabel.textContent = config.text;

        if (config.isBreak) {
            this.elements.progress.classList.add('break-mode');
        } else {
            this.elements.progress.classList.remove('break-mode');
        }
    }

    setTimer(seconds) {
        this.totalTime = seconds;
        this.timeLeft = seconds;
        this.updateDisplay();
        this.updateTitle();
    }

    updateDisplay() {
        // 更新时间显示
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = this.timeLeft % 60;
        this.elements.timeDisplay.textContent =
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        // 更新进度环
        const circumference = 754; // 2 * PI * 120
        const progress = (this.totalTime - this.timeLeft) / this.totalTime;
        this.elements.progress.style.strokeDashoffset = circumference * (1 - progress);
    }

    updateTitle() {
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = this.timeLeft % 60;
        const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        const emojis = { pomodoro: '🍅', shortBreak: '☕', longBreak: '🌴' };
        document.title = `${emojis[this.currentMode]} ${timeStr} - 专注番茄钟`;
    }

    updateStats() {
        this.elements.completedPomodoros.textContent = this.completedPomodoros;
        this.elements.totalFocusTime.textContent = `${this.totalFocusMinutes}分钟`;
    }

    addPomodoroItem() {
        const item = document.createElement('span');
        item.className = 'pomodoro-item';
        item.textContent = '🍅';
        item.style.animationDelay = `${this.completedPomodoros * 0.1}s`;
        this.elements.pomodoroList.appendChild(item);
    }

    playAlarm() {
        try {
            // 使用 Web Audio API 创建提示音
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            const playBeep = (freq, startTime, duration) => {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.frequency.value = freq;
                oscillator.type = 'sine';
                
                gainNode.gain.setValueAtTime(0.3, startTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
                
                oscillator.start(startTime);
                oscillator.stop(startTime + duration);
            };

            // 播放三声提示音
            const now = audioContext.currentTime;
            playBeep(800, now, 0.2);
            playBeep(800, now + 0.3, 0.2);
            playBeep(1000, now + 0.6, 0.4);
        } catch (e) {
            console.log('Audio not supported');
        }
    }

    sendNotification(title, body) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, {
                body,
                icon: '🍅'
            });
        } else if ('Notification' in window && Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    new Notification(title, { body, icon: '🍅' });
                }
            });
        }
    }

    saveToStorage() {
        const data = {
            timeLeft: this.timeLeft,
            totalTime: this.totalTime,
            currentMode: this.currentMode,
            isRunning: this.isRunning,
            completedPomodoros: this.completedPomodoros,
            totalFocusMinutes: this.totalFocusMinutes,
            times: this.times
        };
        localStorage.setItem('pomodoro-timer', JSON.stringify(data));
    }

    loadFromStorage() {
        try {
            const data = JSON.parse(localStorage.getItem('pomodoro-timer'));
            if (data) {
                this.timeLeft = data.timeLeft || this.times.pomodoro * 60;
                this.totalTime = data.totalTime || this.times.pomodoro * 60;
                this.currentMode = data.currentMode || 'pomodoro';
                this.completedPomodoros = data.completedPomodoros || 0;
                this.totalFocusMinutes = data.totalFocusMinutes || 0;

                if (data.times) {
                    this.times = { ...this.times, ...data.times };
                    
                    // 更新设置输入框
                    document.getElementById('pomodoro-time').value = this.times.pomodoro;
                    document.getElementById('short-break-time').value = this.times.shortBreak;
                    document.getElementById('long-break-time').value = this.times.longBreak;
                }

                // 更新模式UI
                this.switchToMode(this.currentMode);
                
                // 如果之前在运行中，暂停它（防止刷新后自动开始）
                if (data.isRunning) {
                    // 显示暂停状态但不要自动开始
                }

                // 恢复统计
                this.updateStats();

                // 恢复番茄列表
                for (let i = 0; i < this.completedPomodoros; i++) {
                    this.addPomodoroItem();
                }
            }
        } catch (e) {
            console.log('No saved state found');
        }
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    window.timer = new PomodoroTimer();

    // 请求通知权限
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
});
