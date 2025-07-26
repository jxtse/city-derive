
import { CONFIG, ICON_TYPES } from '../utils/constants.js';
import { DOMUtils, GeoUtils } from '../utils/helpers.js';

export class MapService {
    constructor() {
        this.map = null;
        this.markers = [];
        this.polyline = null;
        this.currentRoute = null;
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
        if (!this.map) return;
        
        console.log('🗺️ 更新地图路线显示:', routeResult);
        
        try {
            this.clearMap();
            this.currentRoute = routeResult;
            
            const waypoints = this._buildWaypoints(routeResult);
            this._addMarkers(waypoints);
            this._addTemporaryPath(waypoints);
            this._fitMapView();
            
            // 异步获取真实路径
            this._loadRealPaths(waypoints);
            
        } catch (error) {
            console.error('❌ 更新地图显示失败:', error);
            DOMUtils.showMessage('地图更新失败', 'error');
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
    }
    
    // 重置地图
    resetMap() {
        this.clearMap();
        if (this.map) {
            this.map.setZoom(CONFIG.MAP_DEFAULTS.ZOOM);
            this.map.setCenter(CONFIG.MAP_DEFAULTS.CENTER);
        }
    }
    
    // 私有方法：构建路径点
    _buildWaypoints(routeResult) {
        const waypoints = [];
        
        // 添加起点
        waypoints.push({
            ...routeResult.route.start_point,
            type: 'start',
            name: routeResult.route.start_point.formatted_address || '起点'
        });
        
        // 添加途经点
        if (routeResult.route.waypoints) {
            routeResult.route.waypoints.forEach(waypoint => {
                waypoints.push({
                    ...waypoint,
                    type: 'waypoint',
                    longitude: waypoint.location?.[0] || waypoint.longitude,
                    latitude: waypoint.location?.[1] || waypoint.latitude
                });
            });
        }
        
        // 添加终点
        waypoints.push({
            ...routeResult.route.end_point,
            type: 'end',
            name: routeResult.route.end_point.name || '终点'
        });
        
        return waypoints.filter(wp => 
            GeoUtils.isValidCoordinate(wp.longitude, wp.latitude)
        );
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
}
