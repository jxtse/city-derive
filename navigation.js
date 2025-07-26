// Navigation页面的核心功能
class NavigationApp {
    constructor() {
        this.map = null;
        this.userLocation = null;
        this.currentPOIDetails = null;
        this.apiKey = 'c9e4a3040fef05c4084a21c8a357d37f';
        this.difyApiToken = 'app-66AeBLjLKMIYEsb5ufu0h8Ch';
        this.difyBaseUrl = 'https://api.dify.ai/v1';
        this.cachedNextOptions = null; // 缓存下一轮选项

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
                center: [120.007986, 30.293312], // 默认湖畔创研中心
                features: ['bg', "road", "building"], 
                mapStyle: 'amap://styles/macaron',
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

            // 立即显示AI气泡并开始分析
            this.showAIBubble();
            await this.analyzeLocationWithDify();

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
                
                // 显示AI气泡并开始分析
                this.showAIBubble();
                await this.analyzeLocationWithDify();
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
        // 如果没有POI详情，使用基本位置信息
        if (!this.currentPOIDetails && !this.userLocation) {
            console.warn('⚠️ 没有位置信息，无法进行AI分析');
            this.hideAIBubble();
            return;
        }

        try {
            console.log('🤖 调用Dify AI分析位置...');
            
            // 显示加载状态
            this.showLoadingInBubble();

            const locationDescription = this.currentPOIDetails ? 
                `${this.currentPOIDetails.name} - ${this.currentPOIDetails.address}` : 
                `经度${this.userLocation.longitude.toFixed(6)}, 纬度${this.userLocation.latitude.toFixed(6)}`;

            const response = await fetch(`${this.difyBaseUrl}/workflows/run`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.difyApiToken}`
                },
                body: JSON.stringify({
                    inputs: {
                        location: locationDescription,
                        poi_name: this.currentPOIDetails ? this.currentPOIDetails.name : '',
                        poi_address: this.currentPOIDetails ? this.currentPOIDetails.address : '',
                        poi_type: this.currentPOIDetails ? (this.currentPOIDetails.type || '') : '',
                        user_coordinates: JSON.stringify(this.userLocation),
                        request_type: 'follow_up_analysis'
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
                        console.log('✅ AI建议已重新生成并显示');
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
            this.showMessage('AI分析服务暂时不可用，请稍后重试', 'error');
            // 显示重试按钮而不是隐藏AI气泡
            this.resetAIBubble();
        }
    }

    async getNextOptionsFromDify(selectedOption, selectedAction, shouldDisplay = true) {
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

            // 只有在需要显示时才显示加载状态
            if (shouldDisplay) {
                this.showLoadingInBubble();
            }

            const response = await fetch(`${this.difyBaseUrl}/workflows/run`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.difyApiToken}`
                },
                body: JSON.stringify({
                    inputs: {
                        location: currentLocation,
                        poi_name: this.currentPOIDetails ? this.currentPOIDetails.name : '',
                        poi_address: this.currentPOIDetails ? this.currentPOIDetails.address : '',
                        previous_choice: selectedOption,
                        previous_action: selectedAction,
                        user_coordinates: JSON.stringify(this.userLocation),
                        context: JSON.stringify(contextInfo),
                        request_type: 'follow_up_analysis'
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
                try {
                    const taskOutput = JSON.parse(result.data.outputs.task_output);
                    
                    if (shouldDisplay) {
                        this.updateAIBubble(taskOutput);
                        console.log('✅ 成功获取下一轮选项从Dify API');
                    } else {
                        // 将结果缓存起来，等待用户点击"已完成"按钮
                        this.cachedNextOptions = taskOutput;
                        console.log('✅ 下一轮选项已缓存，等待用户完成当前任务');
                    }
                } catch (parseError) {
                    console.error('❌ 解析Dify API响应失败:', parseError);
                    if (shouldDisplay) {
                        this.showMessage('AI响应格式错误，请重新选择', 'error');
                        this.resetAIBubble();
                    }
                }
            } else {
                console.error('❌ Dify API返回格式不正确');
                if (shouldDisplay) {
                    this.showMessage('AI服务响应异常，请重新选择', 'error');
                    this.resetAIBubble();
                }
            }

        } catch (error) {
            console.error('❌ 获取下一轮选项失败:', error);
            if (shouldDisplay) {
                this.showMessage('网络连接失败，请检查网络后重试', 'error');
                this.resetAIBubble();
            }
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

    resetAIBubble() {
        console.log('🔄 重置AI对话气泡');
        
        const questionElement = document.getElementById('ai-question');
        const optionsContainer = document.getElementById('options-container');
        
        questionElement.innerHTML = `
            <div style="color: #6b7280; font-size: 14px; text-align: center;">
                点击重新获取AI建议
            </div>
        `;
        
        optionsContainer.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <button onclick="navigationApp.retryDifyAnalysis()" style="
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                ">
                    🔄 重新获取AI建议
                </button>
            </div>
        `;
    }
    
    retryDifyAnalysis() {
        console.log('🔄 重新尝试Dify AI分析');
        // 显示AI气泡并开始分析
        this.showAIBubble();
        this.analyzeLocationWithDify();
    }

    markStepAsCompleted() {
        console.log('✅ 用户标记步骤为已完成');
        
        // 隐藏常驻指令
        this.hidePersistentInstruction();
        
        // 检查是否有缓存的下一轮选项
        if (this.cachedNextOptions) {
            console.log('📋 显示缓存的下一轮选项');
            this.updateAIBubble(this.cachedNextOptions);
            this.cachedNextOptions = null; // 清空缓存
        } else {
            console.log('⚠️ 没有缓存的选项，重新获取AI建议');
            // 检查是否有位置信息
            if (this.userLocation) {
                // 重新获取当前位置的POI和AI建议
                this.analyzeLocationWithDify();
            } else {
                // 如果没有位置信息，重新获取位置
                this.getUserLocation();
            }
        }
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
        // AI气泡将在获取到位置信息并分析后自动显示
        // 不再使用硬编码的延时显示
        console.log('🤖 AI问答系统已准备就绪，等待位置信息...');
    }

    showAIBubble() {
        const bubble = document.getElementById('ai-chat-bubble');
        bubble.classList.add('show');
        
        // 显示加载状态
        this.showLoadingInBubble();
    }

    hideAIBubble() {
        document.getElementById('ai-chat-bubble').classList.remove('show');
    }

    selectOption(option, action) {
        console.log('✅ 用户选择:', option, action);

        // 更新AI气泡显示选择结果和下一步动作
        this.updateAIBubbleWithSelection(option, action);

        // 后台获取下一轮选项，但不立即显示
        this.getNextOptionsFromDify(option, action, false);

        // 执行相应的动作
        this.handleUserChoice(option, action);
    }

    updateAIBubbleWithSelection(selectedOption, nextAction) {
        // 隐藏AI对话气泡
        this.hideAIBubble();
        
        // 创建或更新常驻指令信息区域
        this.createPersistentInstructionArea(selectedOption, nextAction);
        
        // 在页面底部显示已完成按钮
        this.createBottomCompleteButton();
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
    }

    createBottomCompleteButton() {
        // 检查是否已存在底部按钮
        let bottomButton = document.getElementById('bottom-complete-button');

        if (!bottomButton) {
            // 创建底部完成按钮
            bottomButton = document.createElement('div');
            bottomButton.id = 'bottom-complete-button';
            bottomButton.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 1001;
                display: none;
                animation: slideUp 0.4s ease-out;
            `;

            document.body.appendChild(bottomButton);
        }

        // 更新按钮内容
        bottomButton.innerHTML = `
            <button onclick="navigationApp.markStepAsCompleted()" style="
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                color: white;
                border: none;
                padding: 16px 32px;
                border-radius: 16px;
                font-weight: 600;
                font-size: 16px;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
                display: flex;
                align-items: center;
                gap: 8px;
            ">
                ✅ 已完成
            </button>
        `;

        // 显示按钮
        bottomButton.style.display = 'block';
    }

    hidePersistentInstruction() {
        const instructionArea = document.getElementById('persistent-instruction');
        if (instructionArea) {
            instructionArea.style.display = 'none';
        }

        // 隐藏底部完成按钮
        const bottomButton = document.getElementById('bottom-complete-button');
        if (bottomButton) {
            bottomButton.style.display = 'none';
        }
    }

    handleUserChoice(option, action) {
        console.log('🎯 用户选择已记录:', option, action);
        // 所有处理逻辑已在selectOption方法中通过Dify API完成
        // 这里不需要额外的硬编码处理
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