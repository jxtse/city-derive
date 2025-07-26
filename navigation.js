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
                zoomEnable: false,
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
                    size: new AMap.Size(53, 62),
                    image: this.createUserLocationIcon(),
                    imageOffset: new AMap.Pixel(-26, -58) // 调整图标位置，使底部尖端对准坐标点
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
            <div style="display: flex; align-items: center; gap: 12px; color: #2E2E2E;">
                <span style="font-size: 18px; font-weight: 600; line-height: 1.4;">正在获取下一步建议...</span>
            </div>
        `;

        optionsContainer.innerHTML = `
            <div style="
                text-align: center; 
                padding: 24px; 
                background: linear-gradient(135deg, #F8F9FA, #E8F5E8);
                border-radius: 16px;
                border: 1px solid rgba(139, 195, 74, 0.2);
            ">
                <div style="
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    color: #8BC34A;
                    font-size: 15px;
                    font-weight: 500;
                ">
                    <div style="
                        width: 6px;
                        height: 6px;
                        background: #8BC34A;
                        border-radius: 50%;
                        animation: pulse 1.5s ease-in-out infinite;
                    "></div>
                    <div style="
                        width: 6px;
                        height: 6px;
                        background: #8BC34A;
                        border-radius: 50%;
                        animation: pulse 1.5s ease-in-out infinite 0.2s;
                    "></div>
                    <div style="
                        width: 6px;
                        height: 6px;
                        background: #8BC34A;
                        border-radius: 50%;
                        animation: pulse 1.5s ease-in-out infinite 0.4s;
                    "></div>
                    <span style="margin-left: 8px;">🤖 AI正在智能分析...</span>
                </div>
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
                max-width: 580px;
                width: calc(100% - 40px);
                background: #F8F9FA;
                border-radius: 24px;
                box-shadow: 0 2px 20px rgba(0, 0, 0, 0.08);
                border: 2px solid #8BC34A;
                z-index: 1001;
                padding: 20px 24px;
                display: none;
                animation: slideDownInstruction 0.4s ease-out;
            `;

            document.body.appendChild(instructionArea);
        }

        // 创建简化的导航图标
        const navigationIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C13.1046 2 14 2.89543 14 4V6.17071C16.1652 6.58254 17.8348 8.25212 18.2471 10.4173L20.4173 10.2471C21.5218 10.1652 22 11.1046 22 12C22 12.8954 21.5218 13.8348 20.4173 13.7529L18.2471 13.5827C17.8348 15.7479 16.1652 17.4175 14 17.8293V20C14 21.1046 13.1046 22 12 22C10.8954 22 10 21.1046 10 20V17.8293C7.83484 17.4175 6.16518 15.7479 5.75289 13.5827L3.58268 13.7529C2.47818 13.8348 2 12.8954 2 12C2 11.1046 2.47818 10.1652 3.58268 10.2471L5.75289 10.4173C6.16518 8.25212 7.83484 6.58254 10 6.17071V4C10 2.89543 10.8954 2 12 2Z" fill="white"/>
        </svg>`;

        // 更新指令内容，按照设计图布局 - 居中对齐
        instructionArea.innerHTML = `
            <div style="text-align: center;">
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 12px;">
                    <div style="width: 32px; height: 32px; background: #8BC34A; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        ${navigationIcon}
                    </div>
                    <div style="font-weight: 600; color: #333; font-size: 18px;">
                        跟随指令
                    </div>
                </div>
                <div style="color: #333; font-size: 16px; line-height: 1.5; text-align: left;">
                    ${nextAction || '正在为您准备相关信息...'}
                </div>
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

        // 创建勾选SVG图标
        const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="23" viewBox="0 0 30 23" fill="none">
            <path d="M28.6177 5.89485L12.453 22.0239C12.0753 22.4005 11.5632 22.6121 11.0292 22.6121C10.4952 22.6121 9.98304 22.4005 9.60532 22.0239L0.588875 12.9796C0.211793 12.6027 0 12.092 0 11.5595C0 11.027 0.211793 10.5162 0.588875 10.1394L3.10673 7.62709C3.48424 7.25199 3.9953 7.04139 4.52806 7.04139C5.06082 7.04139 5.57189 7.25199 5.94939 7.62709L11.0795 12.5914L23.2609 0.586326C23.6385 0.210841 24.1498 0 24.6829 0C25.2159 0 25.7273 0.210841 26.1048 0.586326L28.6164 3.04086C28.8053 3.22762 28.9552 3.44984 29.0576 3.69472C29.16 3.93959 29.2127 4.20227 29.2129 4.46759C29.213 4.73292 29.1604 4.99564 29.0583 5.2406C28.9561 5.48557 28.8064 5.70792 28.6177 5.89485Z" fill="#8BCA4E"/>
        </svg>`;

        // 更新按钮内容
        completionButton.innerHTML = `
            <button onclick="navigationApp.markStepAsCompleted()" style="
                background: white;
                border: none;
                padding: 14px 28px;
                border-radius: 25px;
                font-weight: 600;
                font-size: 16px;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 45px 45px 0 rgba(166, 166, 166, 0.25);
                display: flex;
                align-items: center;
                gap: 8px;
            ">
                ${checkIcon} 已完成
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
        // 使用简化的地球图标
        const earthIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50" fill="none">
  <path d="M25 4.6875C20.9826 4.6875 17.0554 5.87881 13.715 8.11077C10.3746 10.3427 7.77111 13.5151 6.23371 17.2267C4.6963 20.9384 4.29405 25.0225 5.07781 28.9628C5.86157 32.903 7.79615 36.5224 10.6369 39.3631C13.4777 42.2039 17.097 44.1384 21.0372 44.9222C24.9775 45.706 29.0616 45.3037 32.7733 43.7663C36.4849 42.2289 39.6573 39.6254 41.8892 36.285C44.1212 32.9446 45.3125 29.0174 45.3125 25C45.3068 19.6145 43.1649 14.4513 39.3568 10.6432C35.5487 6.83507 30.3855 4.69319 25 4.6875ZM12.166 36.4199L12.6582 36.0977C13.088 35.8142 13.4411 35.4289 13.6861 34.976C13.9311 34.5232 14.0604 34.0168 14.0625 33.502L14.1035 26.4258L18.1973 20.3125C18.2173 20.3279 18.2382 20.3423 18.2598 20.3555L22.1016 22.8691C22.7454 23.3235 23.5376 23.5169 24.3184 23.4102L30.4688 22.5762C31.2272 22.475 31.9222 22.099 32.4219 21.5195L36.752 16.4883C37.2362 15.9209 37.5015 15.199 37.5 14.4531V13.2168C39.6134 15.4527 41.0869 18.2157 41.7662 21.2164C42.4455 24.2171 42.3057 27.3453 41.3613 30.2734L38.209 27.3906C37.7708 26.9884 37.2268 26.7195 36.6411 26.6158C36.0553 26.512 35.4521 26.5775 34.9024 26.8047L28.9531 29.2754C28.4557 29.4842 28.0204 29.8176 27.6893 30.2435C27.3581 30.6694 27.1423 31.1735 27.0625 31.707L26.5957 34.8691C26.4835 35.6302 26.656 36.406 27.0802 37.0478C27.5044 37.6897 28.1504 38.1525 28.8945 38.3477L33.0859 39.4531L33.5469 39.916C30.1242 41.8798 26.1295 42.6043 22.2352 41.9675C18.3409 41.3307 14.7849 39.3716 12.166 36.4199Z" fill="#8BCA4E"/>
</svg>`;
        
        const avatarElement = document.getElementById('ai-avatar');
        if (avatarElement) {
            avatarElement.innerHTML = earthIcon;
        }
    }

    createUserLocationIcon() {
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="53" height="62" viewBox="0 0 106 124" fill="none">
              <g filter="url(#filter0_d_88_768)">
                <path d="M53 20C44.2509 20.0099 35.863 23.4899 29.6764 29.6765C23.4899 35.8631 20.0099 44.2511 20 53.0003C20 81.2381 50 102.565 51.2788 103.457C51.7832 103.81 52.3841 104 53 104C53.6159 104 54.2168 103.81 54.7212 103.457C56 102.565 86 81.2381 86 53.0003C85.9901 44.2511 82.5101 35.8631 76.3236 29.6765C70.137 23.4899 61.7491 20.0099 53 20Z" fill="white"/>
              </g>
              <circle cx="53.5" cy="53.5" r="27.5" fill="#E7E7E7"/>
              <path d="M49.0837 40.3418C49.0837 39.4831 49.3425 38.6436 49.8274 37.9296C50.3124 37.2156 51.0016 36.6591 51.808 36.3305C52.6144 36.0019 53.5017 35.9159 54.3578 36.0834C55.2139 36.251 56.0002 36.6645 56.6174 37.2717C57.2346 37.8789 57.6549 38.6525 57.8252 39.4948C57.9955 40.337 57.9081 41.21 57.5741 42.0034C57.2401 42.7967 56.6744 43.4748 55.9487 43.9519C55.2229 44.429 54.3697 44.6837 53.4968 44.6837C52.3264 44.6837 51.2039 44.2262 50.3763 43.412C49.5486 42.5977 49.0837 41.4933 49.0837 40.3418ZM67.2754 56.5896L60.1434 48.6347C59.7293 48.1727 59.2199 47.8027 58.6493 47.5492C58.0786 47.2958 57.4596 47.1647 56.8335 47.1647H50.1602C49.5341 47.1647 48.9151 47.2958 48.3444 47.5492C47.7738 47.8027 47.2644 48.1727 46.8503 48.6347L39.7183 56.5896C39.2552 57.0557 38.9972 57.6825 39 58.3343C39.0029 58.9862 39.2663 59.6108 39.7335 60.073C40.2007 60.5353 40.834 60.7981 41.4965 60.8046C42.159 60.8112 42.7976 60.5609 43.2741 60.108L47.3499 56.8873L44.245 68.4986C43.9748 69.0952 43.9547 69.7726 44.189 70.3837C44.4233 70.9948 44.8931 71.4904 45.4964 71.7629C46.0998 72.0354 46.788 72.0628 47.4118 71.8393C48.0355 71.6157 48.5446 71.1591 48.8283 70.5687L53.4968 62.6712L58.159 70.5795C58.4428 71.17 58.9518 71.6265 59.5756 71.8501C60.1994 72.0737 60.8876 72.0463 61.491 71.7738C62.0943 71.5012 62.5641 71.0057 62.7984 70.3945C63.0327 69.7834 63.0126 69.106 62.7424 68.5094L59.6438 56.8873L63.7259 60.108C64.2024 60.5609 64.841 60.8112 65.5035 60.8046C66.166 60.7981 66.7993 60.5353 67.2665 60.073C67.7337 59.6108 67.9971 58.9862 68 58.3343C68.0028 57.6825 67.7448 57.0557 67.2817 56.5896H67.2754Z" fill="#303030"/>
              <defs>
                <filter id="filter0_d_88_768" x="0" y="0" width="106" height="124" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                  <feFlood flood-opacity="0" result="BackgroundImageFix"/>
                  <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                  <feOffset/>
                  <feGaussianBlur stdDeviation="10"/>
                  <feComposite in2="hardAlpha" operator="out"/>
                  <feColorMatrix type="matrix" values="0 0 0 0 0.545098 0 0 0 0 0.792157 0 0 0 0 0.305882 0 0 0 1 0"/>
                  <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_88_768"/>
                  <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_88_768" result="shape"/>
                </filter>
              </defs>
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