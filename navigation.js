// 导航系统类
class NavigationSystem {
    constructor() {
        this.map = null;
        this.routeData = null;
        this.currentStepIndex = 0;
        this.isNavigating = false;
        this.isPaused = false;
        this.userLocation = null;
        this.voiceEnabled = true;
        this.startTime = null;
        this.totalDistance = 0;
        this.walkedDistance = 0;

        this.markers = [];
        this.polylines = [];

        this.init();
    }

    async init() {
        console.log('🧭 初始化导航系统...');

        try {
            // 加载路线数据
            await this.loadRouteData();

            // 初始化地图
            this.initMap();

            // 绑定事件
            // this.bindEvents();

            // 开始定位
            // this.startLocationTracking();

            console.log('✅ 导航系统初始化完成');
        } catch (error) {
            console.error('❌ 导航系统初始化失败:', error);
            this.showError('导航系统初始化失败: ' + error.message);
        }
    }

    async loadRouteData() {
        try {
            console.log('📄 加载路线数据...');

            // 首先尝试从localStorage加载路线数据
            const localRouteData = localStorage.getItem('current_route_data');

            if (localRouteData && localRouteData !== 'null') {
                try {
                    this.routeData = JSON.parse(localRouteData);
                    console.log('✅ 从localStorage加载路线数据成功:', this.routeData);
                } catch (parseError) {
                    console.warn('⚠️ localStorage中的路线数据格式错误，尝试加载默认文件');
                    throw new Error('本地路线数据格式错误');
                }
            } else {
                console.log('📁 localStorage中没有路线数据，尝试加载默认文件...');
                // 如果localStorage中没有数据，尝试加载默认文件
                const response = await fetch('./current_route_data.json');
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: 无法加载路线数据`);
                }

                this.routeData = await response.json();
                console.log('✅ 从文件加载路线数据成功:', this.routeData);
            }

            // 计算总距离
            this.totalDistance = this.routeData.route_summary?.total_distance_meters || 0;

            // 初始化UI
            this.updateRouteOverview();

        } catch (error) {
            console.error('❌ 加载路线数据失败:', error);
            throw new Error('无法加载路线数据，请确保文件存在');
        }
    }

    initMap() {
        console.log('🗺️ 初始化导航地图...');

        // 创建地图实例
        this.map = new AMap.Map('navigation-map', {
            zoom: 16,
            mapStyle: 'amap://styles/darkblue',
            features: ['bg', 'road', 'building', 'point'],
            viewMode: '3D'
        });

        // 设置地图中心为起点
        if (this.routeData?.markers_detail?.start_point) {
            const startPoint = this.routeData.markers_detail.start_point;
            this.map.setCenter([startPoint.coordinates.longitude, startPoint.coordinates.latitude]);
        }

        // 绘制路线
        this.drawRoute();

        console.log('✅ 导航地图初始化完成');
    }

    drawRoute() {
        console.log('🎨 绘制导航路线...');

        // 清除现有标记和路线
        this.clearMapElements();

        if (!this.routeData?.path_details?.real_path_coordinates) {
            console.warn('⚠️ 没有找到路径坐标数据');
            return;
        }

        // 绘制路径
        const coordinates = this.routeData.path_details.real_path_coordinates.coordinates;
        if (coordinates && coordinates.length > 0) {
            const polyline = new AMap.Polyline({
                path: coordinates,
                strokeColor: '#28a745',
                strokeWeight: 6,
                strokeOpacity: 0.8,
                strokeStyle: 'solid',
                lineJoin: 'round',
                lineCap: 'round'
            });

            this.map.add(polyline);
            this.polylines.push(polyline);
        }

        // 添加标记点
        this.addMarkers();

        // 自适应显示
        this.fitMapToRoute();
    }

    addMarkers() {
        const markers = this.routeData.markers_detail;

        // 起点标记
        if (markers.start_point) {
            const longitude = markers.start_point.coordinates.longitude;
            const latitude = markers.start_point.coordinates.latitude;

            if (isNaN(longitude) || isNaN(latitude)) {
                console.error('❌ 无效的起点坐标:', longitude, latitude);
            } else {
                const startMarker = new AMap.Marker({
                    position: [longitude, latitude],
                    icon: this.createMarkerIcon('start'),
                    title: markers.start_point.name,
                    offset: new AMap.Pixel(-12, -24)
                });

                this.map.add(startMarker);
                this.markers.push(startMarker);
            }
        }

        // 途经点标记
        if (markers.waypoints) {
            markers.waypoints.forEach((waypoint, index) => {
                const longitude = waypoint.coordinates.longitude;
                const latitude = waypoint.coordinates.latitude;

                if (isNaN(longitude) || isNaN(latitude)) {
                    console.error(`❌ 无效的途经点坐标 (索引 ${index + 1}):`, longitude, latitude);
                } else {
                    const waypointMarker = new AMap.Marker({
                        position: [longitude, latitude],
                        icon: this.createMarkerIcon('waypoint', index + 1),
                        title: waypoint.name,
                        offset: new AMap.Pixel(-12, -24)
                    });

                    this.map.add(waypointMarker);
                    this.markers.push(waypointMarker);
                }
            });
        }

        // 终点标记
        if (markers.end_point) {
            const longitude = markers.end_point.coordinates.longitude;
            const latitude = markers.end_point.coordinates.latitude;

            if (isNaN(longitude) || isNaN(latitude)) {
                console.error('❌ 无效的终点坐标:', longitude, latitude);
            } else {
                const endMarker = new AMap.Marker({
                    position: [longitude, latitude],
                    icon: this.createMarkerIcon('end'),
                    title: markers.end_point.name,
                    offset: new AMap.Pixel(-12, -24)
                });

                this.map.add(endMarker);
                this.markers.push(endMarker);
            }
        }
    }

    createMarkerIcon(type, number = null) {
        const size = type === 'waypoint' ? 30 : 36;
        let color, content;

        switch (type) {
            case 'start':
                color = '#28a745';
                content = '🏁';
                break;
            case 'end':
                color = '#dc3545';
                content = '🎯';
                break;
            case 'waypoint':
                color = '#17a2b8';
                content = number || '●';
                break;
            case 'user':
                color = '#007bff';
                content = '📍';
                break;
            default:
                color = '#6c757d';
                content = '●';
        }

        const svgIcon = `
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
                <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="${color}" stroke="white" stroke-width="2"/>
                <text x="${size/2}" y="${size/2 + 4}" text-anchor="middle" font-family="Arial" font-size="12" fill="white" font-weight="bold">
                    ${typeof content === 'number' ? content : ''}
                </text>
            </svg>
        `;

        return new AMap.Icon({
            image: 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgIcon))),
            size: new AMap.Size(size, size),
            imageSize: new AMap.Size(size, size)
        });
    }

    fitMapToRoute() {
        if (this.polylines.length > 0) {
            const bounds = this.polylines[0].getBounds();
            this.map.setBounds(bounds, false, [50, 50, 50, 250]);
        }
    }

    clearMapElements() {
        // 清除标记
        this.markers.forEach(marker => this.map.remove(marker));
        this.markers = [];

        // 清除路线
        this.polylines.forEach(polyline => this.map.remove(polyline));
        this.polylines = [];
    }

    bindEvents() {
        // 返回按钮
        document.getElementById('back-btn').addEventListener('click', () => {
            this.goBack();
        });

        // 暂停/继续按钮
        document.getElementById('pause-btn').addEventListener('click', () => {
            this.togglePause();
        });

        // 语音控制按钮
        document.getElementById('voice-btn').addEventListener('click', () => {
            this.toggleVoice();
        });

        // 定位按钮
        document.getElementById('location-btn').addEventListener('click', () => {
            this.centerToUser();
        });

        // 最小化按钮
        document.getElementById('minimize-btn').addEventListener('click', () => {
            this.toggleCard();
        });
    }

    startLocationTracking() {
        console.log('📍 开始位置追踪...');

        if (!navigator.geolocation) {
            console.warn('⚠️ 浏览器不支持定位功能');
            this.showMessage('浏览器不支持定位功能', 'warning');
            return;
        }

        const options = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        };

        // 获取初始位置
        navigator.geolocation.getCurrentPosition(
            (position) => {
                this.handleLocationUpdate(position);
                this.startNavigation();
            },
            (error) => {
                console.error('❌ 获取位置失败:', error);
                this.showMessage('无法获取位置信息，导航功能受限', 'error');
            },
            options
        );

        // 持续监听位置变化
        this.watchId = navigator.geolocation.watchPosition(
            (position) => this.handleLocationUpdate(position),
            (error) => console.warn('位置更新失败:', error),
            options
        );
    }

    handleLocationUpdate(position) {
        const { longitude, latitude, accuracy } = position.coords;

        this.userLocation = {
            longitude,
            latitude,
            accuracy,
            timestamp: Date.now()
        };

        console.log('📍 位置更新:', this.userLocation);

        // 更新用户位置标记
        this.updateUserMarker();

        // 检查导航状态
        if (this.isNavigating && !this.isPaused) {
            this.checkNavigationProgress();
        }
    }

    updateUserMarker() {
        // 移除旧的用户位置标记
        if (this.userMarker) {
            this.map.remove(this.userMarker);
        }

        // 添加新的用户位置标记
        this.userMarker = new AMap.Marker({
            position: [this.userLocation.longitude, this.userLocation.latitude],
            icon: this.createMarkerIcon('user'),
            title: '我的位置',
            offset: new AMap.Pixel(-18, -18),
            zIndex: 1000
        });

        this.map.add(this.userMarker);

        // 添加精度圆圈
        if (this.accuracyCircle) {
            this.map.remove(this.accuracyCircle);
        }

        this.accuracyCircle = new AMap.Circle({
            center: [this.userLocation.longitude, this.userLocation.latitude],
            radius: this.userLocation.accuracy,
            fillColor: '#007bff',
            fillOpacity: 0.1,
            strokeColor: '#007bff',
            strokeOpacity: 0.3,
            strokeWeight: 1
        });

        this.map.add(this.accuracyCircle);
    }

    startNavigation() {
        console.log('🚀 开始导航...');

        this.isNavigating = true;
        this.isPaused = false;
        this.startTime = Date.now();
        this.currentStepIndex = 0;

        // 更新UI
        this.updateNavigationUI();

        // 语音提示
        this.speak('导航开始，请按照指示前进');

        console.log('✅ 导航已启动');
    }

    checkNavigationProgress() {
        if (!this.userLocation || !this.routeData?.navigation_details?.step_by_step_navigation) {
            return;
        }

        const steps = this.routeData.navigation_details.step_by_step_navigation;
        const currentStep = steps[this.currentStepIndex];

        if (!currentStep) {
            this.completeNavigation();
            return;
        }

        // 计算到当前步骤目标点的距离
        const distance = this.calculateDistance(
            this.userLocation.longitude,
            this.userLocation.latitude,
            currentStep.coordinates[0],
            currentStep.coordinates[1]
        );

        console.log(`📏 到第${this.currentStepIndex + 1}步的距离: ${distance.toFixed(0)}米`);

        // 如果接近目标点（30米内），进入下一步
        if (distance < 30) {
            this.nextStep();
        }

        // 更新UI
        this.updateNavigationUI();
    }

    nextStep() {
        const steps = this.routeData.navigation_details.step_by_step_navigation;

        if (this.currentStepIndex < steps.length - 1) {
            this.currentStepIndex++;
            const nextStep = steps[this.currentStepIndex];

            console.log(`➡️ 进入第${this.currentStepIndex + 1}步:`, nextStep.instruction);

            // 语音播报
            this.speak(nextStep.instruction);

            // 更新UI
            this.updateNavigationUI();
        } else {
            this.completeNavigation();
        }
    }

    completeNavigation() {
        console.log('🎉 导航完成！');

        this.isNavigating = false;

        // 语音提示
        this.speak('恭喜您，已到达目的地！');

        // 更新UI
        document.getElementById('step-instruction').textContent = '🎉 恭喜到达目的地！';
        document.getElementById('step-distance').textContent = '导航完成';
        document.getElementById('step-remaining').textContent = '感谢使用智能导航';

        // 显示完成信息
        this.showMessage('导航完成！感谢使用智能散步导航', 'success');
    }

    updateNavigationUI() {
        if (!this.routeData?.navigation_details?.step_by_step_navigation) {
            return;
        }

        const steps = this.routeData.navigation_details.step_by_step_navigation;
        const currentStep = steps[this.currentStepIndex];

        if (!currentStep) {
            return;
        }

        // 更新当前步骤信息
        document.getElementById('step-instruction').textContent = currentStep.instruction;

        // 计算距离信息
        if (this.userLocation) {
            const distanceToStep = this.calculateDistance(
                this.userLocation.longitude,
                this.userLocation.latitude,
                currentStep.coordinates[0],
                currentStep.coordinates[1]
            );

            document.getElementById('step-distance').textContent = `距离: ${distanceToStep.toFixed(0)}米`;
        }

        // 更新进度信息
        this.updateProgressInfo();

        // 更新路点状态
        this.updateWaypointStatus();
    }

    updateProgressInfo() {
        if (!this.startTime) return;

        const elapsedTime = Date.now() - this.startTime;
        const elapsedMinutes = Math.floor(elapsedTime / 60000);
        const elapsedSeconds = Math.floor((elapsedTime % 60000) / 1000);

        // 估算已行走距离（简化计算）
        const totalSteps = this.routeData.navigation_details.step_by_step_navigation.length;
        const progressRatio = (this.currentStepIndex + 1) / totalSteps;
        this.walkedDistance = this.totalDistance * progressRatio;

        // 更新UI
        document.getElementById('progress-distance').textContent = `${(this.walkedDistance / 1000).toFixed(1)}km`;
        document.getElementById('progress-time').textContent = `${elapsedMinutes}:${elapsedSeconds.toString().padStart(2, '0')}`;
        document.getElementById('remaining-distance').textContent = `${((this.totalDistance - this.walkedDistance) / 1000).toFixed(1)}km`;
    }

    updateRouteOverview() {
        const waypointsList = document.getElementById('waypoints-list');
        waypointsList.innerHTML = '';

        const markers = this.routeData.markers_detail;

        // 起点
        if (markers.start_point) {
            const startItem = this.createWaypointItem(markers.start_point.name, 'start', 0);
            waypointsList.appendChild(startItem);
        }

        // 途经点
        if (markers.waypoints) {
            markers.waypoints.forEach((waypoint, index) => {
                const waypointItem = this.createWaypointItem(waypoint.name, 'middle', index + 1);
                waypointsList.appendChild(waypointItem);
            });
        }

        // 终点
        if (markers.end_point) {
            const endItem = this.createWaypointItem(markers.end_point.name, 'end', -1);
            waypointsList.appendChild(endItem);
        }
    }

    createWaypointItem(name, type, index) {
        const item = document.createElement('div');
        item.className = 'waypoint-item';

        const icon = document.createElement('div');
        icon.className = `waypoint-icon waypoint-${type}`;

        if (type === 'start') {
            icon.textContent = '起';
        } else if (type === 'end') {
            icon.textContent = '终';
        } else {
            icon.textContent = index.toString();
        }

        const nameElement = document.createElement('div');
        nameElement.className = 'waypoint-name';
        nameElement.textContent = name;

        item.appendChild(icon);
        item.appendChild(nameElement);

        return item;
    }

    updateWaypointStatus() {
        const waypointItems = document.querySelectorAll('.waypoint-item');
        const steps = this.routeData.navigation_details.step_by_step_navigation;
        const currentStep = steps[this.currentStepIndex];

        waypointItems.forEach((item, index) => {
            item.classList.remove('current', 'completed');

            if (index < this.currentStepIndex) {
                item.classList.add('completed');
            } else if (index === this.currentStepIndex) {
                item.classList.add('current');
            }
        });
    }

    // 工具方法
    calculateDistance(lng1, lat1, lng2, lat2) {
        const R = 6371000; // 地球半径（米）
        const lat1Rad = lat1 * Math.PI / 180;
        const lat2Rad = lat2 * Math.PI / 180;
        const deltaLatRad = (lat2 - lat1) * Math.PI / 180;
        const deltaLngRad = (lng2 - lng1) * Math.PI / 180;

        const a = Math.sin(deltaLatRad/2) * Math.sin(deltaLatRad/2) +
                Math.cos(lat1Rad) * Math.cos(lat2Rad) *
                Math.sin(deltaLngRad/2) * Math.sin(deltaLngRad/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c;
    }

    speak(text) {
        if (!this.voiceEnabled || !('speechSynthesis' in window)) {
            return;
        }

        // 显示语音指示器
        const indicator = document.getElementById('voice-indicator');
        const voiceText = document.getElementById('voice-text');
        voiceText.textContent = text;
        indicator.classList.add('show');

        setTimeout(() => {
            indicator.classList.remove('show');
        }, 3000);

        // 语音播报
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = 0.9;
        utterance.pitch = 1;
        speechSynthesis.speak(utterance);
    }

    // 控制方法
    togglePause() {
        this.isPaused = !this.isPaused;
        const pauseBtn = document.getElementById('pause-btn');

        if (this.isPaused) {
            pauseBtn.innerHTML = '<i class="fas fa-play"></i> 继续';
        } else {
            pauseBtn.innerHTML = '<i class="fas fa-pause"></i> 暂停';
        }

        console.log(this.isPaused ? '⏸️ 导航已暂停' : '▶️ 导航已继续');
    }

    toggleVoice() {
        this.voiceEnabled = !this.voiceEnabled;
        const voiceBtn = document.getElementById('voice-btn');

        if (this.voiceEnabled) {
            voiceBtn.classList.remove('active');
            voiceBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
        } else {
            voiceBtn.classList.add('active');
            voiceBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
        }

        console.log(this.voiceEnabled ? '🔊 语音播报已开启' : '🔇 语音播报已关闭');
    }

    centerToUser() {
        if (this.userLocation) {
            this.map.setCenter([this.userLocation.longitude, this.userLocation.latitude]);
            this.map.setZoom(18);
        } else {
            this.showMessage('无法获取当前位置', 'warning');
        }
    }

    toggleCard() {
        const card = document.getElementById('nav-card');
        const minimizeBtn = document.getElementById('minimize-btn');

        card.classList.toggle('hidden');

        if (card.classList.contains('hidden')) {
            minimizeBtn.innerHTML = '<i class="fas fa-chevron-up"></i>';
        } else {
            minimizeBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
        }
    }

    goBack() {
        if (confirm('确定要退出导航吗？')) {
            // 停止位置监听
            if (this.watchId) {
                navigator.geolocation.clearWatch(this.watchId);
            }

            // 返回主页面
            window.location.href = './index.html';
        }
    }

    showMessage(message, type = 'info') {
        const colors = {
            success: '#28a745',
            error: '#dc3545',
            warning: '#ffc107',
            info: '#17a2b8'
        };

        const messageDiv = document.createElement('div');
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${colors[type] || colors.info};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-weight: 500;
            z-index: 2000;
            animation: slideInFromTop 0.3s ease-out;
        `;
        messageDiv.textContent = message;

        document.body.appendChild(messageDiv);

        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 3000);
    }

    showError(message) {
        this.showMessage(message, 'error');
    }
}

// 页面加载完成后初始化导航系统
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 开始初始化导航页面...');

    // 检查地图API是否已加载
    if (typeof AMap === 'undefined') {
        console.error('❌ 高德地图API未加载');
        alert('地图服务加载失败，请刷新页面重试');
        return;
    }

    // 初始化导航系统
    window.navigationSystem = new NavigationSystem();
});