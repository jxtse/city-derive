// Navigation页面的核心功能
class NavigationApp {
    constructor() {
        this.map = null;
        this.userLocation = null;
        this.currentPOIDetails = null;
        this.apiKey = 'c9e4a3040fef05c4084a21c8a357d37f';
        this.difyApiToken = 'app-66AeBLjLKMIYEsb5ufu0h8Ch';
        this.difyBaseUrl = 'https://api.dify.ai/v1';

        this.init();
    }

    async init() {
        console.log('🚀 初始化导航应用...');

        // 初始化地图
        await this.initMap();

        // 获取用户位置
        await this.getUserLocation();

        // 初始化AI问答
        this.setupAIChat();

        console.log('✅ 导航应用初始化完成');
    }

    async initMap() {
        try {
            console.log('🗺️ 初始化地图...');

            this.map = new AMap.Map('map', {
                zoom: 16,
                center: [116.397428, 39.90923], // 默认北京中心
                mapStyle: 'amap://styles/light',
                viewMode: '2D'
            });

            // 添加地图控件 - 使用兼容方式
            try {
                // 比例尺控件
                const scale = new AMap.Scale({
                    position: 'LB'
                });
                this.map.addControl(scale);

                // 工具条控件
                const toolbar = new AMap.ToolBar({
                    position: 'RT'
                });
                this.map.addControl(toolbar);
            } catch (controlError) {
                console.warn('⚠️ 地图控件加载失败，使用基础地图功能:', controlError);
                // 如果控件加载失败，仍可以使用基础地图功能
            }

            console.log('✅ 地图初始化完成');
        } catch (error) {
            console.error('❌ 地图初始化失败:', error);
        }
    }

    async getUserLocation() {
        this.showLoading('正在获取您的位置...');

        try {
            console.log('📍 开始获取用户位置...');

            // 使用浏览器Geolocation API
            const position = await new Promise((resolve, reject) => {
                if (!navigator.geolocation) {
                    reject(new Error('浏览器不支持地理定位'));
                    return;
                }

                navigator.geolocation.getCurrentPosition(
                    resolve,
                    reject,
                    {
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 300000 // 5分钟缓存
                    }
                );
            });

            const { latitude, longitude } = position.coords;
            this.userLocation = { latitude, longitude };

            console.log('✅ 获取到用户位置:', this.userLocation);

            // 更新地图中心
            this.map.setCenter([longitude, latitude]);

            // 添加用户位置标记
            const userMarker = new AMap.Marker({
                position: [longitude, latitude],
                icon: new AMap.Icon({
                    size: new AMap.Size(40, 40),
                    image: this.createUserLocationIcon()
                }),
                title: '您的位置'
            });
            this.map.add(userMarker);

            // 获取当前位置的POI详情
            await this.getCurrentLocationPOI();

            // 更新位置显示
            this.updateLocationDisplay();

        } catch (error) {
            console.error('❌ 获取位置失败:', error);
            this.updateLocationDisplay('位置获取失败');

            // 使用IP定位作为备选
            await this.getLocationByIP();
        } finally {
            this.hideLoading();
        }
    }

    async getLocationByIP() {
        try {
            console.log('🌐 尝试IP定位...');

            // 使用高德地图IP定位API
            const response = await fetch(`https://restapi.amap.com/v3/ip?key=${this.apiKey}`);
            const data = await response.json();

            if (data.status === "1" && data.rectangle) {
                const coords = data.rectangle.split(';')[0].split(',');
                const longitude = parseFloat(coords[0]);
                const latitude = parseFloat(coords[1]);

                this.userLocation = { latitude, longitude };
                this.map.setCenter([longitude, latitude]);

                console.log('✅ IP定位成功:', this.userLocation);
                this.updateLocationDisplay();
                await this.getCurrentLocationPOI();
            }
        } catch (error) {
            console.error('❌ IP定位也失败了:', error);
            this.updateLocationDisplay('无法获取位置');
        }
    }

    async getCurrentLocationPOI() {
        if (!this.userLocation) return;

        try {
            console.log('🔍 获取当前位置POI信息...');

            const { longitude, latitude } = this.userLocation;

            // 搜索周边POI
            const response = await fetch(
                `https://restapi.amap.com/v3/place/around?location=${longitude},${latitude}&radius=100&key=${this.apiKey}`
            );

            const data = await response.json();

            if (data.status === "1" && data.pois && data.pois.length > 0) {
                const nearestPOI = data.pois[0];
                console.log('📍 找到最近的POI:', nearestPOI);

                // 获取详细信息
                await this.getPOIDetails(nearestPOI.id);
            } else {
                console.log('⚠️ 未找到附近的POI');
            }
        } catch (error) {
            console.error('❌ 获取POI信息失败:', error);
        }
    }

    async getPOIDetails(poiId) {
        try {
            console.log('📋 获取POI详细信息:', poiId);

            const response = await fetch(
                `https://restapi.amap.com/v3/place/detail?id=${poiId}&key=${this.apiKey}`
            );

            const data = await response.json();

            if (data.status === "1" && data.pois && data.pois.length > 0) {
                this.currentPOIDetails = data.pois[0];
                console.log('✅ 获取到POI详情:', this.currentPOIDetails);

                // 调用Dify API分析POI
                await this.analyzeLocationWithDify();
            }
        } catch (error) {
            console.error('❌ 获取POI详情失败:', error);
        }
    }

    async analyzeLocationWithDify() {
        if (!this.currentPOIDetails) return;

        try {
            console.log('🤖 调用Dify AI分析位置...');

            const locationDescription = `${this.currentPOIDetails.name} - ${this.currentPOIDetails.address}`;

            const response = await fetch(`${this.difyBaseUrl}/workflows/run`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.difyApiToken}`
                },
                body: JSON.stringify({
                    inputs: {
                        location: locationDescription
                    },
                    response_mode: "blocking",
                    user: `navigation-user-${Date.now()}`
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Dify API调用失败: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            console.log('✅ Dify AI分析结果:', result);

            if (result.data && result.data.outputs && result.data.outputs.task_output) {
                try {
                    const taskOutput = JSON.parse(result.data.outputs.task_output);
                    console.log('✅ 解析的AI任务输出:', taskOutput);

                    // 验证数据格式
                    if (taskOutput.question && taskOutput.choices && Array.isArray(taskOutput.choices)) {
                        this.updateAIBubble(taskOutput);
                        console.log('✅ 真实Dify API数据已显示');
                    } else {
                        throw new Error('API返回的数据格式不符合预期');
                    }
                } catch (parseError) {
                    console.error('❌ 解析API响应失败:', parseError);
                    throw parseError;
                }
            } else {
                throw new Error('API响应中缺少必要的数据字段');
            }
        } catch (error) {
            console.error('❌ Dify AI分析失败:', error);
            // 使用默认问题
            this.updateAIBubble({
                question: `${this.currentPOIDetails.name}门前有什么独特元素？`,
                choices: [
                    { option: "水池/人工小湖", next_action: "查看水景特色" },
                    { option: "雕塑或艺术装置", next_action: "了解艺术元素" },
                    { option: "颜色鲜明的墙面", next_action: "观察建筑特色" },
                    { option: "大量绿植或独特行道树", next_action: "探索绿化景观" }
                ]
            });
        }
    }

    async getNextOptionsFromDify(selectedOption, selectedAction) {
        try {
            console.log('🔄 获取下一轮选项...', selectedOption, selectedAction);

            // 构建包含当前位置和用户选择的上下文
            const currentLocation = this.currentPOIDetails ? 
                `${this.currentPOIDetails.name} - ${this.currentPOIDetails.address}` : 
                '用户当前位置';

            const contextInfo = {
                current_location: currentLocation,
                user_choice: selectedOption,
                previous_action: selectedAction,
                user_coordinates: this.userLocation
            };

            // 显示加载状态
            this.showLoadingInBubble();

            const response = await fetch(`${this.difyBaseUrl}/workflows/run`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.difyApiToken}`
                },
                body: JSON.stringify({
                    inputs: {
                        location: currentLocation,
                        context: JSON.stringify(contextInfo),
                        previous_choice: selectedOption
                    },
                    response_mode: "blocking",
                    user: `navigation-user-${Date.now()}`
                })
            });

            if (!response.ok) {
                throw new Error(`Dify API调用失败: ${response.status}`);
            }

            const result = await response.json();
            console.log('✅ 获取到下一轮选项:', result);

            if (result.data && result.data.outputs && result.data.outputs.task_output) {
                const taskOutput = JSON.parse(result.data.outputs.task_output);
                this.updateAIBubble(taskOutput);
            } else {
                // 如果API没有返回预期格式，生成基于当前选择的后续选项
                this.generateFollowUpOptions(selectedOption);
            }

        } catch (error) {
            console.error('❌ 获取下一轮选项失败:', error);
            // 生成基于当前选择的后续选项
            this.generateFollowUpOptions(selectedOption);
        }
    }

    showLoadingInBubble() {
        const questionElement = document.getElementById('ai-question');
        const optionsContainer = document.getElementById('options-container');

        questionElement.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; color: #667eea;">
                <div class="loading-spinner" style="width: 16px; height: 16px; border: 2px solid #f3f4f6; border-top: 2px solid #667eea; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                正在获取下一步建议...
            </div>
        `;

        optionsContainer.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #6b7280;">
                <div style="font-size: 14px;">🤖 AI正在思考中...</div>
            </div>
        `;
    }

    generateFollowUpOptions(previousChoice) {
        console.log('🎯 生成基于选择的后续选项:', previousChoice);

        // 基于用户之前的选择生成相关的后续选项
        const followUpMap = {
            '水池/人工小湖': {
                question: '您对水景很感兴趣！接下来想了解什么？',
                choices: [
                    { option: "水池的设计理念", next_action: "了解设计师的创意思路" },
                    { option: "周边的休憩设施", next_action: "寻找可以休息的地方" },
                    { option: "水景的最佳观赏角度", next_action: "找到拍摄的好位置" },
                    { option: "附近类似的水景", next_action: "探索更多水景特色" }
                ]
            },
            '雕塑或艺术装置': {
                question: '艺术装置很有魅力！您想深入了解什么？',
                choices: [
                    { option: "艺术作品的创作背景", next_action: "了解艺术家和创作故事" },
                    { option: "雕塑的材质和工艺", next_action: "学习艺术制作技术" },
                    { option: "艺术装置的互动体验", next_action: "体验艺术与科技结合" },
                    { option: "周边其他艺术元素", next_action: "发现更多艺术装置" }
                ]
            },
            '颜色鲜明的墙面': {
                question: '建筑色彩很吸引人！您想探索什么？',
                choices: [
                    { option: "建筑的色彩搭配理念", next_action: "了解色彩心理学应用" },
                    { option: "墙面材质和质感", next_action: "触摸感受建筑材料" },
                    { option: "不同时间的光影效果", next_action: "观察光线变化的美感" },
                    { option: "建筑的拍照最佳角度", next_action: "寻找完美的拍摄点" }
                ]
            },
            '大量绿植或独特行道树': {
                question: '绿化景观很棒！您想了解什么？',
                choices: [
                    { option: "植物的种类和特色", next_action: "学习植物知识" },
                    { option: "景观设计的生态理念", next_action: "了解可持续发展理念" },
                    { option: "绿植的养护方法", next_action: "学习园艺技巧" },
                    { option: "四季景观的变化", next_action: "想象不同季节的美景" }
                ]
            }
        };

        const followUp = followUpMap[previousChoice] || {
            question: '您想继续探索什么？',
            choices: [
                { option: "周边的商业设施", next_action: "寻找购物和餐饮" },
                { option: "交通便利性", next_action: "了解出行方式" },
                { option: "历史文化背景", next_action: "探索地区文化" },
                { option: "未来发展规划", next_action: "了解区域发展前景" }
            ]
        };

        this.updateAIBubble(followUp);
    }

    updateAIBubble(data) {
        const questionElement = document.getElementById('ai-question');
        const optionsContainer = document.getElementById('options-container');

        if (data.question) {
            questionElement.textContent = data.question;
        }

        if (data.choices && data.choices.length > 0) {
            optionsContainer.innerHTML = '';

            data.choices.forEach((choice, index) => {
                const optionElement = document.createElement('div');
                optionElement.className = 'option-item';
                optionElement.onclick = () => {
                    // 选择新选项时，隐藏之前的常驻指令
                    this.hidePersistentInstruction();
                    this.selectOption(choice.option, choice.next_action);
                };

                optionElement.innerHTML = `
                    <div class="option-text">
                        ${choice.option}
                        <span class="option-arrow">→</span>
                    </div>
                `;

                optionsContainer.appendChild(optionElement);
            });
        }
    }

    setupAIChat() {
        // 5秒后自动显示AI问答气泡
        setTimeout(() => {
            this.showAIBubble();
        }, 5000);
    }

    showAIBubble() {
        document.getElementById('ai-chat-bubble').classList.add('show');
    }

    hideAIBubble() {
        document.getElementById('ai-chat-bubble').classList.remove('show');
    }

    selectOption(option, action) {
        console.log('✅ 用户选择:', option, action);

        // 更新AI气泡显示选择结果和下一步动作
        this.updateAIBubbleWithSelection(option, action);

        // 1.5秒后调用Dify API获取下一轮选项
        setTimeout(() => {
            this.getNextOptionsFromDify(option, action);
        }, 1500);

        // 执行相应的动作
        this.handleUserChoice(option, action);
    }

    updateAIBubbleWithSelection(selectedOption, nextAction) {
        // 创建或更新常驻指令信息区域
        this.createPersistentInstructionArea(selectedOption, nextAction);

        const questionElement = document.getElementById('ai-question');
        const optionsContainer = document.getElementById('options-container');

        // 更新问题显示为选择结果（简化版）
        questionElement.innerHTML = `
            <div style="color: #10b981; font-weight: 600; font-size: 15px;">
                ✅ 您选择了：${selectedOption}
            </div>
        `;

        // 清空选项容器，显示确认信息
        optionsContainer.innerHTML = `
            <div style="text-align: center; padding: 16px; background: rgba(16, 185, 129, 0.1); border-radius: 12px; border: 1px solid rgba(16, 185, 129, 0.2);">
                <div style="color: #10b981; font-size: 16px; margin-bottom: 4px;">🎯</div>
                <div style="color: #374151; font-size: 14px; font-weight: 500;">
                    正在为您分析相关信息...
                </div>
            </div>
        `;
    }

    createPersistentInstructionArea(selectedOption, nextAction) {
        // 检查是否已存在常驻指令区域
        let instructionArea = document.getElementById('persistent-instruction');

        if (!instructionArea) {
            // 创建常驻指令区域
            instructionArea = document.createElement('div');
            instructionArea.id = 'persistent-instruction';
            instructionArea.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                max-width: 380px;
                width: calc(100% - 40px);
                background: rgba(255, 255, 255, 0.98);
                backdrop-filter: blur(20px);
                border-radius: 16px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
                border: 2px solid #10b981;
                z-index: 1001;
                padding: 16px 20px;
                display: none;
                animation: slideDownInstruction 0.4s ease-out;
            `;

            document.body.appendChild(instructionArea);
        }

        // 更新指令内容
        instructionArea.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px; flex-shrink: 0;">
                    🧭
                </div>
                <div style="flex: 1;">
                    <div style="font-weight: 600; color: #1f2937; font-size: 14px; margin-bottom: 4px;">
                        跟随指令
                    </div>
                    <div style="color: #374151; font-size: 13px; line-height: 1.4;">
                        ${nextAction || '正在为您准备相关信息...'}
                    </div>
                </div>
                <button onclick="navigationApp.hidePersistentInstruction()" style="background: none; border: none; color: #6b7280; font-size: 18px; cursor: pointer; padding: 4px; border-radius: 4px; transition: all 0.2s ease;">
                    ×
                </button>
            </div>
        `;

        // 显示指令区域
        instructionArea.style.display = 'block';

        // 调整AI气泡位置，避免重叠
        const aiChatBubble = document.getElementById('ai-chat-bubble');
        if (aiChatBubble) {
            aiChatBubble.style.top = '120px'; // 给常驻指令区域留出空间
        }
    }

    hidePersistentInstruction() {
        const instructionArea = document.getElementById('persistent-instruction');
        if (instructionArea) {
            instructionArea.style.display = 'none';
        }

        // 恢复AI气泡位置
        const aiChatBubble = document.getElementById('ai-chat-bubble');
        if (aiChatBubble) {
            aiChatBubble.style.top = '60px';
        }
    }

    handleUserChoice(option, action) {
        console.log('🎯 执行用户选择的动作:', action);

        // 根据选择的选项执行不同的动作
        switch(option) {
            case '水池/人工小湖':
                this.showWaterFeatureInfo();
                break;
            case '雕塑或艺术装置':
                this.showArtInstallationInfo();
                break;
            case '颜色鲜明的墙面':
                this.showArchitecturalFeatureInfo();
                break;
            case '大量绿植或独特行道树':
                this.showGreenLandscapeInfo();
                break;
            default:
                this.showGenericActionInfo(option, action);
        }
    }

    showWaterFeatureInfo() {
        console.log('🌊 显示水景特色信息');
        setTimeout(() => {
            this.showMessage('💧 水景特色：湖畔创研中心前的人工水池采用现代设计理念，营造宁静的办公氛围', 'info');
        }, 1000);
    }

    showArtInstallationInfo() {
        console.log('🎨 显示艺术装置信息');
        setTimeout(() => {
            this.showMessage('🎨 艺术元素：现代雕塑与建筑完美融合，体现创新与传统的平衡', 'info');
        }, 1000);
    }

    showArchitecturalFeatureInfo() {
        console.log('🏢 显示建筑特色信息');
        setTimeout(() => {
            this.showMessage('🏢 建筑特色：醒目的色彩搭配彰显现代商务风格，增强视觉识别度', 'info');
        }, 1000);
    }

    showGreenLandscapeInfo() {
        console.log('🌿 显示绿化景观信息');
        setTimeout(() => {
            this.showMessage('🌿 绿化景观：精心设计的景观绿化提供舒适的工作环境和休憩空间', 'info');
        }, 1000);
    }

    showGenericActionInfo(option, action) {
        console.log(`📋 显示通用动作信息: ${option} -> ${action}`);
        setTimeout(() => {
            this.showMessage(`🔍 ${action}`, 'info');
        }, 1000);
    }

    updateLocationDisplay(customText = null) {
        const locationText = document.getElementById('location-text');

        if (customText) {
            locationText.textContent = customText;
            return;
        }

        if (this.userLocation) {
            const { latitude, longitude } = this.userLocation;
            locationText.textContent = `当前位置: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

            if (this.currentPOIDetails) {
                locationText.textContent = `📍 ${this.currentPOIDetails.name}`;
            }
        } else {
            locationText.textContent = '位置信息不可用';
        }
    }

    refreshLocation() {
        this.getUserLocation();
    }

    showLoading(text = '加载中...') {
        const overlay = document.getElementById('loading-overlay');
        const loadingText = overlay.querySelector('.loading-text');
        loadingText.textContent = text;
        overlay.classList.add('show');
    }

    hideLoading() {
        document.getElementById('loading-overlay').classList.remove('show');
    }

    showMessage(message, type = 'info') {
        const messageElement = document.createElement('div');
        messageElement.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
            color: white;
            border-radius: 8px;
            font-weight: 500;
            z-index: 9999;
            animation: slideInRight 0.3s ease-out;
        `;
        messageElement.textContent = message;

        document.body.appendChild(messageElement);

        setTimeout(() => {
            if (messageElement.parentNode) {
                messageElement.parentNode.removeChild(messageElement);
            }
        }, 3000);
    }

    createUserLocationIcon() {
        const svg = `
            <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                <circle cx="20" cy="20" r="18" fill="#10b981" stroke="white" stroke-width="3"/>
                <circle cx="20" cy="20" r="8" fill="white"/>
                <circle cx="20" cy="20" r="4" fill="#10b981"/>
            </svg>
        `;
        return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    }
}

// 全局函数
function showAIBubble() {
    if (window.navigationApp) {
        window.navigationApp.showAIBubble();
    }
}

function hideAIBubble() {
    if (window.navigationApp) {
        window.navigationApp.hideAIBubble();
    }
}

function selectOption(option, action) {
    if (window.navigationApp) {
        window.navigationApp.selectOption(option, action);
    }
}

function refreshLocation() {
    if (window.navigationApp) {
        window.navigationApp.refreshLocation();
    }
}

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', function() {
    window.navigationApp = new NavigationApp();
});