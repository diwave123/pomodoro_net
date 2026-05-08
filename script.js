// ========== 番茄钟主程序 ==========
class PomodoroTimer {
    constructor() {
        // 状态
        this.isRunning = false;
        this.timeLeft = 25 * 60;
        this.totalTime = 25 * 60;
        this.currentMode = 'pomodoro';
        this.intervalId = null;
        this.completedPomodoros = 0;
        this.totalFocusMinutes = 0;

        // 时间配置
        this.times = { pomodoro: 25, shortBreak: 5, longBreak: 15 };

        // 每日目标
        this.dailyGoal = 8;

        // 自动连续模式
        this.autoContinue = false;

        // 当前选中任务ID（用于绑定番茄钟）
        this.currentTaskId = null;

        // 待办清单数据
        this.todos = [];

        // 历史记录
        this.history = {};

        // 连续打卡
        this.streakDays = 0;
        this.lastActiveDate = null;

        // 白噪音
        this.activeAmbient = null;
        this.ambientGainNode = null;
        this.audioContext = null;

        // DOM 元素缓存
        this.el = {
            timeDisplay: document.getElementById('time-display'),
            timerLabel: document.getElementById('timer-label'),
            currentTaskLabel: document.getElementById('current-task-label'),
            progress: document.getElementById('progress'),
            startBtn: document.getElementById('start-btn'),
            resetBtn: document.getElementById('reset-btn'),
            skipBtn: document.getElementById('skip-btn'),
            playIcon: document.getElementById('play-icon'),
            pauseIcon: document.getElementById('pause-icon'),
            completedPomodoros: document.getElementById('completed-pomodoros'),
            totalFocusTime: document.getElementById('total-focus-time'),
            tasksCompletedToday: document.getElementById('tasks-completed-today'),
            pomodoroList: document.getElementById('pomodoro-list'),
            streakInfo: document.getElementById('streak-info'),
            goalInfo: document.getElementById('goal-info')
        };

        this.init();
    }

    init() {
        this.bindEvents();
        this.loadFromStorage();
        this.checkDailyReset();
        this.updateDisplay();
        this.updateTitle();
        this.updateStats();
        this.updateStreak();
        this.updateGoalProgress();
        this.renderTodos();
        this.renderStats();
    }

    // ====== 事件绑定 ======
    bindEvents() {
        // 开始/暂停
        this.el.startBtn.addEventListener('click', () => this.toggle());
        this.el.resetBtn.addEventListener('click', () => this.reset());
        this.el.skipBtn.addEventListener('click', () => this.skip());

        // 模式切换
        document.querySelectorAll('.mode-pill').forEach(btn => {
            btn.addEventListener('click', e => this.switchMode(e.currentTarget));
        });

        // 设置输入
        const settingMap = {
            'pomodoro-time': 'pomodoro',
            'short-break-time': 'shortBreak',
            'long-break-time': 'longBreak'
        };
        Object.entries(settingMap).forEach(([id, mode]) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', e => {
                let v = parseInt(e.target.value) || 1;
                v = Math.max(1, Math.min(60, v));
                e.target.value = v;
                this.times[mode] = v;
                if (this.currentMode === mode && !this.isRunning) this.setTimer(v * 60);
                this.saveToStorage();
            });
        });

        // 每日目标
        const goalInput = document.getElementById('daily-goal');
        if (goalInput) goalInput.addEventListener('change', e => {
            let v = parseInt(e.target.value) || 1;
            v = Math.max(1, Math.min(30, v));
            e.target.value = v;
            this.dailyGoal = v;
            this.el.goalInfo.textContent = v;
            this.updateGoalProgress();
            this.saveToStorage();
        });

        // 自动连续模式
        const autoContinueEl = document.getElementById('auto-continue');
        if (autoContinueEl) autoContinueEl.addEventListener('change', e => {
            this.autoContinue = e.target.checked;
            this.saveToStorage();
        });

        // Tab 导航（底部导航栏）
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                e.currentTarget.classList.add('active');
                const panel = document.getElementById(`panel-${e.currentTarget.dataset.panel}`);
                if (panel) panel.classList.add('active');

                if (e.currentTarget.dataset.panel === 'stats') {
                    setTimeout(() => this.renderStats(), 50);
                }
            });
        });

        // ====== 待办清单事件 ======
        const todoForm = document.getElementById('todo-form');
        if (todoForm) todoForm.addEventListener('submit', e => {
            e.preventDefault();
            this.addTodo();
        });

        // 任务过滤
        document.querySelectorAll('.filt-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                document.querySelectorAll('.filt-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.renderTodos(e.currentTarget.dataset.filter);
            });
        });

        // 清除已完成
        const clearBtn = document.getElementById('clear-completed');
        if (clearBtn) clearBtn.addEventListener('click', () => this.clearCompletedTodos());

        // ====== 白噪音事件 ======
        document.querySelectorAll('.sound-btn').forEach(btn => {
            btn.addEventListener('click', () => this.toggleAmbient(btn.dataset.sound));
        });

        const volumeSlider = document.getElementById('volume-slider');
        if (volumeSlider) volumeSlider.addEventListener('input', e => {
            if (this.ambientGainNode) {
                this.ambientGainNode.gain.value = e.target.value / 100 * 0.5;
            }
        });

        // ====== 统计范围切换 ======
        document.querySelectorAll('.r-tab').forEach(btn => {
            btn.addEventListener('click', e => {
                document.querySelectorAll('.r-tab').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.renderStats(e.currentTarget.dataset.range);
            });
        });

        // 键盘快捷键
        document.addEventListener('keydown', e => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.code === 'Space') { e.preventDefault(); this.toggle(); }
            else if (e.code === 'KeyR') this.reset();
            else if (e.code === 'KeyS') this.skip();
        });

        // ====== 浮动面板控制 ======
        const btnSound = document.getElementById('btn-sound');
        const btnSettings = document.getElementById('btn-settings');
        const btnTheme = document.getElementById('btn-theme');
        const panelSound = document.getElementById('panel-sound');
        const panelSettings = document.getElementById('panel-settings');

        if (btnSound && panelSound) {
            btnSound.addEventListener('click', () => {
                // 如果正在播放，点击直接停止
                if (this.activeAmbient) {
                    this.stopAmbient();
                    this.closePanel(panelSound, btnSound);
                } else {
                    this.togglePanel(panelSound, btnSound);
                }
            });
            panelSound.querySelector('.fp-close').addEventListener('click', () => this.closePanel(panelSound, btnSound));
        }

        if (btnSettings && panelSettings) {
            btnSettings.addEventListener('click', () => this.togglePanel(panelSettings, btnSettings));
            panelSettings.querySelector('.fp-close').addEventListener('click', () => this.closePanel(panelSettings, btnSettings));
        }

        // 点击外部关闭面板
        document.addEventListener('click', e => {
            if (!e.target.closest('.fab-btn') && !e.target.closest('.float-panel')) {
                this.closeAllPanels();
            }
        });

        // 停止播放按钮
        const stopSoundBtn = document.getElementById('btn-stop-sound');
        if (stopSoundBtn) {
            stopSoundBtn.addEventListener('click', () => {
                this.stopAmbient();
            });
        }

        // 页面隐藏/卸载时自动停止声音
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.activeAmbient) {
                this.stopAmbient();
            }
            if (!document.hidden && this.isRunning) {
                this.updateTitle();
            }
        });
        window.addEventListener('beforeunload', () => {
            if (this.activeAmbient) this.stopAmbient();
        });

        // ====== 主题切换 ======
        if (btnTheme) {
            // 恢复已保存的主题
            const savedTheme = localStorage.getItem('pomodoro-theme') || 'dark';
            this.applyTheme(savedTheme);
            
            btnTheme.addEventListener('click', () => {
                const current = document.documentElement.getAttribute('data-theme') || 'dark';
                const next = current === 'dark' ? 'light' : 'dark';
                this.applyTheme(next);
                localStorage.setItem('pomodoro-theme', next);
                // 更新按钮图标
                btnTheme.textContent = next === 'dark' ? '🌙' : '☀️';
                // 重新绘制图表（颜色可能需要刷新）
                setTimeout(() => this.renderStats(), 100);
            });
        }
    }

    // ====== 计时器控制 ======
    toggle() {
        this.isRunning ? this.pause() : this.start();
    }

    start() {
        this.isRunning = true;
        document.body.classList.add('running');
        this.el.playIcon.style.display = 'none';
        this.el.pauseIcon.style.display = 'block';
        this.intervalId = setInterval(() => this.tick(), 1000);

        // 显示当前任务标签
        this.updateCurrentTaskLabel();

        this.saveToStorage();
    }

    pause() {
        this.isRunning = false;
        document.body.classList.remove('running');
        this.el.playIcon.style.display = 'block';
        this.el.pauseIcon.style.display = 'none';
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
            this.logHistory();

            // 如果有绑定的任务，更新任务番茄数
            if (this.currentTaskId) {
                this.incrementTaskPomo(this.currentTaskId);
            }

            this.updateStats();
            this.updateGoalProgress();
            this.checkGoalAchieved();

            // 每4个番茄后长休息
            if (this.completedPomodoros % 4 === 0) {
                this.switchToMode('longBreak');
                this.sendNotification('🍅 番茄完成！', `已完成${this.completedPomodoros}个番茄，来个长休息吧！`);
            } else {
                this.switchToMode('shortBreak');
                this.sendNotification('🍅 番茄完成！', '休息一下吧，你做得很好！');
            }
        } else if (!skipped) {
            this.switchToMode('pomodoro');
            this.sendNotification('☕ 休息结束', '准备好继续专注了吗？');
        } else {
            this.setTimer(this.totalTime);
        }

        this.saveToStorage();
    }

    switchMode(btnOrString) {
        if (this.isRunning) this.pause();

        const mode = typeof btnOrString === 'string'
            ? btnOrString
            : btnOrString.dataset.mode;

        if (typeof btnOrString !== 'string') {
            document.querySelectorAll('.mode-pill').forEach(b => b.classList.remove('active'));
            btnOrString.classList.add('active');
        }

        this.switchToMode(mode);
    }

    switchToMode(mode) {
        this.currentMode = mode;
        const minutes = this.times[mode];
        this.setTimer(minutes * 60);

        document.querySelectorAll('.mode-pill').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        const labels = {
            pomodoro: { text: '专注时间', isBreak: false },
            shortBreak: { text: '短休息', isBreak: true },
            longBreak: { text: '长休息', isBreak: true }
        };
        const config = labels[mode];
        this.el.timerLabel.textContent = config.text;
        this.el.progress.classList.toggle('break-mode', config.isBreak);

        this.updateCurrentTaskLabel();
    }

    setTimer(seconds) {
        this.totalTime = seconds;
        this.timeLeft = seconds;
        this.updateDisplay();
        this.updateTitle();
    }

    updateDisplay() {
        const m = Math.floor(this.timeLeft / 60);
        const s = this.timeLeft % 60;
        this.el.timeDisplay.textContent =
            `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

        const circumference = 754;
        const progress = (this.totalTime - this.timeLeft) / this.totalTime;
        this.el.progress.style.strokeDashoffset = circumference * (1 - progress);
    }

    updateTitle() {
        const m = Math.floor(this.timeLeft / 60);
        const s = this.timeLeft % 60;
        const emojis = { pomodoro: '🍅', shortBreak: '☕', longBreak: '🌴' };
        document.title = `${emojis[this.currentMode]} ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')} - 专注番茄钟`;
    }

    updateCurrentTaskLabel() {
        if (this.currentTaskId) {
            const task = this.todos.find(t => t.id === this.currentTaskId);
            if (task && !task.completed) {
                this.el.currentTaskLabel.textContent = task.text;
                this.el.currentTaskLabel.classList.add('visible');
                return;
            }
        }
        this.el.currentTaskLabel.classList.remove('visible');
        this.el.currentTaskLabel.textContent = '';
    }

    updateStats() {
        this.el.completedPomodoros.textContent = this.completedPomodoros;
        this.el.totalFocusTime.textContent = `${this.totalFocusMinutes}分钟`;

        const completedTasks = this.todos.filter(t => t.completed).length;
        this.el.tasksCompletedToday.textContent = completedTasks;
    }

    addPomodoroItem() {
        const item = document.createElement('span');
        item.className = 'pomodoro-item';
        item.textContent = '🍅';
        item.style.animationDelay = `${this.completedPomodoros * 0.1}s`;
        this.el.pomodoroList.appendChild(item);
    }

    // ====== 连续打卡 & 目标 ======
    checkDailyReset() {
        const today = this.getTodayStr();
        if (this.lastActiveDate !== today) {
            // 检查是否是连续的昨天
            if (this.lastActiveDate) {
                const yesterday = this.getYesterdayStr();
                if (this.lastActiveDate === yesterday) {
                    // 连续，保持streak
                } else if (this.lastActiveDate < yesterday) {
                    // 断了
                    this.streakDays = 0;
                }
            }
            // 新的一天重置今日计数（保留历史记录）
            if (this.lastActiveDate !== today) {
                this.completedPomodoros = 0;
                this.totalFocusMinutes = 0;
                this.el.pomodoroList.innerHTML = '';

                // 重置未完成任务
                this.todos.forEach(t => {
                    t.pomosToday = 0;
                });
            }
            this.lastActiveDate = today;

            // 如果今天完成了至少一个番茄，增加streak
            const todayData = this.history[today];
            if (todayData && todayData.pomodoros > 0) {
                this.streakDays++;
            }
        }
    }

    getTodayStr() {
        return new Date().toISOString().split('T')[0];
    }

    getYesterdayStr() {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d.toISOString().split('T')[0];
    }

    updateStreak() {
        if (this.el.streakInfo) {
            this.el.streakInfo.innerHTML = `🔥 <strong>${this.streakDays}</strong>天`;
        }
    }

    updateGoalProgress() {
        const current = this.completedPomodoros;
        const target = this.dailyGoal;
        if (this.el.goalInfo) {
            this.el.goalInfo.innerHTML = `${current}<strong>/${target}</strong>`;
            this.el.goalInfo.classList.toggle('goal-done', current >= target);
        }
    }

    checkGoalAchieved() {
        if (this.completedPomodoros >= this.dailyGoal &&
            this.completedPomodoros - this.times.pomodoro <= this.dailyGoal) {
            this.sendNotification('🎯 目标达成！',
                `太棒了！今日目标 ${this.dailyGoal} 个番茄已完成！`);
        }
    }

    // ====== 历史日志 ======
    logHistory() {
        const today = this.getTodayStr();
        if (!this.history[today]) {
            this.history[today] = {
                pomodoros: 0,
                focusMinutes: 0,
                tasksCompleted: [],
                tasksDetail: []
            };
        }
        this.history[today].pomodoros++;
        this.history[today].focusMinutes += this.times.pomodoro;

        if (this.currentTaskId) {
            const task = this.todos.find(t => t.id === this.currentTaskId);
            if (task) {
                const existing = this.history[today].tasksDetail.find(d => d.taskId === task.id);
                if (existing) {
                    existing.count++;
                } else {
                    this.history[today].tasksDetail.push({
                        taskId: task.id,
                        taskText: task.text,
                        count: 1
                    });
                }
            }
        }

        // 更新streak：如果今天是第一次完成番茄且之前没算过
        const dayHistory = this.history[today];
        if (dayHistory.pomodoros === 1) {
            // 检查昨天的记录
            const yesterday = this.getYesterdayStr();
            if (this.history[yesterday] && this.history[yesterday].pomodoros > 0) {
                // 昨天有记录，继续streak
                this.streakDays = (this.streakDays || 0); // 保持
            } else if (this.lastActiveDate && this.lastActiveDate !== today) {
                const prevDate = new Date(this.lastActiveDate);
                const nowDate = new Date(today);
                const diffDays = Math.floor((nowDate - prevDate) / 86400000);
                if (diffDays > 1) this.streakDays = 0; // 断了
            }
            this.streakDays++;
            this.lastActiveDate = today;
            this.updateStreak();
        }
    }

    // ====== 待办清单 ======
    addTodo() {
        const input = document.getElementById('todo-input');
        const text = input.value.trim();
        if (!text) return;

        const todo = {
            id: Date.now().toString(),
            text: text,
            completed: false,
            createdAt: Date.now(),
            completedAt: null,
            pomosTotal: 0,
            pomosToday: 0
        };

        this.todos.unshift(todo);
        input.value = '';
        this.renderTodos();
        this.saveToStorage();
    }

    renderTodos(filter = 'all') {
        const list = document.getElementById('todo-list');
        const empty = document.getElementById('todo-empty');
        const footer = document.getElementById('todo-footer');
        const countEl = document.getElementById('todo-count');

        let filtered = this.todos;
        if (filter === 'active') filtered = this.todos.filter(t => !t.completed);
        if (filter === 'completed') filtered = this.todos.filter(t => t.completed);

        list.innerHTML = '';

        if (filtered.length === 0) {
            empty.classList.remove('hidden');
            footer.style.display = 'none';
        } else {
            empty.classList.add('hidden');
            footer.style.display = 'flex';
            countEl.textContent = `${this.todos.filter(t => !t.completed).length} 项待完成`;
        }

        filtered.forEach(todo => {
            const li = document.createElement('li');
            li.className = `task-item${todo.completed ? ' done' : ''}`;
            li.innerHTML = `
                <div class="task-check ${todo.completed ? 'on' : ''}"
                     data-id="${todo.id}" role="checkbox" tabindex="0"></div>
                <div class="task-body">
                    <div class="task-name">${this.escapeHtml(todo.text)}</div>
                    <div class="task-meta">
                        <span>🍅 × ${todo.pomosTotal}</span>
                        ${todo.completed ? `<span>✓ 完成</span>` : ''}
                    </div>
                </div>
                <div class="task-actions">
                    <button class="t-action start-t" data-action="start" data-id="${todo.id}" title="开始专注">▶️</button>
                    <button class="t-action del-t" data-action="delete" data-id="${todo.id}" title="删除">✕</button>
                </div>
            `;
            list.appendChild(li);
        });

        // 绑定任务操作事件
        list.querySelectorAll('.task-check').forEach(cb => {
            cb.addEventListener('click', () => this.toggleTodoComplete(cb.dataset.id));
            cb.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.toggleTodoComplete(cb.dataset.id); }});
        });

        list.querySelectorAll('.start-t').forEach(btn => {
            btn.addEventListener('click', () => this.selectTaskForPomodoro(btn.dataset.id));
        });

        list.querySelectorAll('.del-t').forEach(btn => {
            btn.addEventListener('click', () => this.deleteTodo(btn.dataset.id));
        });
    }

    toggleTodoComplete(id) {
        const todo = this.todos.find(t => t.id === id);
        if (!todo) return;

        todo.completed = !todo.completed;
        todo.completedAt = todo.completed ? Date.now() : null;

        // 记录到历史
        if (todo.completed) {
            const today = this.getTodayStr();
            if (!this.history[today]) this.history[today] = { pomodoros: 0, focusMinutes: 0, tasksCompleted: [], tasksDetail: [] };
            if (!this.history[today].tasksCompleted.includes(id)) {
                this.history[today].tasksCompleted.push(id);
            }
        }

        this.renderTodos(document.querySelector('.filt-btn.active')?.dataset.filter || 'all');
        this.updateStats();
        this.saveToStorage();
    }

    selectTaskForPomodoro(id) {
        const todo = this.todos.find(t => t.id === id);
        if (!todo) return;

        this.currentTaskId = id;

        // 切换到番茄钟面板
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        const timerNav = document.querySelector('[data-panel="timer"]');
        if (timerNav) timerNav.classList.add('active');
        const timerPanel = document.getElementById('panel-timer');
        if (timerPanel) timerPanel.classList.add('active');

        // 切换到专注模式
        if (this.currentMode !== 'pomodoro') {
            this.switchMode('pomodoro');
        }

        this.updateCurrentTaskLabel();

        // 高亮选中的任务
        document.querySelectorAll('.task-item').forEach(item =>
            item.style.borderColor = item.querySelector('.start-t')?.dataset.id === id
                ? 'var(--primary-color)' : 'transparent'
        );

        this.sendNotification('📋 已选择任务', `「${todo.text}」- 准备好开始了吗？`);
    }

    incrementTaskPomo(taskId) {
        const todo = this.todos.find(t => t.id === taskId);
        if (todo) {
            todo.pomosTotal++;
            todo.pomosToday++;
            this.renderTodos(document.querySelector('.filt-btn.active')?.dataset.filter || 'all');
        }
    }

    deleteTodo(id) {
        this.todos = this.todos.filter(t => t.id !== id);
        if (this.currentTaskId === id) {
            this.currentTaskId = null;
            this.updateCurrentTaskLabel();
        }
        this.renderTodos(document.querySelector('.filt-btn.active')?.dataset.filter || 'all');
        this.updateStats();
        this.saveToStorage();
    }

    clearCompletedTodos() {
        this.todos = this.todos.filter(t => !t.completed);
        this.renderTodos(document.querySelector('.filt-btn.active')?.dataset.filter || 'all');
        this.updateStats();
        this.saveToStorage();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ====== 浮动面板控制 ======
    togglePanel(panel, btn) {
        const isShown = panel.classList.contains('show');
        this.closeAllPanels();
        if (!isShown) {
            panel.classList.add('show');
            btn.classList.add('active');
        }
    }

    closePanel(panel, btn) {
        panel.classList.remove('show');
        if (btn) btn.classList.remove('active');
    }

    closeAllPanels() {
        document.querySelectorAll('.float-panel').forEach(p => p.classList.remove('show'));
        document.querySelectorAll('.fab-btn').forEach(b => b.classList.remove('active'));
    }

    // ====== 主题切换 ======
    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        const btnTheme = document.getElementById('btn-theme');
        if (btnTheme) {
            btnTheme.textContent = theme === 'dark' ? '🌙' : '☀️';
        }
    }

    // ====== 白噪音 ======
    initAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        return this.audioContext;
    }

    toggleAmbient(soundName) {
        // 如果点击的是当前激活的音效 -> 关闭
        if (this.activeAmbient === soundName) {
            this.stopAmbient();
            return;
        }

        this.stopAmbient();
        this.initAudioContext();

        const volumeSlider = document.getElementById('volume-slider');
        const volume = (parseInt(volumeSlider?.value) || 50) / 100 * 0.5;

        this.activeAmbient = soundName;
        this.createAmbientSound(soundName, volume);

        // 更新UI
        document.querySelectorAll('.sound-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sound === soundName);
        });
        // 🎵 按钮脉动提示
        document.getElementById('btn-sound')?.classList.add('playing');
    }

    createAmbientSound(type, volume) {
        const ctx = this.audioContext;
        const masterGain = ctx.createGain();
        masterGain.gain.value = volume;
        masterGain.connect(ctx.destination);
        this.ambientGainNode = masterGain;

        const noiseBuffer = this.createNoiseBuffer(ctx, 2.5);

        switch (type) {
            case 'rain':
                this.createRainSound(ctx, noiseBuffer, masterGain);
                break;
            case 'forest':
                this.createForestSound(ctx, noiseBuffer, masterGain);
                break;
            case 'ocean':
                this.createOceanSound(ctx, noiseBuffer, masterGain);
                break;
            case 'cafe':
                this.createCafeSound(ctx, noiseBuffer, masterGain);
                break;
            case 'fire':
                this.createFireSound(ctx, noiseBuffer, masterGain);
                break;
            case 'wind':
                this.createWindSound(ctx, noiseBuffer, masterGain);
                break;
        }
    }

    createNoiseBuffer(ctx, duration) {
        const sampleRate = ctx.sampleRate;
        const length = sampleRate * duration;
        const buffer = ctx.createBuffer(2, length, sampleRate);

        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                data[i] = Math.random() * 2 - 1;
            }
        }
        return buffer;
    }

    createRainSound(ctx, buffer, gainNode) {
        // 雨声：带通滤波噪声 + 周期性强度调制
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 3000;
        filter.Q.value = 0.5;

        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 0.15;
        lfoGain.gain.value = 0.3;

        lfo.connect(lfoGain);
        lfoGain.connect(gainNode.gain);
        lfo.start();

        source.connect(filter);
        filter.connect(gainNode);
        source.start();

        this._ambientSources = [source, lfo];
    }

    createForestSound(ctx, buffer, gainNode) {
        // 森林：低频滤波噪声 + 高频鸟鸣感
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const lowpass = ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 800;

        const highpass = ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 200;

        source.connect(lowpass);
        lowpass.connect(highpass);
        highpass.connect(gainNode);
        source.start();

        // 轻微的LFO调制
        const lfo = ctx.createOscillator();
        const lfoG = ctx.createGain();
        lfo.frequency.value = 0.08;
        lfoG.gain.value = 0.15;
        lfo.connect(lfoG);
        lfoG.connect(gainNode.gain);
        lfo.start();

        this._ambientSources = [source, lfo];
    }

    createOceanSound(ctx, buffer, gainNode) {
        // 海浪：低频噪声 + 正弦波调制模拟波浪
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const lowpass = ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 400;

        // 波浪调制
        const waveLfo = ctx.createOscillator();
        const waveLfoGain = ctx.createGain();
        waveLfo.frequency.value = 0.09; // ~11秒一个周期
        waveLfoGain.gain.value = 0.6;
        waveLfo.connect(waveLfoGain);
        waveLfoGain.connect(gainNode.gain);
        waveLfo.start();

        source.connect(lowpass);
        lowpass.connect(gainNode);
        source.start();

        this._ambientSources = [source, waveLfo];
    }

    createCafeSound(ctx, buffer, gainNode) {
        // 咖啡馆：中频噪声（模拟人声频率范围）+轻微调制
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const bandpass = ctx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.value = 600;
        bandpass.Q.value = 0.3;

        const secondBP = ctx.createBiquadFilter();
        secondBP.type = 'bandpass';
        secondBP.frequency.value = 1500;
        secondBP.Q.value = 0.4;

        source.connect(bandpass);
        bandpass.connect(secondBP);
        secondBP.connect(gainNode);
        source.start();

        // 轻微随机感
        const lfo = ctx.createOscillator();
        const lg = ctx.createGain();
        lfo.frequency.value = 0.3;
        lg.gain.value = 0.08;
        lfo.connect(lg);
        lg.connect(gainNode.gain);
        lfo.start();

        this._ambientSources = [source, lfo];
    }

    createFireSound(ctx, buffer, gainNode) {
        // 篝火：低频噪声 + crackling效果
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const lowpass = ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 500;

        // 爆裂感的快速调制
        const crackleLfo = ctx.createOscillator();
        const crackleG = ctx.createGain();
        crackleLfo.frequency.value = 4 + Math.random() * 6;
        crackleG.gain.value = 0.12;
        crackleLfo.connect(crackleG);
        crackleG.connect(gainNode.gain);
        crackleLfo.start();

        source.connect(lowpass);
        lowpass.connect(gainNode);
        source.start();

        // 缓慢的整体波动
        const slowLfo = ctx.createOscillator();
        const slowG = ctx.createGain();
        slowLfo.frequency.value = 0.05;
        slowG.gain.value = 0.08;
        slowLfo.connect(slowG);
        slowG.connect(gainNode.gain);
        slowLfo.start();

        this._ambientSources = [source, crackleLfo, slowLfo];
    }

    createWindSound(ctx, buffer, gainNode) {
        // 风声：高通+低通组合 + 动态滤波
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const highpass = ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 200;

        // 动态滤波模拟风的变化
        const filterModulator = ctx.createOscillator();
        const modulatorGain = ctx.createGain();
        filterModulator.frequency.value = 0.07;
        modulatorGain.gain.value = 300;

        filterModulator.connect(modulatorGain);
        modulatorGain.connect(highpass.frequency);
        filterModulator.start();

        source.connect(highpass);
        highpass.connect(gainNode);
        source.start();

        this._ambientSources = [source, filterModulator];
    }

    stopAmbient() {
        if (this._ambientSources) {
            try {
                this._ambientSources.forEach(s => {
                    try { s.stop(); } catch(e) {}
                });
            } catch(e) {}
            this._ambientSources = null;
        }
        if (this.ambientGainNode) {
            try { this.ambientGainNode.disconnect(); } catch(e) {}
            this.ambientGainNode = null;
        }
        this.activeAmbient = null;
        document.querySelectorAll('.sound-btn').forEach(btn => btn.classList.remove('active'));
        // 清除 🎵 按钮脉动
        document.getElementById('btn-sound')?.classList.remove('playing');
    }

    // ====== 统计图表 ======
    renderStats(range = 'today') {
        this.renderOverview(range);
        this.renderChart(range);
        this.renderHeatmap(range);
        this.renderHistory(range);
    }

    renderOverview(range) {
        let data = this.getRangeData(range);

        document.getElementById('overview-total-pomos').textContent = data.totalPomodoros;
        document.getElementById('overview-total-hours').textContent = data.totalHours >= 1
            ? `${data.totalHours.toFixed(1)}h` : `${Math.round(data.totalHours * 60)}m`;
        document.getElementById('overview-total-tasks').textContent = data.totalTasks;
        document.getElementById('overview-best-streak').textContent = this.streakDays;
    }

    renderChart(range) {
        const canvas = document.getElementById('stats-chart');
        if (!canvas) return;

        const parent = document.getElementById('chart-area');
        if (!parent) return;

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = parent.getBoundingClientRect();

        canvas.width = rect.width * dpr;
        canvas.height = 140 * dpr;
        ctx.scale(dpr, dpr);

        const w = rect.width;
        const h = 140;
        const padding = { top: 18, right: 12, bottom: 24, left: 30 };

        // 清空
        ctx.clearRect(0, 0, w, h);

        // 获取数据
        const chartData = this.getChartData(range);
        if (!chartData.labels.length || chartData.values.every(v => v === 0)) {
            ctx.fillStyle = 'rgba(160, 160, 176, 0.5)';
            ctx.font = '14px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(w > 240 ? '暂无数据，开始专注吧！' : '暂无数据', w / 2, h / 2);
            return;
        }

        const maxVal = Math.max(...chartData.values, 1);
        const chartW = padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;
        const barCount = chartData.values.length;
        const barGap = 6;
        const barW = Math.min(Math.max((chartW - barGap * (barCount - 1)) / barCount, 16), 40);
        const totalBarsWidth = barW * barCount + barGap * (barCount - 1);
        const startX = (w - totalBarsWidth) / 2;

        // 绘制网格线
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (chartH / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(w - padding.right, y);
            ctx.stroke();
        }

        // Y轴标签
        ctx.fillStyle = 'rgba(160, 160, 176, 0.7)';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'right';
        for (let i = 0; i <= 4; i++) {
            const val = Math.round(maxVal - (maxVal / 4) * i);
            const y = padding.top + (chartH / 4) * i;
            ctx.fillText(val.toString(), padding.left - 8, y + 3);
        }

        // 绘制柱状图
        chartData.values.forEach((val, i) => {
            const x = startX + i * (barW + barGap);
            const barH = (val / maxVal) * chartH;
            const y = padding.top + chartH - barH;

            // 渐变
            const gradient = ctx.createLinearGradient(x, y, x, y + barH);
            gradient.addColorStop(0, '#ff6b5b');
            gradient.addColorStop(1, '#e74c3c');

            // 圆角矩形
            const radius = Math.min(barW / 3, 6);
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + barW - radius, y);
            ctx.quadraticCurveTo(x + barW, y, x + barW, y + radius);
            ctx.lineTo(x + barW, y + barH);
            ctx.lineTo(x, y + barH);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
            ctx.fillStyle = gradient;
            ctx.fill();

            // X轴标签
            ctx.fillStyle = 'rgba(160, 160, 176, 0.7)';
            ctx.font = '10px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(chartData.labels[i], x + barW / 2, h - padding.bottom + 16);
        });
    }

    getChartData(range) {
        const labels = [];
        const values = [];

        if (range === 'today') {
            return { labels: ['今天'], values: [this.completedPomodoros] };
        }

        if (range === 'week') {
            for (let i = 6; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const key = date.toISOString().split('T')[0];
                const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
                labels.push(days[date.getDay()]);
                values.push(this.history[key]?.pomodoros || 0);
            }
            return { labels, values };
        }

        if (range === 'month') {
            const now = new Date();
            for (let i = 29; i >= 0; i--) {
                const date = new Date(now);
                date.setDate(date.getDate() - i);
                const key = date.toISOString().split('T')[0];
                labels.push(`${date.getMonth() + 1}/${date.getDate()}`);
                values.push(this.history[key]?.pomodoros || 0);
            }
            return { labels, values };
        }

        return { labels, values };
    }

    getRangeData(range) {
        if (range === 'today') {
            return {
                totalPomodoros: this.completedPomodoros,
                totalHours: this.totalFocusMinutes / 60,
                totalTasks: this.todos.filter(t => t.completed).length
            };
        }

        const keys = Object.keys(this.history);
        let totalP = 0, totalM = 0, totalT = new Set();

        keys.forEach(key => {
            const withinRange = (() => {
                const d = new Date(key + 'T00:00:00');
                const now = new Date();
                if (range === 'week') {
                    const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
                    return d >= weekAgo && d <= now;
                }
                if (range === 'month') {
                    const monthAgo = new Date(now); monthAgo.setMonth(monthAgo.getMonth() - 1);
                    return d >= monthAgo && d <= now;
                }
                return false;
            })();

            if (withinRange) {
                const h = this.history[key];
                totalP += h.pomodoros || 0;
                totalM += h.focusMinutes || 0;
                if (h.tasksCompleted) h.tasksCompleted.forEach(id => totalT.add(id));
            }
        });

        return { totalPomodoros: totalP, totalHours: totalM / 60, totalTasks: totalT.size };
    }

    renderHeatmap(range) {
        const wrapper = document.getElementById('heatmap-wrapper');
        if (!wrapper) return;

        wrapper.innerHTML = '';

        const daysToShow = range === 'week' ? 7 : range === 'month' ? 28 : 1;
        const maxVal = Math.max(
            ...Object.values(this.history).map(h => h.pomodoros),
            1
        );

        for (let i = daysToShow - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const key = date.toISOString().split('T')[0];
            const val = this.history[key]?.pomodoros || 0;

            const cell = document.createElement('div');
            cell.className = 'heat-cell';

            if (val > 0) {
                const level = val >= maxVal * 0.75 ? 'l4' : val >= maxVal * 0.5 ? 'l3' : val >= maxVal * 0.25 ? 'l2' : 'l1';
                cell.classList.add(level);
            }

            cell.title = `${key}: ${val} 个番茄`;
            wrapper.appendChild(cell);
        }
    }

    renderHistory(range) {
        const container = document.getElementById('history-list');
        if (!container) return;

        container.innerHTML = '';

        const entries = Object.entries(this.history)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .slice(0, range === 'week' ? 7 : range === 'month' ? 14 : 1);

        if (entries.length === 0) {
            container.innerHTML = '<p class="empty-hist">暂无历史记录</p>';
            return;
        }

        entries.forEach(([dateKey, data]) => {
            const dayDiv = document.createElement('div');
            dayDiv.className = 'h-day';

            const date = new Date(dateKey + 'T00:00:00');
            const dateStr = `${date.getMonth() + 1}月${date.getDate()}日 ${['周日','周一','周二','周三','周四','周五','周六'][date.getDay()]}`;

            dayDiv.innerHTML = `
                <div class="h-date">${dateStr} — 🍅${data.pomodoros} · ${Math.floor(data.focusMinutes)}分钟</div>
                <div class="h-chips"></div>
            `;
            container.appendChild(dayDiv);

            const chipsDiv = dayDiv.querySelector('.h-chips');
            if (data.tasksDetail && data.tasksDetail.length > 0) {
                data.tasksDetail.forEach(detail => {
                    const chip = document.createElement('span');
                    chip.className = 'h-chip';
                    chip.innerHTML = `${this.escapeHtml(detail.taskText)}<b>×${detail.count}</b>`;
                    chipsDiv.appendChild(chip);
                });
            }
        });
    }

    // ====== 提示音 & 通知 ======
    playAlarm() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const beep = (freq, start, dur) => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.connect(g);
                g.connect(ctx.destination);
                osc.frequency.value = freq;
                osc.type = 'sine';
                g.gain.setValueAtTime(0.3, start);
                g.gain.exponentialRampToValueAtTime(0.01, start + dur);
                osc.start(start);
                osc.stop(start + dur);
            };
            const n = ctx.currentTime;
            beep(800, n, 0.2);
            beep(800, n + 0.3, 0.2);
            beep(1000, n + 0.6, 0.4);
        } catch(e) {}
    }

    sendNotification(title, body) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, { body, icon: '🍅' });
        } else if ('Notification' in window && Notification.permission !== 'denied') {
            Notification.requestPermission().then(p => {
                if (p === 'granted') new Notification(title, { body, icon: '🍅' });
            });
        }
    }

    // ====== 数据持久化 ======
    saveToStorage() {
        localStorage.setItem('pomodoro-timer', JSON.stringify({
            timeLeft: this.timeLeft,
            totalTime: this.totalTime,
            currentMode: this.currentMode,
            isRunning: this.isRunning,
            completedPomodoros: this.completedPomodoros,
            totalFocusMinutes: this.totalFocusMinutes,
            times: this.times,
            dailyGoal: this.dailyGoal,
            autoContinue: this.autoContinue,
            currentTaskId: this.currentTaskId,
            todos: this.todos,
            history: this.history,
            streakDays: this.streakDays,
            lastActiveDate: this.lastActiveDate
        }));
    }

    loadFromStorage() {
        try {
            const raw = localStorage.getItem('pomodoro-timer');
            if (!raw) return;

            const d = JSON.parse(raw);
            this.timeLeft = d.timeLeft ?? this.times.pomodoro * 60;
            this.totalTime = d.totalTime ?? this.times.pomodoro * 60;
            this.currentMode = d.currentMode ?? 'pomodoro';
            this.completedPomodoros = d.completedPomodoros ?? 0;
            this.totalFocusMinutes = d.totalFocusMinutes ?? 0;
            this.dailyGoal = d.dailyGoal ?? 8;
            this.autoContinue = d.autoContinue ?? false;
            this.currentTaskId = d.currentTaskId ?? null;
            this.todos = d.todos ?? [];
            this.history = d.history ?? {};
            this.streakDays = d.streakDays ?? 0;
            this.lastActiveDate = d.lastActiveDate ?? null;

            if (d.times) this.times = { ...this.times, ...d.times };

            // 同步设置UI
            const syncVal = (id, val) => { const el = document.getElementById(id); if(el) el.value=val; };
            syncVal('pomodoro-time', this.times.pomodoro);
            syncVal('short-break-time', this.times.shortBreak);
            syncVal('long-break-time', this.times.longBreak);
            syncVal('daily-goal', this.dailyGoal);

            const acEl = document.getElementById('auto-continue');
            if(acEl) acEl.checked = this.autoContinue;

            // 同步顶部状态栏
            this.updateStreak();
            this.updateGoalProgress();

            if(d.isRunning){ /* 不自动恢复运行 */ }

            // 恢复番茄图标
            for(let i=0;i<this.completedPomodoros;i++) this.addPomodoroItem();
        } catch(e) {
            console.warn('加载存储失败:', e);
        }
    }
}

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
    window.timer = new PomodoroTimer();

    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    // 窗口大小改变时重绘图表
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const activeTab = document.querySelector('.tab-panel.active');
            if(activeTab && activeTab.id === 'panel-stats'){
                const activeRange = document.querySelector('.r-tab.active');
                window.timer.renderStats(activeRange?.dataset.range || 'today');
            }
        }, 250);
    });
});
