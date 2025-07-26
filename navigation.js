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

        // 设置随机AI头像
        this.setRandomAIAvatar();

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
                        request_type: 'initial_analysis'
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
            this.showMessage('AI分析服务暂时不可用，请稍后重试', 'error');
            // 隐藏AI气泡，不显示硬编码内容
            this.hideAIBubble();
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
        this.showLoadingInBubble();
        this.analyzeLocationWithDify();
    }

    markStepAsCompleted() {
        console.log('✅ 用户标记步骤为已完成');

        // 隐藏常驻指令和已完成按钮
        this.hidePersistentInstruction();

        // 显示AI气泡
        this.showAIBubble();

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
        const questionCard = document.getElementById('ai-question-card');
        const optionsCard = document.getElementById('ai-options-card');
        
        questionCard.classList.add('show');
        optionsCard.classList.add('show');

        // 显示加载状态
        this.showLoadingInBubble();
    }

    hideAIBubble() {
        const questionCard = document.getElementById('ai-question-card');
        const optionsCard = document.getElementById('ai-options-card');
        
        questionCard.classList.remove('show');
        optionsCard.classList.remove('show');
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
        // 创建或更新常驻指令信息区域
        this.createPersistentInstructionArea(selectedOption, nextAction);

        // 隐藏AI卡片
        this.hideAIBubble();

        // 创建已完成按钮区域
        this.createCompletionButton();
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

    createCompletionButton() {
        // 检查是否已存在已完成按钮
        let completionButton = document.getElementById('completion-button');

        if (!completionButton) {
            // 创建已完成按钮
            completionButton = document.createElement('div');
            completionButton.id = 'completion-button';
            completionButton.style.cssText = `
                position: fixed;
                bottom: 80px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 1001;
                display: none;
            `;

            document.body.appendChild(completionButton);
        }

        // 更新按钮内容
        completionButton.innerHTML = `
            <button onclick="navigationApp.markStepAsCompleted()" style="
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                color: white;
                border: none;
                padding: 14px 28px;
                border-radius: 25px;
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
        completionButton.style.display = 'block';
    }

    hidePersistentInstruction() {
        const instructionArea = document.getElementById('persistent-instruction');
        if (instructionArea) {
            instructionArea.style.display = 'none';
        }

        const completionButton = document.getElementById('completion-button');
        if (completionButton) {
            completionButton.style.display = 'none';
        }
    }

    handleUserChoice(option, action) {
        console.log('🎯 用户选择已记录:', option, action);
        // 所有处理逻辑已在selectOption方法中通过Dify API完成
        // 这里不需要额外的硬编码处理
    }

    updateLocationDisplay(customText = null) {
        const locationText = document.getElementById('location-text');
        
        // 如果底部控制栏已被移除，不进行位置显示更新
        if (!locationText) {
            console.log('📍 位置显示元素不存在，跳过更新');
            return;
        }

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

    setRandomAIAvatar() {
        const svgIcons = [
            `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 42 42" fill="none">
              <path d="M21 0.6875C16.9826 0.6875 13.0554 1.87881 9.71499 4.11077C6.37462 6.34274 3.77111 9.51512 2.23371 13.2267C0.696301 16.9384 0.294046 21.0225 1.07781 24.9628C1.86157 28.903 3.79615 32.5224 6.6369 35.3631C9.47766 38.2039 13.097 40.1384 17.0372 40.9222C20.9775 41.706 25.0616 41.3037 28.7733 39.7663C32.4849 38.2289 35.6573 35.6254 37.8892 32.285C40.1212 28.9446 41.3125 25.0174 41.3125 21C41.3068 15.6145 39.1649 10.4513 35.3568 6.64317C31.5487 2.83507 26.3855 0.693187 21 0.6875ZM8.16602 32.4199L8.65821 32.0977C9.088 31.8142 9.44109 31.4289 9.68608 30.976C9.93107 30.5232 10.0604 30.0168 10.0625 29.502L10.1035 22.4258L14.1973 16.3125C14.2173 16.3279 14.2382 16.3423 14.2598 16.3555L18.1016 18.8691C18.7454 19.3235 19.5376 19.5169 20.3184 19.4102L26.4688 18.5762C27.2272 18.475 27.9222 18.099 28.4219 17.5195L32.752 12.4883C33.2362 11.9209 33.5015 11.199 33.5 10.4531V9.2168C35.6134 11.4527 37.0869 14.2157 37.7662 17.2164C38.4455 20.2171 38.3057 23.3453 37.3613 26.2734L34.209 23.3906C33.7708 22.9884 33.2268 22.7195 32.6411 22.6158C32.0553 22.512 31.4521 22.5775 30.9024 22.8047L24.9531 25.2754C24.4557 25.4842 24.0204 25.8176 23.6893 26.2435C23.3581 26.6694 23.1423 27.1735 23.0625 27.707L22.5957 30.8691C22.4835 31.6302 22.656 32.406 23.0802 33.0478C23.5044 33.6897 24.1504 34.1525 24.8945 34.3477L29.0859 35.4531L29.5469 35.916C26.1242 37.8798 22.1295 38.6043 18.2352 37.9675C14.3409 37.3307 10.7849 35.3716 8.16602 32.4199Z" fill="#8BCA4E"/>
            </svg>`,
            `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 42 42" fill="none">
              <path d="M28.8126 17.875C28.8126 20.0382 28.1711 22.1529 26.9693 23.9516C25.7674 25.7502 24.0592 27.1521 22.0607 27.9799C20.0621 28.8078 17.8629 29.0244 15.7413 28.6024C13.6196 28.1803 11.6707 27.1386 10.1411 25.609C8.61144 24.0794 7.56975 22.1305 7.14772 20.0088C6.72569 17.8871 6.94229 15.688 7.77013 13.6894C8.59796 11.6908 9.99985 9.98264 11.7985 8.78082C13.5972 7.57899 15.7118 6.93751 17.8751 6.93751C20.7759 6.93751 23.5579 8.08986 25.609 10.141C27.6602 12.1922 28.8126 14.9742 28.8126 17.875ZM40.8555 40.8555C40.7104 41.0008 40.5381 41.116 40.3484 41.1946C40.1587 41.2733 39.9554 41.3137 39.7501 41.3137C39.5447 41.3137 39.3414 41.2733 39.1517 41.1946C38.962 41.116 38.7897 41.0008 38.6446 40.8555L28.8672 31.0762C25.4671 33.9049 21.1073 35.3139 16.6947 35.0102C12.2822 34.7065 8.15654 32.7134 5.17602 29.4454C2.19549 26.1775 0.589513 21.8863 0.692132 17.4645C0.79475 13.0427 2.59807 8.83067 5.72698 5.70452C8.85589 2.57837 13.0695 0.778777 17.4914 0.680067C21.9133 0.581356 26.2031 2.19113 29.4684 5.17454C32.7337 8.15795 34.7231 12.2853 35.023 16.6981C35.3228 21.111 33.9099 25.4695 31.0782 28.8672L40.8555 38.6445C41.0008 38.7897 41.1161 38.962 41.1947 39.1517C41.2733 39.3414 41.3138 39.5447 41.3138 39.75C41.3138 39.9554 41.2733 40.1587 41.1947 40.3484C41.1161 40.538 41.0008 40.7104 40.8555 40.8555ZM17.8751 31.9375C20.6564 31.9375 23.3752 31.1128 25.6878 29.5676C28.0003 28.0223 29.8028 25.8261 30.8671 23.2565C31.9315 20.6869 32.21 17.8594 31.6674 15.1316C31.1247 12.4037 29.7854 9.898 27.8187 7.93132C25.8521 5.96465 23.3464 4.62533 20.6185 4.08272C17.8907 3.54012 15.0632 3.8186 12.4936 4.88296C9.92399 5.94732 7.72773 7.74974 6.18252 10.0623C4.63731 12.3749 3.81256 15.0937 3.81256 17.875C3.8167 21.6034 5.2996 25.1778 7.93594 27.8141C10.5723 30.4505 14.1467 31.9334 17.8751 31.9375Z" fill="#8BCA4E"/>
            </svg>`,
            `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 50 50" fill="none">
              <path d="M47.2168 10.0234C46.8381 9.73017 46.3965 9.52873 45.9268 9.43486C45.4572 9.341 44.9721 9.35725 44.5098 9.48236L43.8301 9.66595C40.1582 10.6562 33.3223 12.4999 25 12.4999C16.6777 12.4999 9.8418 10.6562 6.16992 9.66595L5.49023 9.48236C5.0277 9.35942 4.54312 9.34436 4.07385 9.43834C3.60457 9.53232 3.16316 9.73283 2.78364 10.0244C2.40413 10.316 2.09665 10.6908 1.88493 11.12C1.6732 11.5492 1.56289 12.0213 1.5625 12.4999V37.4999C1.5625 38.3287 1.89174 39.1236 2.47779 39.7096C3.06384 40.2957 3.8587 40.6249 4.6875 40.6249C4.96315 40.6248 5.2376 40.5887 5.50391 40.5175L6.125 40.3495C9.79102 39.3534 16.6348 37.4999 25 37.4999C33.3652 37.4999 40.209 39.3534 43.8848 40.3495L44.5059 40.5175C44.9686 40.6412 45.4537 40.6568 45.9234 40.5631C46.3932 40.4695 46.8352 40.2691 47.2152 39.9774C47.5952 39.6858 47.903 39.3107 48.115 38.8811C48.3269 38.4515 48.4373 37.979 48.4375 37.4999V12.4999C48.4388 12.021 48.3293 11.5482 48.1175 11.1185C47.9058 10.6889 47.5975 10.3141 47.2168 10.0234Z" fill="#8BCA4E"/>
            </svg>`,
            `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 36 44" fill="none">
              <path d="M27.3753 42.3126C27.3753 42.727 27.2106 43.1244 26.9176 43.4175C26.6246 43.7105 26.2272 43.8751 25.8128 43.8751H10.1878C9.77335 43.8751 9.37593 43.7105 9.0829 43.4175C8.78988 43.1244 8.62526 42.727 8.62526 42.3126C8.62526 41.8982 8.78988 41.5008 9.0829 41.2078C9.37593 40.9147 9.77335 40.7501 10.1878 40.7501H25.8128C26.2272 40.7501 26.6246 40.9147 26.9176 41.2078C27.2106 41.5008 27.3753 41.8982 27.3753 42.3126ZM35.1878 17.3126C35.1945 19.9174 34.6061 22.4893 33.4674 24.832C32.3287 27.1747 30.6698 29.2263 28.6174 30.8302C28.2337 31.1243 27.9223 31.5023 27.707 31.9353C27.4917 32.3683 27.3782 32.8447 27.3753 33.3282V34.5001C27.3753 35.3289 27.046 36.1238 26.46 36.7098C25.8739 37.2959 25.0791 37.6251 24.2503 37.6251H11.7503C10.9215 37.6251 10.1266 37.2959 9.54055 36.7098C8.9545 36.1238 8.62526 35.3289 8.62526 34.5001V33.3282C8.62494 32.8505 8.51508 32.3792 8.30414 31.9505C8.0932 31.5219 7.78679 31.1473 7.40846 30.8556C5.36119 29.2611 3.70347 27.2219 2.56076 24.8921C1.41805 22.5624 0.8203 20.0032 0.812756 17.4083C0.761974 8.09972 8.28541 0.347762 17.5862 0.125106C19.8779 0.0698806 22.1575 0.473647 24.2908 1.31264C26.4241 2.15163 28.368 3.4089 30.0082 5.01044C31.6483 6.61198 32.9515 8.52543 33.841 10.6382C34.7305 12.7509 35.1884 15.0202 35.1878 17.3126ZM28.9163 15.4884C28.5111 13.2253 27.4223 11.1407 25.7964 9.51514C24.1706 7.88962 22.0857 6.80127 19.8225 6.39659C19.6202 6.36248 19.413 6.36856 19.213 6.41449C19.013 6.46041 18.824 6.54529 18.6568 6.66426C18.4896 6.78324 18.3474 6.93398 18.2385 7.10789C18.1295 7.2818 18.0559 7.47547 18.0217 7.67784C17.9876 7.88021 17.9937 8.08732 18.0396 8.28733C18.0856 8.48735 18.1704 8.67637 18.2894 8.84359C18.4084 9.01081 18.5591 9.15295 18.733 9.26191C18.907 9.37087 19.1006 9.44451 19.303 9.47862C22.5393 10.0235 25.2854 12.7696 25.8342 16.0118C25.8961 16.3757 26.0847 16.706 26.3668 16.9441C26.6489 17.1822 27.0061 17.3127 27.3753 17.3126C27.4636 17.3121 27.5517 17.3049 27.6389 17.2911C28.0473 17.2214 28.4113 16.9923 28.6509 16.6542C28.8904 16.3162 28.9859 15.8968 28.9163 15.4884Z" fill="#8BCA4E"/>
            </svg>`
        ];

        const randomIndex = Math.floor(Math.random() * svgIcons.length);
        const selectedIcon = svgIcons[randomIndex];
        
        const avatarElement = document.getElementById('ai-avatar');
        if (avatarElement) {
            avatarElement.innerHTML = selectedIcon;
        }
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