
// UI管理模块
import { typewriterEffect, showTemporaryMessage } from './utils.js';

export class UIManager {
    constructor() {
        this.terminalStartTime = null;
        this.consoleLogHistory = [];
        this.currentStepCount = 0;
        this.totalSteps = 10;
        this.currentPlanningSteps = {};
    }

    // 更新规划状态
    updatePlanningStatus(message, type, detail = '', stepInfo = null) {
        const statusDiv = document.getElementById('planning-status');
        const statusText = document.getElementById('status-text');
        const statusDetail = document.getElementById('status-detail');
        const statusDetailLine = document.getElementById('status-detail-line');
        
        if (!this.terminalStartTime) {
            this.terminalStartTime = Date.now();
            this.startTerminal();
        }
        
        if (statusDiv) {
            statusDiv.style.display = 'block';
            statusDiv.className = `ai-terminal status-${type}`;
        }
        
        if (statusText) {
            typewriterEffect(statusText, message);
        }
        
        if (detail && statusDetailLine && statusDetail) {
            statusDetailLine.style.display = 'flex';
            statusDetail.textContent = detail;
        }
        
        this.addConsoleLog(type, message, detail);
        this.updateProgress(stepInfo);
        this.updateTerminalStatus(type);
        
        let stepId = null;
        if (stepInfo) {
            stepId = this.addPlanningStep(stepInfo);
            const stepsDiv = document.getElementById('planning-steps');
            if (stepsDiv) stepsDiv.style.display = 'block';
        }
        
        if (type === 'loading') {
            this.createParticles();
        }
        
        return stepId;
    }

    // 启动终端
    startTerminal() {
        const terminalStatus = document.getElementById('terminal-status');
        const footerStatus = document.getElementById('footer-status');
        const systemInfo = document.getElementById('system-info');
        
        setTimeout(() => {
            if (terminalStatus) {
                terminalStatus.textContent = 'ACTIVE';
                terminalStatus.style.background = '#38a169';
            }
            if (footerStatus) {
                footerStatus.textContent = 'ACTIVE';
                footerStatus.style.color = '#68d391';
            }
            if (systemInfo) {
                typewriterEffect(systemInfo, 'Claude-4 AI Planning Agent initialized successfully ✓');
            }
        }, 500);
        
        this.updateTimingInfo();
        setInterval(() => this.updateTimingInfo(), 1000);
    }

    // 添加console日志
    addConsoleLog(level, message, detail = '') {
        const logsContainer = document.getElementById('console-logs');
        if (!logsContainer) return;
        
        const timestamp = new Date().toLocaleTimeString().substring(0, 8);
        
        const logElement = document.createElement('div');
        logElement.className = 'console-log';
        
        const levelClass = level === 'loading' ? 'info' : 
                          level === 'success' ? 'success' : 
                          level === 'error' ? 'error' : 'debug';
        
        logElement.innerHTML = `
            <span class="log-timestamp">${timestamp}</span>
            <span class="log-level ${levelClass}">${levelClass.toUpperCase()}</span>
            <span class="log-content">${message}${detail ? ` → ${detail}` : ''}</span>
        `;
        
        logsContainer.appendChild(logElement);
        
        if (logsContainer.children.length > 20) {
            logsContainer.removeChild(logsContainer.firstChild);
        }
        
        logsContainer.scrollTop = logsContainer.scrollHeight;
        
        this.consoleLogHistory.push({
            timestamp: new Date().toISOString(),
            level: levelClass,
            message,
            detail
        });
    }

    // 更新进度
    updateProgress(stepInfo) {
        const progressContainer = document.getElementById('progress-container');
        const progressFill = document.getElementById('progress-fill');
        const progressLabel = document.getElementById('progress-label');
        
        if (!stepInfo || !stepInfo.step) return;
        
        if (progressContainer) progressContainer.style.display = 'block';
        
        if (typeof stepInfo.step === 'number') {
            this.currentStepCount = stepInfo.step;
            const progress = (this.currentStepCount / this.totalSteps) * 100;
            if (progressFill) progressFill.style.width = `${Math.min(progress, 100)}%`;
            if (progressLabel) progressLabel.textContent = `Step ${this.currentStepCount}/${this.totalSteps}: ${stepInfo.action}`;
        } else if (stepInfo.step === 'final') {
            if (progressFill) progressFill.style.width = '100%';
            if (progressLabel) progressLabel.textContent = 'Planning completed successfully!';
        } else if (stepInfo.step === 'error') {
            if (progressFill) progressFill.style.background = '#e53e3e';
            if (progressLabel) progressLabel.textContent = 'Planning failed - see error details above';
        }
    }

    // 更新终端状态
    updateTerminalStatus(type) {
        const terminalStatus = document.getElementById('terminal-status');
        const footerStatus = document.getElementById('footer-status');
        
        if (!terminalStatus || !footerStatus) return;
        
        switch(type) {
            case 'loading':
                terminalStatus.textContent = 'PROCESSING';
                terminalStatus.style.background = '#4299e1';
                footerStatus.textContent = 'PROCESSING';
                footerStatus.style.color = '#63b3ed';
                break;
            case 'success':
                terminalStatus.textContent = 'COMPLETED';
                terminalStatus.style.background = '#38a169';
                footerStatus.textContent = 'COMPLETED';
                footerStatus.style.color = '#68d391';
                break;
            case 'error':
                terminalStatus.textContent = 'ERROR';
                terminalStatus.style.background = '#e53e3e';
                footerStatus.textContent = 'ERROR';
                footerStatus.style.color = '#fc8181';
                break;
        }
    }

    // 添加规划步骤
    addPlanningStep(stepInfo) {
        const stepsList = document.getElementById('steps-list');
        if (!stepsList) return null;
        
        const stepId = `step-${stepInfo.step}-${Date.now()}`;
        
        let statusClass, statusText;
        if (stepInfo.result === true) {
            statusClass = 'completed';
            statusText = 'COMPLETED';
        } else if (stepInfo.result === 'running' || (stepInfo.result === false && stepInfo.step !== 'error')) {
            statusClass = 'running';
            statusText = 'RUNNING';
        } else if (stepInfo.step === 'error' || stepInfo.result === 'failed') {
            statusClass = 'failed';
            statusText = 'FAILED';
        } else {
            statusClass = 'pending';
            statusText = 'PENDING';
        }
        
        const friendlyDescription = this.generateFriendlyDescription(stepInfo);
        
        const stepElement = document.createElement('div');
        stepElement.className = 'step-item';
        stepElement.id = stepId;
        
        stepElement.innerHTML = `
            <div class="step-header">
                <span class="step-title">${friendlyDescription.title}</span>
                <span class="step-status ${statusClass}">${statusText}</span>
            </div>
            <div class="step-description">${friendlyDescription.description}</div>
        `;
        
        stepsList.appendChild(stepElement);
        
        this.currentPlanningSteps[stepId] = {
            ...stepInfo,
            element: stepElement,
            statusClass: statusClass
        };
        
        stepElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
        return stepId;
    }

    // 生成用户友好的描述
    generateFriendlyDescription(stepInfo) {
        const action = stepInfo.action || '';
        const step = stepInfo.step;
        
        if (action.includes('初始化')) {
            return {
                title: `🤖 启动AI智能助手`,
                description: 'AI正在分析您的散步需求...'
            };
        } else if (action.includes('解析地址') || action.includes('geocode')) {
            return {
                title: `📍 定位起点位置`,
                description: '正在查找起点的精确坐标...'
            };
        } else if (action.includes('搜索周边') || action.includes('search_nearby')) {
            return {
                title: `🔍 寻找附近景点`,
                description: '正在搜索符合您偏好的附近地点...'
            };
        } else if (action.includes('文本搜索') || action.includes('text_search')) {
            return {
                title: `🏙️ 在城市中寻找地点`,
                description: '正在搜索城市中的相关地点...'
            };
        } else if (action.includes('路径规划') || action.includes('plan_walking')) {
            return {
                title: `🛣️ 规划最优路径`,
                description: '正在计算最佳散步路线...'
            };
        } else if (action.includes('生成最终')) {
            return {
                title: `🎯 生成推荐方案`,
                description: 'AI正在综合所有信息，为您生成最佳散步路线...'
            };
        } else if (step === 'final') {
            return {
                title: `✅ 规划完成`,
                description: '您的专属散步路线已成功生成！'
            };
        } else if (step === 'error') {
            return {
                title: `❌ 规划中断`,
                description: '规划过程中遇到问题，请重试'
            };
        } else {
            return {
                title: `⚙️ 第${step}步: ${action}`,
                description: stepInfo.description || '正在处理...'
            };
        }
    }

    // 创建粒子效果
    createParticles() {
        const particlesContainer = document.getElementById('particles-container');
        if (!particlesContainer) return;
        
        if (particlesContainer.children.length >= 10) return;
        
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                const particle = document.createElement('div');
                particle.className = 'particle';
                particle.style.left = Math.random() * 100 + '%';
                particle.style.animationDelay = Math.random() * 2 + 's';
                
                particlesContainer.appendChild(particle);
                
                setTimeout(() => {
                    if (particle.parentNode) {
                        particle.parentNode.removeChild(particle);
                    }
                }, 3000);
            }, i * 200);
        }
    }

    // 更新计时信息
    updateTimingInfo() {
        const timingInfo = document.getElementById('timing-info');
        if (this.terminalStartTime && timingInfo) {
            const elapsed = Math.floor((Date.now() - this.terminalStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            timingInfo.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    // 隐藏规划状态
    hidePlanningStatus() {
        const statusDiv = document.getElementById('planning-status');
        if (statusDiv) {
            statusDiv.style.transition = 'opacity 0.5s ease-out';
            statusDiv.style.opacity = '0';
            
            setTimeout(() => {
                statusDiv.style.display = 'none';
                statusDiv.style.opacity = '1';
                statusDiv.style.transition = '';
            }, 500);
        }
    }

    // 更新步骤状态
    updateStepStatus(stepId, status, detail, additionalData) {
        if (!stepId || !this.currentPlanningSteps[stepId]) {
            console.warn(`⚠️ 无效的步骤ID: ${stepId}`);
            return;
        }

        const stepData = this.currentPlanningSteps[stepId];
        const stepElement = stepData.element;
        
        if (!stepElement) return;

        // 更新状态类
        const statusElement = stepElement.querySelector('.step-status');
        if (statusElement) {
            statusElement.className = `step-status ${status}`;
            statusElement.textContent = status.toUpperCase();
        }

        // 更新描述
        if (detail) {
            const descElement = stepElement.querySelector('.step-description');
            if (descElement) {
                descElement.textContent = detail;
            }
        }

        // 更新内部数据
        this.currentPlanningSteps[stepId] = {
            ...stepData,
            status: status,
            detail: detail,
            additionalData: additionalData
        };

        // 滚动到视图
        stepElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // 清除规划步骤和重置终端
    clearPlanningSteps() {
        const stepsList = document.getElementById('steps-list');
        const stepsDiv = document.getElementById('planning-steps');
        const consoleLogsDiv = document.getElementById('console-logs');
        const progressContainer = document.getElementById('progress-container');
        const particlesContainer = document.getElementById('particles-container');
        
        if (stepsList) stepsList.innerHTML = '';
        if (stepsDiv) stepsDiv.style.display = 'none';
        if (consoleLogsDiv) consoleLogsDiv.innerHTML = '';
        if (progressContainer) progressContainer.style.display = 'none';
        if (particlesContainer) particlesContainer.innerHTML = '';
        
        this.terminalStartTime = null;
        this.consoleLogHistory = [];
        this.currentStepCount = 0;
        this.currentPlanningSteps = {};
    }
}
