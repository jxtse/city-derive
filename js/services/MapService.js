
import { CONFIG, ICON_TYPES } from '../utils/constants.js';
import { DOMUtils, GeoUtils } from '../utils/helpers.js';
import { GeolocationService } from '../utils/geolocation.js';

export class MapService {
    constructor() {
        this.map = null;
        this.markers = [];
        this.polyline = null;
        this.currentRoute = null;
        this.geolocationService = new GeolocationService();
        this.userLocationMarker = null;
        this._isRequestingLocation = false; // 防止重复请求定位的标志
    }
    
    // 初始化地图
    async initMap() {
        try {
            console.log('🗺️ 开始初始化地图...');
            
            if (typeof AMap === 'undefined') {
                throw new Error('高德地图API未加载');
            }
            
            const mapContainer = document.getElementById('map');
            if (!mapContainer) {
                throw new Error('地图容器不存在');
            }
            
            // 确保容器占满全屏
            mapContainer.style.width = '100%';
            mapContainer.style.height = '100%';
            
            // 创建地图实例
            this.map = new AMap.Map('map', {
                zoom: CONFIG.MAP_DEFAULTS.ZOOM,
                center: CONFIG.MAP_DEFAULTS.CENTER,
                features: ['bg', "road", "building"], 
                mapStyle: CONFIG.MAP_DEFAULTS.STYLE,
                viewMode: '2D',
                doubleClickZoom: true,
                scrollWheel: true,
                contextMenu: false
            });
            
            // 等待地图加载完成
            this.map.on('complete', () => {
                console.log('✅ 地图加载完成');
                this._addMapControls();
                this._optimizeCanvasPerformance();
                // 自动获取用户位置
                this._requestUserLocation();
            });
            
            this.map.on('error', (error) => {
                console.error('❌ 地图加载失败:', error);
                this._showMapError();
            });
            
            this._setupResizeHandler();
            
        } catch (error) {
            console.error('❌ 地图初始化失败:', error);
            this._showMapError(error.message);
        }
    }
    
    // 更新地图显示路线
    updateRoute(routeResult) {
        if (!this.map) {
            console.error('❌ 地图实例不存在，无法更新路线');
            DOMUtils.showMessage('地图未初始化，请稍后重试', 'error');
            return;
        }
        
        console.log('🗺️ 更新地图路线显示:', routeResult);
        
        try {
            // 验证路线数据完整性
            if (!this._validateRouteData(routeResult)) {
                throw new Error('路线数据格式无效');
            }

            this.clearMap();
            this.currentRoute = routeResult;
            
            const waypoints = this._buildWaypoints(routeResult);
            
            if (waypoints.length === 0) {
                throw new Error('无法构建有效的路径点');
            }

            this._addMarkers(waypoints);
            this._addTemporaryPath(waypoints);
            this._fitMapView();
            
            console.log('✅ 地图路线更新成功');
            DOMUtils.showMessage('地图路线更新成功', 'success');
            
            // 异步获取真实路径
            this._loadRealPaths(waypoints);
            
        } catch (error) {
            console.error('❌ 更新地图显示失败:', error);
            DOMUtils.showMessage(`地图更新失败: ${error.message}`, 'error');
            
            // 尝试恢复到基础显示模式
            this._fallbackRouteDisplay(routeResult);
        }
    }
    
    // 清除地图
    clearMap() {
        this.markers.forEach(marker => {
            if (marker && this.map) {
                this.map.remove(marker);
            }
        });
        this.markers = [];
        
        if (this.polyline && this.map) {
            this.map.remove(this.polyline);
            this.polyline = null;
        }
        
        // 不清除用户位置标记
    }
    
    // 重置地图
    resetMap() {
        this.clearMap();
        if (this.map) {
            this.map.setZoom(CONFIG.MAP_DEFAULTS.ZOOM);
            this.map.setCenter(CONFIG.MAP_DEFAULTS.CENTER);
        }
    }
    
    // 私有方法：验证路线数据
    _validateRouteData(routeResult) {
        try {
            if (!routeResult || !routeResult.route) {
                console.error('❌ 路线结果为空或格式错误');
                return false;
            }

            const route = routeResult.route;
            
            // 验证起点
            if (!route.start_point || !this._isValidPoint(route.start_point)) {
                console.error('❌ 起点数据无效:', route.start_point);
                return false;
            }

            // 验证终点
            if (!route.end_point || !this._isValidPoint(route.end_point)) {
                console.error('❌ 终点数据无效:', route.end_point);
                return false;
            }

            // 验证途经点（如果存在）
            if (route.waypoints) {
                for (let i = 0; i < route.waypoints.length; i++) {
                    if (!this._isValidPoint(route.waypoints[i])) {
                        console.error(`❌ 途经点 ${i} 数据无效:`, route.waypoints[i]);
                        return false;
                    }
                }
            }

            return true;
        } catch (error) {
            console.error('❌ 路线数据验证失败:', error);
            return false;
        }
    }

    // 私有方法：验证点位数据
    _isValidPoint(point) {
        if (!point) return false;
        
        const lng = point.longitude || point.location?.[0];
        const lat = point.latitude || point.location?.[1];
        
        return GeoUtils.isValidCoordinate(lng, lat);
    }

    // 私有方法：备用路线显示
    _fallbackRouteDisplay(routeResult) {
        try {
            console.log('🔄 尝试备用路线显示模式...');
            
            if (!routeResult?.route?.start_point || !routeResult?.route?.end_point) {
                console.error('❌ 无法进行备用显示，缺少基本路线信息');
                return;
            }

            this.clearMap();
            
            // 只显示起点和终点
            const basicWaypoints = [
                {
                    ...routeResult.route.start_point,
                    type: 'start',
                    name: routeResult.route.start_point.formatted_address || routeResult.route.start_point.name || '起点'
                },
                {
                    ...routeResult.route.end_point,
                    type: 'end',
                    name: routeResult.route.end_point.name || routeResult.route.end_point.formatted_address || '终点'
                }
            ];

            // 标准化坐标
            basicWaypoints.forEach(point => {
                if (!point.longitude && point.location?.[0]) {
                    point.longitude = point.location[0];
                    point.latitude = point.location[1];
                }
            });

            const validWaypoints = basicWaypoints.filter(wp => 
                GeoUtils.isValidCoordinate(wp.longitude, wp.latitude)
            );

            if (validWaypoints.length >= 2) {
                this._addMarkers(validWaypoints);
                this._addTemporaryPath(validWaypoints);
                this._fitMapView();
                
                console.log('✅ 备用路线显示成功');
                DOMUtils.showMessage('已显示基础路线（起点-终点）', 'warning');
            } else {
                console.error('❌ 备用显示也失败，坐标数据完全无效');
                DOMUtils.showMessage('路线数据完全无效，无法显示', 'error');
            }
            
        } catch (error) {
            console.error('❌ 备用路线显示失败:', error);
            DOMUtils.showMessage('备用显示模式也失败了', 'error');
        }
    }

    // 私有方法：构建路径点
    _buildWaypoints(routeResult) {
        const waypoints = [];
        
        try {
            // 添加起点
            const startPoint = {
                ...routeResult.route.start_point,
                type: 'start',
                name: routeResult.route.start_point.formatted_address || 
                      routeResult.route.start_point.name || '起点'
            };
            
            // 标准化起点坐标
            if (!startPoint.longitude && startPoint.location?.[0]) {
                startPoint.longitude = startPoint.location[0];
                startPoint.latitude = startPoint.location[1];
            }
            
            waypoints.push(startPoint);
            
            // 添加途经点
            if (routeResult.route.waypoints && Array.isArray(routeResult.route.waypoints)) {
                routeResult.route.waypoints.forEach((waypoint, index) => {
                    const wp = {
                        ...waypoint,
                        type: 'waypoint',
                        longitude: waypoint.location?.[0] || waypoint.longitude,
                        latitude: waypoint.location?.[1] || waypoint.latitude,
                        name: waypoint.name || `途经点${index + 1}`
                    };
                    
                    if (GeoUtils.isValidCoordinate(wp.longitude, wp.latitude)) {
                        waypoints.push(wp);
                    } else {
                        console.warn(`⚠️ 跳过无效途经点 ${index}:`, waypoint);
                    }
                });
            }
            
            // 添加终点
            const endPoint = {
                ...routeResult.route.end_point,
                type: 'end',
                name: routeResult.route.end_point.name || 
                      routeResult.route.end_point.formatted_address || '终点'
            };
            
            // 标准化终点坐标
            if (!endPoint.longitude && endPoint.location?.[0]) {
                endPoint.longitude = endPoint.location[0];
                endPoint.latitude = endPoint.location[1];
            }
            
            waypoints.push(endPoint);
            
            // 过滤有效坐标
            const validWaypoints = waypoints.filter(wp => {
                const isValid = GeoUtils.isValidCoordinate(wp.longitude, wp.latitude);
                if (!isValid) {
                    console.warn('⚠️ 过滤无效路径点:', wp);
                }
                return isValid;
            });
            
            console.log(`✅ 成功构建 ${validWaypoints.length} 个有效路径点`);
            return validWaypoints;
            
        } catch (error) {
            console.error('❌ 构建路径点失败:', error);
            return [];
        }
    }
    
    // 私有方法：添加标记
    _addMarkers(waypoints) {
        waypoints.forEach(waypoint => {
            const iconConfig = ICON_TYPES[waypoint.type.toUpperCase()] || ICON_TYPES.WAYPOINT;
            const iconUrl = DOMUtils.createSVGIcon(waypoint.type, iconConfig.size);
            
            const marker = new AMap.Marker({
                position: new AMap.LngLat(waypoint.longitude, waypoint.latitude),
                icon: new AMap.Icon({
                    size: new AMap.Size(iconConfig.size, iconConfig.size),
                    image: iconUrl
                }),
                title: waypoint.name
            });
            
            // 添加信息窗体
            this._addInfoWindow(marker, waypoint);
            
            this.markers.push(marker);
            this.map.add(marker);
        });
    }
    
    // 私有方法：添加信息窗体
    _addInfoWindow(marker, waypoint) {
        const typeIcons = {
            start: '🏁',
            end: '🎯',
            waypoint: '🚩'
        };
        
        const icon = typeIcons[waypoint.type] || '📍';
        let content = `
            <div style="padding: 10px;">
                <h4 style="margin: 0 0 5px 0; color: #2c3e50;">
                    ${icon} ${waypoint.name}
                </h4>
                <p style="margin: 0; color: #7f8c8d; font-size: 12px;">${waypoint.address || ''}</p>
        `;
        
        if (waypoint.distance) {
            content += `<p style="margin: 5px 0 0 0; color: #9c27b0; font-size: 11px;">距离: ${waypoint.distance}m</p>`;
        }
        
        content += `</div>`;
        
        const infoWindow = new AMap.InfoWindow({
            content: content,
            offset: new AMap.Pixel(0, -ICON_TYPES[waypoint.type.toUpperCase()]?.size || 24)
        });
        
        marker.on('click', () => {
            infoWindow.open(this.map, marker.getPosition());
        });
    }
    
    // 私有方法：添加临时路径
    _addTemporaryPath(waypoints) {
        const path = waypoints.map(wp => [wp.longitude, wp.latitude]);
        
        this.polyline = new AMap.Polyline({
            path: path,
            strokeWeight: 3,
            strokeColor: "#cccccc",
            strokeOpacity: 0.6,
            strokeStyle: 'dashed',
            lineJoin: 'round',
            lineCap: 'round'
        });
        
        this.map.add(this.polyline);
    }
    
    // 私有方法：调整地图视野
    _fitMapView() {
        const allOverlays = [...this.markers];
        if (this.polyline) allOverlays.push(this.polyline);
        
        if (allOverlays.length > 0) {
            this.map.setFitView(allOverlays, false, [30, 30, 30, 30]);
        }
    }
    
    // 私有方法：加载真实路径
    async _loadRealPaths(waypoints) {
        try {
            console.log('🔄 开始获取真实路径...');
            
            const realPaths = await this._getAllRealWalkingPaths(waypoints);
            
            if (realPaths && realPaths.length > 0) {
                this._renderRealPaths(realPaths);
                DOMUtils.showMessage('✅ 真实路径显示成功！', 'success');
            } else {
                DOMUtils.showMessage('⚠️ 使用基础路径显示', 'warning');
            }
            
        } catch (error) {
            console.error('❌ 获取真实路径失败:', error);
            DOMUtils.showMessage('❌ 真实路径获取失败', 'error');
        }
    }
    
    // 私有方法：获取所有真实路径段
    async _getAllRealWalkingPaths(waypoints) {
        const realPaths = [];
        
        for (let i = 0; i < waypoints.length - 1; i++) {
            const startPoint = waypoints[i];
            const endPoint = waypoints[i + 1];
            
            try {
                const result = await this._getRealWalkingPath(startPoint, endPoint);
                
                if (result.success && result.path?.length > 0) {
                    realPaths.push({
                        segment: `${startPoint.name} → ${endPoint.name}`,
                        path: result.path,
                        distance: result.distance,
                        duration: result.duration,
                        steps: result.steps
                    });
                } else {
                    // 使用直线连接作为备选
                    realPaths.push({
                        segment: `${startPoint.name} → ${endPoint.name}`,
                        path: [[startPoint.longitude, startPoint.latitude], [endPoint.longitude, endPoint.latitude]],
                        distance: GeoUtils.calculateDistance(startPoint, endPoint) * 1000,
                        duration: GeoUtils.calculateDistance(startPoint, endPoint) * 1000 / CONFIG.PLANNING.DEFAULT_WALK_SPEED,
                        isFallback: true
                    });
                }
            } catch (error) {
                console.error(`路径段${i + 1}获取失败:`, error);
            }
            
            // 避免API频率限制
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        return realPaths;
    }
    
    // 私有方法：获取单段真实路径
    async _getRealWalkingPath(startPoint, endPoint) {
        try {
            const origin = `${startPoint.longitude},${startPoint.latitude}`;
            const destination = `${endPoint.longitude},${endPoint.latitude}`;
            const url = `${CONFIG.AMAP.BASE_URL}/direction/walking?origin=${origin}&destination=${destination}&key=${CONFIG.AMAP.KEY}`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.status === '1' && data.route?.paths?.length > 0) {
                const path = data.route.paths[0];
                const pathCoordinates = [];
                
                // 解析路径坐标
                if (path.steps?.length > 0) {
                    path.steps.forEach(step => {
                        if (step.polyline) {
                            const stepCoords = GeoUtils.parsePolyline(step.polyline);
                            pathCoordinates.push(...stepCoords);
                        }
                    });
                }
                
                // 如果没有坐标，至少添加起点和终点
                if (pathCoordinates.length === 0) {
                    pathCoordinates.push(
                        [startPoint.longitude, startPoint.latitude],
                        [endPoint.longitude, endPoint.latitude]
                    );
                }
                
                return {
                    success: true,
                    path: pathCoordinates,
                    distance: parseInt(path.distance) || 0,
                    duration: parseInt(path.duration) || 0,
                    steps: path.steps || []
                };
            }
            
            return { success: false, error: data.info || '获取路径失败' };
            
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    // 私有方法：渲染真实路径
    _renderRealPaths(realPaths) {
        // 移除临时路径
        if (this.polyline) {
            this.map.remove(this.polyline);
            this.polyline = null;
        }
        
        // 合并所有真实路径坐标
        const allCoordinates = [];
        let totalDistance = 0;
        let totalDuration = 0;
        
        realPaths.forEach((pathData, index) => {
            if (pathData.path?.length > 0) {
                const pathToAdd = index === 0 ? pathData.path : pathData.path.slice(1);
                allCoordinates.push(...pathToAdd);
                totalDistance += pathData.distance;
                totalDuration += pathData.duration;
            }
        });
        
        if (allCoordinates.length > 0) {
            // 创建真实路径折线
            this.polyline = new AMap.Polyline({
                path: allCoordinates,
                strokeWeight: 5,
                strokeColor: "#28a745",
                strokeOpacity: 0.9,
                lineJoin: 'round',
                lineCap: 'round'
            });
            this.map.add(this.polyline);
            
            // 更新路线信息
            if (this.currentRoute) {
                this.currentRoute.route.real_distance = totalDistance;
                this.currentRoute.route.real_duration = totalDuration;
                this.currentRoute.route.real_paths = realPaths;
            }
        }
    }
    
    // 私有方法：添加地图控件
    _addMapControls() {
        try {
            if (AMap.Scale) {
                const scale = new AMap.Scale({ position: 'LB' });
                this.map.addControl(scale);
            }
            if (AMap.ToolBar) {
                const toolbar = new AMap.ToolBar({ position: 'RT' });
                this.map.addControl(toolbar);
            }
        } catch (error) {
            console.warn('⚠️ 部分地图控件加载失败:', error);
        }
    }
    
    // 私有方法：优化Canvas性能
    _optimizeCanvasPerformance() {
        setTimeout(() => {
            try {
                const mapContainer = document.getElementById('map');
                if (mapContainer) {
                    const canvases = mapContainer.querySelectorAll('canvas');
                    canvases.forEach(canvas => {
                        if (!canvas.hasAttribute('data-optimized')) {
                            canvas.setAttribute('data-optimized', 'true');
                            if (canvas.style) {
                                canvas.style.willReadFrequently = 'true';
                            }
                        }
                    });
                }
            } catch (e) {
                console.log('Canvas优化跳过');
            }
        }, 1000);
    }
    
    // 私有方法：设置窗口大小变化处理
    _setupResizeHandler() {
        window.addEventListener('resize', () => {
            if (this.map && typeof this.map.getSize === 'function') {
                setTimeout(() => {
                    try {
                        this.map.getSize();
                        const container = document.getElementById('map');
                        if (typeof this.map.setSize === 'function') {
                            this.map.setSize(new AMap.Size(container.offsetWidth, container.offsetHeight));
                        }
                    } catch (error) {
                        console.warn('⚠️ 地图大小调整失败:', error);
                    }
                }, 100);
            }
        });
    }
    
    // 私有方法：显示地图错误
    _showMapError(message = '地图加载失败') {
        const mapContainer = document.getElementById('map');
        if (mapContainer) {
            mapContainer.innerHTML = `
                <div style="display: flex; justify-content: center; align-items: center; height: 100%; 
                            background: #f8f9fa; color: #dc3545; font-size: 14px;">
                    <div style="text-align: center;">
                        <div style="margin-bottom: 10px;">⚠️</div>
                        <div>${message}</div>
                        <div style="font-size: 12px; margin-top: 5px;">请检查网络连接</div>
                    </div>
                </div>
            `;
        }
    }

    // 私有方法：请求用户位置
    async _requestUserLocation() {
        // 防止重复请求定位
        if (this._isRequestingLocation) {
            console.log('📍 正在请求定位中，跳过重复请求');
            return;
        }

        try {
            console.log('📍 开始请求用户位置...');
            this._isRequestingLocation = true;
            
            // 检查是否已经获取过位置
            const cachedPosition = this.geolocationService.getCachedPosition();
            if (cachedPosition) {
                console.log('📍 使用缓存的位置信息');
                await this._handleUserLocation(cachedPosition);
                return;
            }

            // 显示友好的定位请求提示
            const position = await this.geolocationService.requestLocationWithPrompt();
            await this._handleUserLocation(position);
            
        } catch (error) {
            console.log('📍 定位被拒绝或失败:', error.message);
            // 不显示错误消息，让用户可以手动选择位置
            this._showLocationFallback();
        } finally {
            this._isRequestingLocation = false;
        }
    }

    // 私有方法：处理用户位置
    async _handleUserLocation(position) {
        try {
            console.log('📍 处理用户位置:', position);

            // 移动地图中心到用户位置
            const userCenter = [position.longitude, position.latitude];
            this.map.setCenter(userCenter);
            this.map.setZoom(15); // 设置较高的缩放级别

            // 添加用户位置标记
            this._addUserLocationMarker(position);

            // 获取位置的地址信息
            const addressInfo = await this.geolocationService.reverseGeocode(
                position.longitude, 
                position.latitude, 
                CONFIG.AMAP.KEY
            );

            if (addressInfo.success) {
                console.log('📍 用户位置地址:', addressInfo.formatted_address);
                
                // 更新起点输入框
                this._updateStartLocationInput(addressInfo.formatted_address);
                
                // 显示位置获取成功的消息
                DOMUtils.showMessage(`📍 定位成功：${addressInfo.formatted_address}`, 'success');
            } else {
                DOMUtils.showMessage('📍 定位成功，但获取地址信息失败', 'warning');
            }

        } catch (error) {
            console.error('❌ 处理用户位置失败:', error);
            DOMUtils.showMessage('位置信息处理失败', 'error');
        }
    }

    // 私有方法：添加用户位置标记
    _addUserLocationMarker(position) {
        // 移除之前的用户位置标记
        if (this.userLocationMarker && this.map) {
            this.map.remove(this.userLocationMarker);
        }

        // 创建用户位置图标
        const userIconUrl = this._createUserLocationIcon();

        // 创建用户位置标记
        this.userLocationMarker = new AMap.Marker({
            position: new AMap.LngLat(position.longitude, position.latitude),
            icon: new AMap.Icon({
                size: new AMap.Size(24, 24),
                image: userIconUrl
            }),
            title: '您的位置',
            zIndex: 1000 // 确保用户位置标记在最上层
        });

        // 添加信息窗体
        const infoWindow = new AMap.InfoWindow({
            content: `
                <div style="padding: 10px;">
                    <h4 style="margin: 0 0 5px 0; color: #2c3e50;">
                        🧭 您的当前位置
                    </h4>
                    <p style="margin: 0; color: #7f8c8d; font-size: 12px;">
                        精度: ${Math.round(position.accuracy)}米
                    </p>
                    <p style="margin: 5px 0 0 0; color: #17a2b8; font-size: 11px;">
                        点击此处开始规划路线
                    </p>
                </div>
            `,
            offset: new AMap.Pixel(0, -24)
        });

        this.userLocationMarker.on('click', () => {
            infoWindow.open(this.map, this.userLocationMarker.getPosition());
            // 可以在这里添加打开规划面板的逻辑
            const plannerBtn = document.getElementById('floating-planner-btn');
            if (plannerBtn) {
                plannerBtn.style.animation = 'bounce 0.6s ease-in-out';
                setTimeout(() => {
                    plannerBtn.style.animation = '';
                }, 600);
            }
        });

        this.map.add(this.userLocationMarker);
    }

    // 私有方法：创建用户位置图标
    _createUserLocationIcon() {
        const svg = `
            <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="8" fill="#4285f4" opacity="0.3"/>
                <circle cx="12" cy="12" r="4" fill="#4285f4"/>
                <circle cx="12" cy="12" r="2" fill="white"/>
            </svg>
        `;
        return 'data:image/svg+xml;base64,' + btoa(svg);
    }

    // 私有方法：更新起点输入框
    _updateStartLocationInput(address) {
        try {
            const startLocationInput = document.getElementById('start-location');
            if (startLocationInput && !startLocationInput.value.trim()) {
                startLocationInput.value = address;
                startLocationInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        } catch (error) {
            console.warn('⚠️ 更新起点输入框失败:', error);
        }
    }

    // 私有方法：显示定位失败的备选方案
    _showLocationFallback() {
        // 可以在这里添加手动选择位置的提示
        console.log('📍 用户可以手动选择起点位置');
        
        setTimeout(() => {
            const message = document.createElement('div');
            message.style.cssText = `
                position: fixed;
                top: 80px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(255, 255, 255, 0.95);
                padding: 12px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                color: #6c757d;
                font-size: 14px;
                z-index: 1001;
                max-width: 300px;
                text-align: center;
                border-left: 4px solid #17a2b8;
            `;
            message.innerHTML = '💡 您可以在规划面板中手动输入起点位置';
            
            document.body.appendChild(message);
            
            setTimeout(() => {
                if (message.parentNode) {
                    message.style.opacity = '0';
                    message.style.transition = 'opacity 0.3s ease';
                    setTimeout(() => {
                        message.parentNode.removeChild(message);
                    }, 300);
                }
            }, 4000);
        }, 1000);
    }

    // 公开方法：重新获取用户位置
    async requestUserLocation() {
        // 重置定位状态，允许重新请求
        this._isRequestingLocation = false;
        await this._requestUserLocation();
    }

    // 公开方法：获取用户当前位置
    getUserLocation() {
        return this.geolocationService.getCachedPosition();
    }

    // 公开方法：导出完整路线数据
    exportCompleteRouteData() {
        if (!this.currentRoute) {
            console.warn('⚠️ 没有可导出的路线数据');
            return null;
        }

        try {
            const exportData = {
                // 基本路线信息
                route_meta: {
                    export_time: new Date().toISOString(),
                    export_version: '2.1',
                    route_name: `智能散步路线_${new Date().toLocaleDateString()}`,
                    total_distance: this.currentRoute.route.distance || 0,
                    total_duration: this.currentRoute.route.duration || 0,
                    estimated_walk_time: Math.round((this.currentRoute.route.duration || 0) / 60),
                    waypoints_count: (this.currentRoute.route.waypoints || []).length + 2 // 包括起终点
                },

                // 完整标记点信息
                markers_info: {
                    start_point: this._extractMarkerInfo(this.currentRoute.route.start_point, 'start'),
                    waypoints: (this.currentRoute.route.waypoints || []).map((wp, index) => 
                        this._extractMarkerInfo(wp, 'waypoint', index + 1)
                    ),
                    end_point: this._extractMarkerInfo(this.currentRoute.route.end_point, 'end')
                },

                // 详细路径信息
                path_details: {
                    coordinate_points: this._extractCoordinatePath(),
                    real_path_segments: this.currentRoute.route.real_paths || [],
                    real_distance: this.currentRoute.route.real_distance || this.currentRoute.route.distance,
                    real_duration: this.currentRoute.route.real_duration || this.currentRoute.route.duration,
                    path_type: this.currentRoute.route.real_paths ? 'real_walking_path' : 'estimated_straight_line'
                },

                // 导航信息
                navigation_details: {
                    step_by_step_directions: this._extractNavigationSteps(),
                    turn_instructions: this._extractTurnInstructions(),
                    landmark_references: this._extractLandmarks(),
                    safety_notes: this._generateSafetyNotes()
                },

                // 地图显示状态
                map_state: {
                    center_coordinates: this.map ? [this.map.getCenter().lng, this.map.getCenter().lat] : null,
                    zoom_level: this.map ? this.map.getZoom() : null,
                    map_bounds: this._getMapBounds(),
                    markers_count: this.markers.length,
                    has_polyline: !!this.polyline
                },

                // AI分析信息
                ai_analysis: this.currentRoute.analysis || {},

                // 技术信息
                technical_details: {
                    coordinate_system: 'WGS84',
                    map_service: 'Amap (高德地图)',
                    accuracy_level: 'Street Level',
                    llm_guided: this.currentRoute.technical_info?.llm_guided || false,
                    export_source: 'MapService.js'
                }
            };

            console.log('✅ 成功生成完整路线导出数据');
            return exportData;

        } catch (error) {
            console.error('❌ 导出路线数据失败:', error);
            return null;
        }
    }

    // 私有方法：提取标记点信息
    _extractMarkerInfo(point, type, sequence = null) {
        if (!point) return null;

        return {
            type: type,
            sequence: sequence,
            name: point.name || point.formatted_address || `${type}_point`,
            address: point.address || point.formatted_address || '',
            coordinates: {
                longitude: point.longitude || point.location?.[0] || 0,
                latitude: point.latitude || point.location?.[1] || 0
            },
            description: point.reason || `AI推荐的${type === 'start' ? '起点' : type === 'end' ? '终点' : '途经点'}`,
            poi_info: {
                type: point.type || 'unknown',
                rating: point.rating || 'N/A',
                distance_from_start: point.distance || 0
            },
            visit_suggestion: this._generateVisitSuggestion(point, type)
        };
    }

    // 私有方法：提取坐标路径
    _extractCoordinatePath() {
        const coordinates = [];
        
        if (this.currentRoute?.route) {
            const route = this.currentRoute.route;
            
            // 添加起点
            if (route.start_point) {
                coordinates.push({
                    point_type: 'start',
                    longitude: route.start_point.longitude || route.start_point.location?.[0],
                    latitude: route.start_point.latitude || route.start_point.location?.[1],
                    name: route.start_point.name || route.start_point.formatted_address || '起点'
                });
            }

            // 添加途经点
            if (route.waypoints) {
                route.waypoints.forEach((wp, index) => {
                    coordinates.push({
                        point_type: 'waypoint',
                        sequence: index + 1,
                        longitude: wp.longitude || wp.location?.[0],
                        latitude: wp.latitude || wp.location?.[1],
                        name: wp.name || `途经点${index + 1}`
                    });
                });
            }

            // 添加终点
            if (route.end_point) {
                coordinates.push({
                    point_type: 'end',
                    longitude: route.end_point.longitude || route.end_point.location?.[0],
                    latitude: route.end_point.latitude || route.end_point.location?.[1],
                    name: route.end_point.name || route.end_point.formatted_address || '终点'
                });
            }
        }

        return coordinates;
    }

    // 私有方法：提取导航步骤
    _extractNavigationSteps() {
        if (this.currentRoute?.route?.steps) {
            return this.currentRoute.route.steps.map((step, index) => ({
                step_number: index + 1,
                instruction: step.instruction || step.action || '继续前行',
                distance: step.distance || 0,
                duration: step.duration || 0,
                direction: this._extractDirection(step.instruction || step.action || ''),
                landmark: step.landmark || ''
            }));
        }
        return [];
    }

    // 私有方法：提取转向指示
    _extractTurnInstructions() {
        const instructions = [];
        
        if (this.currentRoute?.route?.waypoints) {
            const waypoints = [
                this.currentRoute.route.start_point,
                ...this.currentRoute.route.waypoints,
                this.currentRoute.route.end_point
            ];

            for (let i = 0; i < waypoints.length - 1; i++) {
                const from = waypoints[i];
                const to = waypoints[i + 1];
                
                instructions.push({
                    instruction_id: i + 1,
                    from_point: from.name || from.formatted_address || `点${i + 1}`,
                    to_point: to.name || to.formatted_address || `点${i + 2}`,
                    bearing: this._calculateBearing(from, to),
                    distance: GeoUtils.calculateDistance(from, to) * 1000,
                    estimated_time: Math.round(GeoUtils.calculateDistance(from, to) * 1000 / CONFIG.PLANNING.DEFAULT_WALK_SPEED)
                });
            }
        }

        return instructions;
    }

    // 私有方法：提取地标信息
    _extractLandmarks() {
        const landmarks = [];
        
        if (this.currentRoute?.nearby_pois) {
            this.currentRoute.nearby_pois.forEach(poi => {
                landmarks.push({
                    name: poi.name,
                    type: poi.type,
                    coordinates: {
                        longitude: poi.location?.[0] || 0,
                        latitude: poi.location?.[1] || 0
                    },
                    distance_from_route: poi.distance || 'N/A',
                    rating: poi.rating || 'N/A',
                    address: poi.address || '',
                    visit_value: this._assessVisitValue(poi)
                });
            });
        }

        return landmarks;
    }

    // 私有方法：生成安全提示
    _generateSafetyNotes() {
        return [
            '🚶‍♂️ 建议在光线充足的时段进行散步',
            '⚠️ 注意交通安全，遵守交通规则',
            '💧 携带充足的水和轻便食品',
            '📱 保持手机电量充足，告知他人行程',
            '🌤️ 关注天气变化，适当调整计划',
            '👥 建议结伴而行，特别是在陌生区域',
            '🏥 了解沿途医疗设施位置',
            '🕐 预留充足时间，不要急于赶路'
        ];
    }

    // 私有方法：生成访问建议
    _generateVisitSuggestion(point, type) {
        if (type === 'start') {
            return '确认起点位置，检查随身物品，开始愉快的散步之旅';
        } else if (type === 'end') {
            return '到达终点，回顾散步体验，注意休息补充水分';
        } else {
            return `建议停留15-30分钟，欣赏${point.name || '周围环境'}，拍照留念`;
        }
    }

    // 私有方法：提取方向信息
    _extractDirection(instruction) {
        const inst = instruction.toLowerCase();
        if (inst.includes('左') || inst.includes('left')) return 'turn_left';
        if (inst.includes('右') || inst.includes('right')) return 'turn_right';
        if (inst.includes('直') || inst.includes('straight')) return 'straight';
        return 'continue';
    }

    // 私有方法：计算方位角
    _calculateBearing(from, to) {
        const fromLng = from.longitude || from.location?.[0] || 0;
        const fromLat = from.latitude || from.location?.[1] || 0;
        const toLng = to.longitude || to.location?.[0] || 0;
        const toLat = to.latitude || to.location?.[1] || 0;

        const dLng = (toLng - fromLng) * Math.PI / 180;
        const lat1 = fromLat * Math.PI / 180;
        const lat2 = toLat * Math.PI / 180;

        const y = Math.sin(dLng) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

        const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
        return Math.round(bearing);
    }

    // 私有方法：评估访问价值
    _assessVisitValue(poi) {
        const rating = parseFloat(poi.rating) || 0;
        if (rating >= 4.5) return 'high';
        if (rating >= 3.5) return 'medium';
        return 'low';
    }

    // 私有方法：获取地图边界
    _getMapBounds() {
        if (!this.map) return null;
        
        try {
            const bounds = this.map.getBounds();
            return {
                southwest: [bounds.getSouthWest().lng, bounds.getSouthWest().lat],
                northeast: [bounds.getNorthEast().lng, bounds.getNorthEast().lat]
            };
        } catch (error) {
            console.warn('⚠️ 无法获取地图边界:', error);
            return null;
        }
    }
}
