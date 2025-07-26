
// 主入口模块 - 整合所有模块
import { MapManager } from './map-manager.js';
import { FixedRouteService } from './route-service.js';
import { UIManager } from './ui-manager.js';
import { showTemporaryMessage } from './utils.js';

// 全局变量
let mapManager;
let routeService;
let uiManager;
let currentRoute = null;

// 初始化所有模块
function initializeApp() {
    console.log('🚀 初始化模块化散步规划器...');
    
    // 初始化UI管理器
    uiManager = new UIManager();
    
    // 初始化路线服务
    routeService = new FixedRouteService();
    
    // 等待高德地图API加载完成
    function waitForAMap() {
        if (typeof AMap !== 'undefined') {
            console.log('高德地图API已加载，开始初始化地图...');
            
            // 初始化地图管理器
            mapManager = new MapManager();
            
            setTimeout(() => {
                mapManager.initMap();
            }, 500);
        } else {
            console.log('等待高德地图API加载...');
            setTimeout(waitForAMap, 100);
        }
    }
    
    waitForAMap();
    
    // 绑定表单事件
    try {
        const form = document.getElementById('planning-form');
        if (form) {
            form.addEventListener('submit', handlePlanningForm);
            console.log('✅ 表单事件绑定完成');
        } else {
            console.warn('⚠️ 未找到规划表单元素');
        }
        
        setupMapControls();
        setupPanelControls();
        
        console.log('✅ 模块化应用初始化完成');
    } catch (error) {
        console.error('❌ 应用初始化过程中发生错误:', error);
    }
}

// 表单提交处理
async function handlePlanningForm(event) {
    event.preventDefault();
    
    console.log('📝 开始处理AI智能规划表单...');
    
    uiManager.clearPlanningSteps();
    document.getElementById('planned-route').style.display = 'none';
    
    const formData = new FormData(event.target);
    const preferences = {
        startLocation: formData.get('start-location'),
        city: formData.get('city'),
        distance: formData.get('distance'),
        preference: formData.get('preference'),
        endType: formData.get('end-type')
    };
    
    console.log('📋 用户偏好:', preferences);
    
    if (!preferences.startLocation || !preferences.city || !preferences.distance || !preferences.preference || !preferences.endType) {
        alert('请填写所有必填字段');
        return;
    }
    
    const submitButton = document.getElementById('plan-button');
    const originalText = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-brain fa-spin"></i> AI智能规划中...';
    
    try {
        const initStepId = uiManager.updatePlanningStatus('🤖 AI正在深度分析您的需求...', 'loading', 
            '正在启动智能代理，准备调用地图API', 
            { step: 1, action: '初始化AI智能代理', result: 'running' }
        );
        
        setTimeout(() => {
            uiManager.updateStepStatus(initStepId, 'completed', '✅ AI智能代理启动成功');
        }, 1000);
        
        const result = await routeService.planRoute(preferences.startLocation, preferences.city, preferences);
        
        console.log('✅ AI智能规划成功:', result);
        
        uiManager.updatePlanningStatus('✅ AI智能规划完成！', 'success', 
            `AI经过${result.technical_info?.planning_steps?.length || '多'}轮分析生成最优路线`,
            { step: 'final', action: '生成最终路线方案', result: true }
        );
        
        setTimeout(() => {
            uiManager.hidePlanningStatus();
            displayRouteResult(result);
        }, 1500);
        
    } catch (error) {
        console.error('❌ AI智能规划失败:', error);
        uiManager.updatePlanningStatus(`❌ AI规划失败: ${error.message}`, 'error',
            '请检查网络连接或稍后重试',
            { step: 'error', action: '规划过程中断', result: false }
        );
    } finally {
        setTimeout(() => {
            submitButton.disabled = false;
            submitButton.innerHTML = originalText;
        }, 2000);
    }
}

// 设置地图控制
function setupMapControls() {
    function safeAddEventListener(elementId, eventType, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener(eventType, handler);
        } else {
            console.warn(`⚠️ 元素 '${elementId}' 不存在，跳过事件绑定`);
        }
    }
    
    safeAddEventListener('show-route', 'click', () => {
        if (currentRoute && mapManager) {
            updateMapWithRoute(currentRoute);
        }
    });
    
    safeAddEventListener('reset-map', 'click', () => {
        if (mapManager) {
            mapManager.clearMap();
            mapManager.map.setZoom(10);
            mapManager.map.setCenter([116.397428, 39.90923]);
        }
    });
    
    safeAddEventListener('show-steps', 'click', () => {
        if (currentRoute && currentRoute.route.steps) {
            showDetailedSteps(currentRoute.route.steps);
        } else {
            alert('暂无详细步骤信息');
        }
    });

    safeAddEventListener('show-ai-process', 'click', () => {
        if (currentRoute && currentRoute.technical_info && currentRoute.technical_info.planning_steps) {
            showAIProcessModal(currentRoute.technical_info.planning_steps);
        } else {
            alert('暂无AI规划过程信息');
        }
    });
    
    safeAddEventListener('export-route', 'click', () => {
        if (currentRoute) {
            exportRoute(currentRoute);
        }
    });
}

// 设置面板控制
function setupPanelControls() {
    const floatingBtn = document.getElementById('floating-planner-btn');
    const plannerPanel = document.getElementById('planner-panel');
    const resultPanel = document.getElementById('result-panel');
    const closePanelBtn = document.getElementById('close-panel-btn');
    const closeResultPanelBtn = document.getElementById('close-result-panel-btn');

    if (floatingBtn) {
        floatingBtn.addEventListener('click', function() {
            if (plannerPanel) plannerPanel.classList.add('open');
            if (resultPanel) resultPanel.classList.remove('open');
        });
    }

    if (closePanelBtn) {
        closePanelBtn.addEventListener('click', function() {
            if (plannerPanel) plannerPanel.classList.remove('open');
        });
    }

    if (closeResultPanelBtn) {
        closeResultPanelBtn.addEventListener('click', function() {
            if (resultPanel) resultPanel.classList.remove('open');
        });
    }
}

// 显示路线结果
function displayRouteResult(result) {
    console.log('📊 显示AI智能规划结果:', result);
    
    const resultPanel = document.getElementById('result-panel');
    const plannerPanel = document.getElementById('planner-panel');

    // 更新摘要信息
    document.getElementById('total-distance').textContent = `${(result.route.distance/1000).toFixed(1)}km`;
    document.getElementById('total-time').textContent = `${Math.round(result.route.duration/60)}分钟`;
    document.getElementById('waypoints-count').textContent = result.route.waypoints.length;
    document.getElementById('difficulty-level').textContent = result.analysis.experience_rating || '8';

    // 生成详细路线信息
    let detailsHTML = '<h4 style="color: #2c3e50; margin-bottom: 15px; font-size: 14px;">📍 AI智能选择的路线</h4>';
    
    // 起点
    detailsHTML += `
        <div style="display: flex; align-items: center; padding: 8px; margin-bottom: 8px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="width: 25px; height: 25px; border-radius: 50%; background: #28a745; color: white; display: flex; align-items: center; justify-content: center; margin-right: 12px; font-weight: bold; font-size: 10px;">起</div>
            <div style="font-size: 12px;">
                <strong>${result.route.start_point.formatted_address || '起点'}</strong><br>
                <small style="color: #6c757d;">经纬度: ${result.route.start_point.longitude.toFixed(6)}, ${result.route.start_point.latitude.toFixed(6)}</small>
            </div>
        </div>
    `;

    // AI选择的途经点
    result.route.waypoints.forEach((waypoint, index) => {
        detailsHTML += `
            <div style="display: flex; align-items: center; padding: 8px; margin-bottom: 8px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="width: 25px; height: 25px; border-radius: 50%; background: #17a2b8; color: white; display: flex; align-items: center; justify-content: center; margin-right: 12px; font-weight: bold; font-size: 10px;">${index + 1}</div>
                <div style="font-size: 12px;">
                    <strong>${waypoint.name}</strong><br>
                    <small style="color: #6c757d;">${waypoint.reason || '智能推荐'}</small>
                </div>
            </div>
        `;
    });

    // 终点
    detailsHTML += `
        <div style="display: flex; align-items: center; padding: 8px; margin-bottom: 8px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="width: 25px; height: 25px; border-radius: 50%; background: #dc3545; color: white; display: flex; align-items: center; justify-content: center; margin-right: 12px; font-weight: bold; font-size: 10px;">终</div>
            <div style="font-size: 12px;">
                <strong>${result.route.end_point.name || '终点'}</strong><br>
                <small style="color: #6c757d;">${result.route.end_point.address || ''}</small>
            </div>
        </div>
    `;

    document.getElementById('route-details').innerHTML = detailsHTML;

    // 显示AI分析结果
    let analysisHTML = '<h4 style="color: #2c3e50; margin-bottom: 10px; font-size: 14px;">🧠 AI深度分析报告</h4>';
    analysisHTML += `<div style="background: #e8f4fd; padding: 12px; border-radius: 8px; border-left: 4px solid #1976d2; font-size: 12px;">`;
    analysisHTML += `<p><strong>🎯 路线评价:</strong> ${result.analysis.route_description || 'AI为您精心设计的优质散步路线'}</p>`;
    
    if (result.analysis.recommended_waypoints && result.analysis.recommended_waypoints.length > 0) {
        analysisHTML += '<p><strong>🌟 AI推荐亮点:</strong></p><ul style="margin: 5px 0; padding-left: 20px;">';
        result.analysis.recommended_waypoints.forEach(wp => {
            analysisHTML += `<li style="margin: 3px 0;"><strong>${wp.name}</strong> - ${wp.reason}</li>`;
        });
        analysisHTML += '</ul>';
    }
    
    if (result.analysis.practical_tips && result.analysis.practical_tips.length > 0) {
        analysisHTML += '<p><strong>💡 AI贴心提示:</strong></p><ul style="margin: 5px 0; padding-left: 20px;">';
        result.analysis.practical_tips.forEach(tip => {
            analysisHTML += `<li style="margin: 3px 0;">${tip}</li>`;
        });
        analysisHTML += '</ul>';
    }
    
    if (result.technical_info && result.technical_info.llm_guided) {
        analysisHTML += `<p style="margin-top: 10px; padding: 8px; background: rgba(111, 66, 193, 0.1); border-radius: 6px; font-size: 11px;">
            <strong>🤖 技术特色:</strong> 本路线由AI完全自主规划，经过${result.technical_info.planning_steps ? result.technical_info.planning_steps.length : '多'}轮智能分析和优化
        </p>`;
    }
    
    analysisHTML += '</div>';
    
    document.getElementById('route-description').innerHTML = analysisHTML;

    // 显示结果面板，隐藏规划面板
    if (resultPanel) {
        resultPanel.classList.add('open');
    }
    if (plannerPanel) {
        plannerPanel.classList.remove('open');
    }
    
    // 更新地图
    updateMapWithRoute(result);
    
    // 保存当前路线
    currentRoute = result;
}

// 更新地图显示路线
function updateMapWithRoute(result) {
    if (!mapManager || !mapManager.map) return;

    console.log('🗺️ 开始更新地图显示路线:', result);

    mapManager.clearMap();

    try {
        const allWaypoints = [];
        
        allWaypoints.push({
            name: result.route.start_point.formatted_address || '起点',
            longitude: result.route.start_point.longitude,
            latitude: result.route.start_point.latitude,
            type: 'start'
        });
        
        if (result.route.waypoints && result.route.waypoints.length > 0) {
            result.route.waypoints.forEach(waypoint => {
                let lng, lat;
                if (waypoint.location && waypoint.location.length >= 2) {
                    lng = waypoint.location[0];
                    lat = waypoint.location[1];
                } else if (waypoint.longitude && waypoint.latitude) {
                    lng = waypoint.longitude;
                    lat = waypoint.latitude;
                }
                
                if (lng && lat && !isNaN(lng) && !isNaN(lat)) {
                    allWaypoints.push({
                        name: waypoint.name,
                        longitude: lng,
                        latitude: lat,
                        location: [lng, lat],
                        address: waypoint.address,
                        distance: waypoint.distance,
                        type: 'waypoint'
                    });
                }
            });
        }
        
        const endPoint = result.route.end_point;
        if (endPoint && endPoint.longitude && endPoint.latitude && 
            !isNaN(endPoint.longitude) && !isNaN(endPoint.latitude)) {
            allWaypoints.push({
                name: endPoint.name || '终点',
                longitude: endPoint.longitude,
                latitude: endPoint.latitude,
                address: endPoint.address,
                type: 'end'
            });
        }
        
        console.log('📍 完整路径点数组:', allWaypoints);

        // 添加所有标记点
        allWaypoints.forEach((waypoint, index) => {
            if (!waypoint.longitude || !waypoint.latitude || 
                isNaN(waypoint.longitude) || isNaN(waypoint.latitude)) {
                console.warn(`⚠️ 跳过无效坐标的路径点: ${waypoint.name}`, waypoint);
                return;
            }
            
            let iconType, iconSize;
            
            if (waypoint.type === 'start') {
                iconType = 'start';
                iconSize = 32;
            } else if (waypoint.type === 'end') {
                iconType = 'end';
                iconSize = 32;
            } else {
                iconType = 'route';
                iconSize = 24;
            }
            
            const icon = mapManager.createCustomIcon(iconType, iconSize);
            const marker = new AMap.Marker({
                position: new AMap.LngLat(waypoint.longitude, waypoint.latitude),
                icon: new AMap.Icon({
                    size: new AMap.Size(iconSize, iconSize),
                    image: icon
                }),
                title: waypoint.name
            });

            let infoContent = `
                <div style="padding: 10px;">
                    <h4 style="margin: 0 0 5px 0; color: #2c3e50;">
                        ${waypoint.type === 'start' ? '🏁' : waypoint.type === 'end' ? '🎯' : '🚩'} 
                        ${waypoint.name}
                    </h4>
                    <p style="margin: 0; color: #7f8c8d; font-size: 12px;">${waypoint.address || ''}</p>
            `;
            
            if (waypoint.distance) {
                infoContent += `<p style="margin: 5px 0 0 0; color: #9c27b0; font-size: 11px;">距离: ${waypoint.distance}m</p>`;
            }
            
            infoContent += `</div>`;

            const infoWindow = new AMap.InfoWindow({
                content: infoContent,
                offset: new AMap.Pixel(0, -iconSize)
            });

            marker.on('click', () => {
                infoWindow.open(mapManager.map, marker.getPosition());
            });

            mapManager.markers.push(marker);
            mapManager.map.add(marker);
        });

        // 先显示临时直线路径
        const tempPath = allWaypoints.map(wp => [wp.longitude, wp.latitude]);
        mapManager.polyline = new AMap.Polyline({
            path: tempPath,
            strokeWeight: 3,
            strokeColor: "#cccccc",
            strokeOpacity: 0.6,
            strokeStyle: 'dashed',
            lineJoin: 'round',
            lineCap: 'round'
        });
        mapManager.map.add(mapManager.polyline);
        
        // 调整地图视野
        const allOverlays = [...mapManager.markers];
        if (mapManager.polyline) allOverlays.push(mapManager.polyline);
        
        if (allOverlays.length > 0) {
            mapManager.map.setFitView(allOverlays, false, [30, 30, 30, 30]);
        } else {
            console.warn('⚠️ 没有有效的地图覆盖物，使用默认视野');
            mapManager.map.setCenter([116.4074, 39.9042]);
            mapManager.map.setZoom(12);
        }

        console.log('✅ 地图更新完成');

    } catch (error) {
        console.error('❌ 更新地图显示失败:', error);
        if (result.route.start_point && 
            result.route.start_point.longitude && 
            result.route.start_point.latitude &&
            !isNaN(result.route.start_point.longitude) && 
            !isNaN(result.route.start_point.latitude)) {
            mapManager.map.setCenter([result.route.start_point.longitude, result.route.start_point.latitude]);
            mapManager.map.setZoom(14);
        } else {
            console.warn('⚠️ 无有效坐标，设置默认地图中心为北京');
            mapManager.map.setCenter([116.4074, 39.9042]);
            mapManager.map.setZoom(12);
        }
    }
}

// 其他辅助函数
function showDetailedSteps(steps) {
    let stepsHTML = '<h3>🚶‍♂️ 详细步骤</h3><div style="max-height: 400px; overflow-y: auto;">';
    
    steps.forEach((step, index) => {
        stepsHTML += `
            <div style="padding: 10px; margin: 5px 0; background: #f8f9fa; border-radius: 5px;">
                <strong>步骤 ${index + 1}:</strong> ${step.instruction || step.action || '继续前行'}<br>
                <small>距离: ${step.distance}米 | 预计时间: ${Math.round(step.duration/60)}分钟</small>
            </div>
        `;
    });
    
    stepsHTML += '</div>';
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
        background: rgba(0,0,0,0.5); z-index: 1000; 
        display: flex; align-items: center; justify-content: center;
    `;
    
    modal.innerHTML = `
        <div style="background: white; padding: 20px; border-radius: 10px; max-width: 500px; width: 90%;">
            ${stepsHTML}
            <button onclick="this.closest('div').parentElement.remove()" 
                    style="margin-top: 15px; padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer;">
                关闭
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
}

function showAIProcessModal(planningSteps) {
    let processHTML = '<h3>🤖 AI智能规划过程</h3><div style="max-height: 450px; overflow-y: auto;">';
    
    if (planningSteps && planningSteps.length > 0) {
        planningSteps.forEach((step, index) => {
            const timestamp = new Date(step.timestamp).toLocaleString();
            processHTML += `
                <div style="margin: 10px 0; padding: 12px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #6f42c1;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <strong style="color: #6f42c1;">AI对话 ${index + 1}</strong>
                        <small style="color: #6c757d;">${timestamp}</small>
                    </div>
                    <div style="background: white; padding: 8px; border-radius: 4px; font-size: 12px; max-height: 100px; overflow-y: auto;">
                        ${(step.response || '').substring(0, 300)}${(step.response || '').length > 300 ? '...' : ''}
                    </div>
                </div>
            `;
        });
    } else {
        processHTML += '<p style="text-align: center; color: #6c757d;">暂无AI规划过程记录</p>';
    }
    
    processHTML += '</div>';
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
        background: rgba(0,0,0,0.5); z-index: 1000; 
        display: flex; align-items: center; justify-content: center;
    `;
    
    modal.innerHTML = `
        <div style="background: white; padding: 20px; border-radius: 10px; max-width: 700px; width: 90%; max-height: 80vh; overflow: hidden;">
            ${processHTML}
            <div style="margin-top: 15px; text-align: center;">
                <button onclick="this.closest('div').parentElement.remove()" 
                        style="padding: 10px 20px; background: #6f42c1; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    关闭
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

function exportRoute(route) {
    const exportData = {
        route_name: `散步路线_${new Date().toLocaleDateString()}`,
        start_point: route.route.start_point,
        end_point: route.route.end_point,
        waypoints: route.route.waypoints,
        distance: route.route.distance,
        duration: route.route.duration,
        analysis: route.analysis,
        export_time: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `walking_route_${Date.now()}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    showTemporaryMessage('✅ 路线已导出为JSON文件', 'success');
}

// 暴露给全局作用域的函数
window.updatePlanningStatus = function(message, type, detail, stepInfo) {
    if (uiManager) {
        return uiManager.updatePlanningStatus(message, type, detail, stepInfo);
    }
};

window.updateStepStatus = function(stepId, status, detail, additionalData) {
    if (uiManager) {
        return uiManager.updateStepStatus(stepId, status, detail, additionalData);
    }
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initializeApp);
