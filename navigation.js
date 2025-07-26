
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

            // 添加地图控件
            this.map.addControl(new AMap.Scale());
            this.map.addControl(new AMap.ToolBar({
                position: 'RT'
            }));

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
                throw new Error(`Dify API调用失败: ${response.status}`);
            }

            const result = await response.json();
            console.log('✅ Dify AI分析结果:', result);
            
            if (result.data && result.data.outputs && result.data.outputs.task_output) {
                const taskOutput = JSON.parse(result.data.outputs.task_output);
                this.updateAIBubble(taskOutput);
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
                optionElement.onclick = () => this.selectOption(choice.option, choice.next_action);
                
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
        
        // 显示选择结果
        this.showMessage(`您选择了：${option}`, 'success');
        
        // 隐藏AI气泡
        setTimeout(() => {
            this.hideAIBubble();
        }, 1500);
        
        // 可以在这里添加更多逻辑，比如导航到相关位置
        this.handleUserChoice(option, action);
    }

    handleUserChoice(option, action) {
        // 根据用户选择执行相应的动作
        console.log('🎯 执行用户选择的动作:', action);
        
        // 这里可以添加具体的导航逻辑
        // 比如在地图上标记相关位置，或者跳转到特定功能
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
