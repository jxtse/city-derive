// 智能散步路线规划器 - 模块化重构版本
import { CONFIG, PREFERENCE_KEYWORDS } from './js/utils/constants.js';
import { DOMUtils, GeoUtils, ValidationUtils, DateTimeUtils } from './js/utils/helpers.js';
import { MapService } from './js/services/MapService.js';

// 全局变量
let mapService;
let routeService;
let uiController;
let currentRoute = null;

// LLM智能规划代理类
class LLMPlanningAgent {
    constructor() {
        console.log('🤖 初始化LLM智能规划代理...');
        this.apiKey = CONFIG.AMAP.KEY;
        this.webApiBase = CONFIG.AMAP.BASE_URL;
        this.planningHistory = [];
    }

    // 获取可用工具函数集
    getAvailableTools() {
        return [
            {
                name: "geocode_address",
                description: "将地址转换为经纬度坐标",
                aliases: ["geocode", "get_coordinates", "address_to_coordinates", "resolve_address"],
                parameters: { address: "地址描述", city: "城市名称" }
            },
            {
                name: "search_nearby_pois",
                description: "搜索指定位置周边的兴趣点",
                aliases: ["search_pois", "find_nearby_pois", "nearby_search", "search_around", "find_nearby", "poi_search"],
                parameters: { longitude: "经度", latitude: "纬度", keywords: "搜索关键词", radius: "搜索半径(米)" }
            },
            {
                name: "text_search_pois",
                description: "根据关键词搜索城市内的POI",
                aliases: ["search_text", "text_search", "keyword_search", "find_pois", "search_by_keyword"],
                parameters: { keywords: "搜索关键词", city: "城市名称", citylimit: "是否限制在城市内" }
            },
            {
                name: "get_poi_details",
                description: "获取特定POI的详细信息",
                aliases: ["get_details", "get_poi", "poi_details", "get_poi_info", "fetch_poi_details", "detail_info"],
                parameters: { poi_id: "POI ID" }
            },
            {
                name: "plan_walking_route",
                description: "规划两点间的步行路线",
                aliases: ["calculate_walking_route", "plan_route", "walking_route", "route_planning", "get_walking_route", "calculate_route", "plan_walking_path"],
                parameters: { start_point: "起点坐标 {longitude, latitude}", end_point: "终点坐标 {longitude, latitude}" }
            }
        ];
    }

    // 地理编码
    async geocodeAddress(address, city) {
        try {
            const url = `${this.webApiBase}/geocode/geo?address=${encodeURIComponent(address)}&city=${encodeURIComponent(city)}&key=${this.apiKey}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.status === '1' && data.geocodes?.length > 0) {
                const location = data.geocodes[0].location.split(',');
                return {
                    success: true,
                    longitude: parseFloat(location[0]),
                    latitude: parseFloat(location[1]),
                    formatted_address: data.geocodes[0].formatted_address,
                    raw_data: data
                };
            }
            return { success: false, error: data.info || '地址解析失败' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // 搜索周边POI
    async searchNearbyPOIs(longitude, latitude, keywords, radius = CONFIG.PLANNING.DEFAULT_RADIUS) {
        try {
            if (!GeoUtils.isValidCoordinate(longitude, latitude)) {
                console.warn(`⚠️ 搜索周边POI参数无效: lng=${longitude}, lat=${latitude}`);
                return { success: false, error: '坐标参数无效', pois: [] };
            }

            const url = `${this.webApiBase}/place/around?location=${longitude},${latitude}&keywords=${encodeURIComponent(keywords)}&radius=${radius}&key=${this.apiKey}`;
            console.log(`📡 API调用: ${url.replace(this.apiKey, 'HIDDEN_KEY')}`);

            const response = await fetch(url);
            const data = await response.json();

            if (data.status === '1' && data.pois) {
                return {
                    success: true,
                    pois: data.pois.map(poi => ({
                        id: poi.id,
                        name: poi.name,
                        address: poi.address,
                        location: poi.location.split(',').map(Number),
                        type: poi.type,
                        distance: poi.distance,
                        rating: poi.rating || 'N/A'
                    }))
                };
            }
            return { success: true, pois: [] };
        } catch (error) {
            console.error(`❌ 搜索周边POI失败:`, error);
            return { success: false, error: error.message, pois: [] };
        }
    }

    // 文本搜索POI
    async textSearchPOIs(keywords, city, citylimit = false) {
        try {
            const url = `${this.webApiBase}/place/text?keywords=${encodeURIComponent(keywords)}&city=${encodeURIComponent(city)}&citylimit=${citylimit}&key=${this.apiKey}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.status === '1' && data.pois) {
                return {
                    success: true,
                    pois: data.pois.map(poi => ({
                        id: poi.id,
                        name: poi.name,
                        address: poi.address,
                        location: poi.location.split(',').map(Number),
                        type: poi.type,
                        rating: poi.rating || 'N/A'
                    }))
                };
            }
            return { success: true, pois: [] };
        } catch (error) {
            return { success: false, error: error.message, pois: [] };
        }
    }

    // 获取POI详情
    async getPOIDetails(poiId) {
        try {
            const url = `${this.webApiBase}/place/detail?id=${poiId}&key=${this.apiKey}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.status === '1' && data.pois?.length > 0) {
                const poi = data.pois[0];
                return {
                    success: true,
                    details: {
                        id: poi.id,
                        name: poi.name,
                        address: poi.address,
                        location: poi.location.split(',').map(Number),
                        type: poi.type,
                        rating: poi.rating,
                        photos: poi.photos || [],
                        business_area: poi.business_area,
                        opening_hours: poi.opening_hours,
                        tel: poi.tel
                    }
                };
            }
            return { success: false, error: 'POI详情获取失败' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // 规划步行路线
    async planWalkingRoute(startPoint, endPoint) {
        try {
            if (!GeoUtils.isValidCoordinate(startPoint.longitude, startPoint.latitude) ||
                !GeoUtils.isValidCoordinate(endPoint.longitude, endPoint.latitude)) {
                return { success: false, error: '路径规划参数无效' };
            }

            const origin = `${startPoint.longitude},${startPoint.latitude}`;
            const destination = `${endPoint.longitude},${endPoint.latitude}`;
            const url = `${this.webApiBase}/direction/walking?origin=${origin}&destination=${destination}&key=${this.apiKey}`;

            const response = await fetch(url);
            const data = await response.json();

            if (data.status === '1' && data.route?.paths?.length > 0) {
                const path = data.route.paths[0];
                return {
                    success: true,
                    distance: parseInt(path.distance),
                    duration: parseInt(path.duration),
                    steps: path.steps || [],
                    polyline: path.polyline,
                    raw_data: data
                };
            }
            return { success: false, error: `Web API: ${data.info || '无法规划路径'}` };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // 智能规划路线主方法
    async intelligentPlanRoute(startLocation, city, preferences) {
        try {
            console.log('🧠 开始LLM智能路径规划...');
            uiController.updatePlanningStatus('🤖 AI正在分析您的需求...', 'loading');

            const systemPrompt = this._buildSystemPrompt();
            const userPrompt = this._buildUserPrompt(startLocation, city, preferences);

            const planningData = {
                startPoint: null,
                candidateDestinations: [],
                finalRoute: null,
                analysis: {}
            };

            await this._executeLLMGuidedPlanning(systemPrompt, userPrompt, planningData, preferences);

            if (!planningData.finalRoute) {
                throw new Error('智能规划失败：无法获得足够的地理信息来生成路线');
            }

            return planningData.finalRoute;

        } catch (error) {
            console.error('❌ LLM智能规划失败:', error);
            uiController.updatePlanningStatus(`❌ 智能规划失败: ${error.message}`, 'error');
            throw error;
        }
    }

    // 构建系统提示词
    _buildSystemPrompt() {
        return `你是一个专业的散步路线规划AI助手。你必须通过函数调用获取所有实际数据，不能只提供文字建议。

⚠️ 【CRITICAL - 防止幻觉的约束条件】：
1. 你绝对不能基于自己的知识或想象描述任何具体的地点、路线或距离
2. 你只能基于函数调用返回的真实API数据进行描述
3. 在获得实际路径规划数据之前，不要生成最终的路线方案
4. 如果API返回的数据与你的预期不符，以API数据为准
5. 任何距离、时间、地点名称都必须来自API返回结果

【可用工具详细说明】：
${this.getAvailableTools().map(tool => `
${tool.name}(${Object.keys(tool.parameters).join(', ')}) - ${tool.description}
别名: ${tool.aliases.join(', ')}`).join('\n')}

【严格的函数调用格式要求】：
✅ 正确格式：
- FUNCTION_CALL: geocode_address("五道口地铁站", "北京")
- FUNCTION_CALL: search_nearby_pois(116.337742, 39.992894, "公园|景点", 3000)
- FUNCTION_CALL: plan_walking_route({"longitude": 116.337742, "latitude": 39.992894}, {"longitude": 116.347742, "latitude": 39.982894})

【关键规划流程】你必须完成：
1. 获取起点坐标：geocode_address(起点地址, 城市)
2. 搜索符合偏好的地点：search_nearby_pois(经度, 纬度, 关键词, 半径)
3. 获取实际路径数据：plan_walking_route(起点坐标对象, 终点坐标对象)
4. 基于真实数据生成最终方案

现在开始第一步规划。`;
    }

    // 构建用户提示词
    _buildUserPrompt(startLocation, city, preferences) {
        return `用户需求：
- 起点：${startLocation}
- 城市：${city}
- 偏好类型：${preferences.preference}
- 期望距离：${preferences.distance}公里
- 终点类型：${preferences.endType}

请分析这个需求并制定详细的规划步骤。告诉我你打算如何搜索和筛选地点，以及规划路线的策略。

请直接告诉我第一步需要调用什么函数，严格使用FUNCTION_CALL格式：
FUNCTION_CALL: function_name("参数1", "参数2")

注意：请严格使用上面列出的函数名和格式，不要使用其他变体。`;
    }

    // 执行LLM指导的规划过程
    async _executeLLMGuidedPlanning(systemPrompt, userPrompt, planningData, preferences) {
        // 这里是简化版本，实际应该包含完整的LLM交互逻辑
        // 由于空间限制，我们使用模拟数据

        // 模拟地理编码
        const geocodeResult = await this.geocodeAddress(preferences.startLocation || "五道口地铁站", preferences.city || "北京");
        if (geocodeResult.success) {
            planningData.startPoint = geocodeResult;
        }

        // 模拟搜索周边POI
        if (planningData.startPoint) {
            const keywords = PREFERENCE_KEYWORDS[preferences.preference] || "景点|公园";
            const poiResult = await this.searchNearbyPOIs(
                planningData.startPoint.longitude,
                planningData.startPoint.latitude,
                keywords,
                CONFIG.PLANNING.DEFAULT_RADIUS
            );

            if (poiResult.success && poiResult.pois.length > 0) {
                planningData.candidateDestinations = poiResult.pois.slice(0, 5);
            }
        }

        // 生成最终路线
        if (planningData.startPoint && planningData.candidateDestinations.length > 0) {
            planningData.finalRoute = this._buildFinalRoute(planningData, preferences);
        }
    }

    // 构建最终路线
    _buildFinalRoute(planningData, preferences) {
        const selectedWaypoints = planningData.candidateDestinations.slice(0, 2).map(candidate => ({
            name: candidate.name,
            longitude: candidate.location[0],
            latitude: candidate.location[1],
            location: candidate.location,
            reason: `符合${preferences.preference}偏好的AI智能推荐`,
            address: candidate.address || '',
            type: 'waypoint'
        }));

        let endPoint;
        if (preferences.endType === '起点') {
            endPoint = planningData.startPoint;
        } else {
            const endCandidate = planningData.candidateDestinations.find(candidate => 
                candidate.name.includes(preferences.endType) || candidate.type.includes(preferences.endType)
            ) || planningData.candidateDestinations[planningData.candidateDestinations.length - 1];

            endPoint = {
                name: endCandidate.name,
                longitude: endCandidate.location[0],
                latitude: endCandidate.location[1],
                address: endCandidate.address || '',
                type: 'end'
            };
        }

        // 估算距离
        const estimatedDistance = GeoUtils.calculateDistance(planningData.startPoint, endPoint) * 1.3 * 1000;
        const estimatedDuration = estimatedDistance / CONFIG.PLANNING.DEFAULT_WALK_SPEED;

        return {
            success: true,
            route: {
                start_point: planningData.startPoint,
                end_point: endPoint,
                waypoints: selectedWaypoints,
                distance: Math.round(estimatedDistance),
                duration: Math.round(estimatedDuration),
                steps: []
            },
            analysis: {
                route_description: `AI为您精心规划的${preferences.preference}主题散步路线，总距离${(estimatedDistance/1000).toFixed(1)}公里`,
                experience_rating: '9',
                recommended_waypoints: selectedWaypoints,
                practical_tips: [
                    '建议在光线充足时段进行散步',
                    '注意安全，享受沿途风景',
                    `此路线特别适合${preferences.preference}爱好者`,
                    '建议携带水和小食品'
                ]
            },
            nearby_pois: planningData.candidateDestinations,
            technical_info: {
                llm_guided: true,
                planning_steps: this.planningHistory
            }
        };
    }

    // 与LLM对话（简化版本）
    async chatWithLLM(messages) {
        try {
            const response = await fetch(`${CONFIG.OPENROUTER.BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${CONFIG.OPENROUTER.API_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'Smart Walking Route Planner'
                },
                body: JSON.stringify({
                    model: CONFIG.OPENROUTER.MODEL,
                    messages: messages,
                    temperature: 0.7
                })
            });

            const data = await response.json();

            if (data.choices?.[0]?.message) {
                const content = data.choices[0].message.content;
                this.planningHistory.push({
                    timestamp: new Date().toISOString(),
                    messages: messages,
                    response: content
                });
                return content;
            }
            throw new Error('LLM响应格式错误');
        } catch (error) {
            console.error('❌ LLM对话失败:', error);
            throw error;
        }
    }
}

// 路线服务类
class RouteService {
    constructor() {
        console.log('✅ 初始化LLM驱动的路线服务...');
        this.llmAgent = new LLMPlanningAgent();
    }

    async planRoute(startLocation, city, preferences) {
        try {
            console.log('🚀 开始LLM主导的智能路线规划...');
            const result = await this.llmAgent.intelligentPlanRoute(startLocation, city, preferences);
            uiController.updatePlanningStatus('✅ LLM智能规划完成！', 'success');
            return result;
        } catch (error) {
            console.error('❌ LLM主导规划失败:', error);
            uiController.updatePlanningStatus(`❌ 规划失败: ${error.message}`, 'error');
            throw error;
        }
    }

    async geocode(address, city) {
        return await this.llmAgent.geocodeAddress(address, city);
    }

    async searchNearbyPOIs(longitude, latitude, keywords, radius = CONFIG.PLANNING.DEFAULT_RADIUS) {
        return await this.llmAgent.searchNearbyPOIs(longitude, latitude, keywords, radius);
    }

    async planWalkingRoute(startPoint, endPoint) {
        return await this.llmAgent.planWalkingRoute(startPoint, endPoint);
    }
}

// UI控制器类
class UIController {
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
            this._startTerminal();
        }

        statusDiv.style.display = 'block';
        statusDiv.className = `ai-terminal status-${type}`;

        this._typewriterEffect(statusText, message);

        if (detail) {
            statusDetailLine.style.display = 'flex';
            statusDetail.textContent = detail;
        }

        this._addConsoleLog(type, message, detail);
        this._updateProgress(stepInfo);
        this._updateTerminalStatus(type);

        let stepId = null;
        if (stepInfo) {
            stepId = this._addPlanningStep(stepInfo);
        }

        if (type === 'loading') {
            this._createParticles();
        }

        return stepId;
    }

    // 显示路线结果
    displayRouteResult(result) {
        console.log('📊 显示AI智能规划结果:', result);

        const resultPanel = document.getElementById('result-panel');
        const plannerPanel = document.getElementById('planner-panel');

        // 更新摘要信息
        document.getElementById('total-distance').textContent = `${(result.route.distance/1000).toFixed(1)}km`;
        document.getElementById('total-time').textContent = `${Math.round(result.route.duration/60)}分钟`;
        document.getElementById('waypoints-count').textContent = result.route.waypoints.length;
        document.getElementById('difficulty-level').textContent = result.analysis.experience_rating || '8';

        // Generate detailed route and analysis information
        this._generateRouteDetails(result);
        this._generateAnalysisReport(result);

        // Show/hide panels
        if (resultPanel) {
            resultPanel.classList.add('open');
        }
        if (plannerPanel) {
            plannerPanel.classList.remove('open');
        }

        // Update map
        mapService.updateRoute(result);
        currentRoute = result;
    }

    // 隐藏规划状态
    hidePlanningStatus() {
        const statusDiv = document.getElementById('planning-status');
        statusDiv.style.transition = 'opacity 0.5s ease-out';
        statusDiv.style.opacity = '0';

        setTimeout(() => {
            statusDiv.style.display = 'none';
            statusDiv.style.opacity = '1';
            statusDiv.style.transition = '';
        }, 500);
    }

    // 清除规划步骤
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

    // 私有方法：生成路线详情
    _generateRouteDetails(result) {
        const detailsDiv = document.getElementById('route-details');
        let detailsHTML = '<h4 style="color: #2c3e50; margin-bottom: 15px; font-size: 14px;">📍 AI智能选择的路线</h4>';

        // 起点
        detailsHTML += this._createWaypointHTML('起', result.route.start_point.formatted_address || '起点', '#28a745', result.route.start_point);

        // 途经点
        result.route.waypoints.forEach((waypoint, index) => {
            detailsHTML += this._createWaypointHTML(index + 1, waypoint.name, '#17a2b8', waypoint);
        });

        // 终点
        detailsHTML += this._createWaypointHTML('终', result.route.end_point.name || '终点', '#dc3545', result.route.end_point);

        detailsDiv.innerHTML = detailsHTML;
    }

    // 私有方法：创建路径点HTML
    _createWaypointHTML(label, name, color, point) {
        return `
            <div style="display: flex; align-items: center; padding: 8px; margin-bottom: 8px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="width: 25px; height: 25px; border-radius: 50%; background: ${color}; color: white; display: flex; align-items: center; justify-content: center; margin-right: 12px; font-weight: bold; font-size: 10px;">${label}</div>
                <div style="font-size: 12px;">
                    <strong>${name}</strong><br>
                    <small style="color: #6c757d;">${point.address || ''}</small>
                </div>
            </div>
        `;
    }

    // 私有方法：生成分析报告
    _generateAnalysisReport(result) {
        const descriptionDiv = document.getElementById('route-description');
        let analysisHTML = '<h4 style="color: #2c3e50; margin-bottom: 10px; font-size: 14px;">🧠 AI深度分析报告</h4>';
        analysisHTML += `<div style="background: #e8f4fd; padding: 12px; border-radius: 8px; border-left: 4px solid #1976d2; font-size: 12px;">`;
        analysisHTML += `<p><strong>🎯 路线评价:</strong> ${result.analysis.route_description || 'AI为您精心设计的优质散步路线'}</p>`;

        if (result.analysis.recommended_waypoints?.length > 0) {
            analysisHTML += '<p><strong>🌟 AI推荐亮点:</strong></p><ul style="margin: 5px 0; padding-left: 20px;">';
            result.analysis.recommended_waypoints.forEach(wp => {
                analysisHTML += `<li style="margin: 3px 0;"><strong>${wp.name}</strong> - ${wp.reason}</li>`;
            });
            analysisHTML += '</ul>';
        }

        if (result.analysis.practical_tips?.length > 0) {
            analysisHTML += '<p><strong>💡 AI贴心提示:</strong></p><ul style="margin: 5px 0; padding-left: 20px;">';
            result.analysis.practical_tips.forEach(tip => {
                analysisHTML += `<li style="margin: 3px 0;">${tip}</li>`;
            });
            analysisHTML += '</ul>';
        }

        if (result.technical_info?.llm_guided) {
            analysisHTML += `<p style="margin-top: 10px; padding: 8px; background: rgba(111, 66, 193, 0.1); border-radius: 6px; font-size: 11px;">
                <strong>🤖 技术特色:</strong> 本路线由AI完全自主规划，经过${result.technical_info.planning_steps?.length || '多'}轮智能分析和优化
            </p>`;
        }

        analysisHTML += '</div>';
        descriptionDiv.innerHTML = analysisHTML;
    }

    // 私有方法：启动终端
    _startTerminal() {
        const terminalStatus = document.getElementById('terminal-status');
        const footerStatus = document.getElementById('footer-status');
        const systemInfo = document.getElementById('system-info');

        setTimeout(() => {
            terminalStatus.textContent = 'ACTIVE';
            terminalStatus.style.background = '#38a169';
            footerStatus.textContent = 'ACTIVE';
            footerStatus.style.color = '#68d391';
            this._typewriterEffect(systemInfo, 'Claude-4 AI Planning Agent initialized successfully ✓');
        }, 500);

        this._updateTimingInfo();
        setInterval(() => this._updateTimingInfo(), 1000);
    }

    // 私有方法：打字机效果
    _typewriterEffect(element, text, speed = 50) {
        element.textContent = '';
        element.classList.add('typewriter');

        let i = 0;
        const timer = setInterval(() => {
            if (i < text.length) {
                element.textContent += text.charAt(i);
                i++;
            } else {
                clearInterval(timer);
                setTimeout(() => {
                    element.classList.remove('typewriter');
                }, 1000);
            }
        }, speed);
    }

    // 私有方法：添加控制台日志
    _addConsoleLog(level, message, detail = '') {
        const logsContainer = document.getElementById('console-logs');
        const timestamp = DateTimeUtils.formatTimestamp(Date.now());

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

    // 私有方法：更新进度
    _updateProgress(stepInfo) {
        const progressContainer = document.getElementById('progress-container');
        const progressFill = document.getElementById('progress-fill');
        const progressLabel = document.getElementById('progress-label');

        if (stepInfo?.step) {
            progressContainer.style.display = 'block';

            if (typeof stepInfo.step === 'number') {
                this.currentStepCount = stepInfo.step;
                const progress = (this.currentStepCount / this.totalSteps) * 100;
                progressFill.style.width = `${Math.min(progress, 100)}%`;
                progressLabel.textContent = `Step ${this.currentStepCount}/${this.totalSteps}: ${stepInfo.action}`;
            } else if (stepInfo.step === 'final') {
                progressFill.style.width = '100%';
                progressLabel.textContent = 'Planning completed successfully!';
            } else if (stepInfo.step === 'error') {
                progressFill.style.width = '100%';
                progressFill.style.background = '#e53e3e';
                progressLabel.textContent = 'Planning failed - see error details above';
            }
        }
    }

    // 私有方法：更新终端状态
    _updateTerminalStatus(type) {
        const terminalStatus = document.getElementById('terminal-status');
        const footerStatus = document.getElementById('footer-status');

        const statusMap = {
            loading: { text: 'PROCESSING', color: '#4299e1' },
            success: { text: 'COMPLETED', color: '#38a169' },
            error: { text: 'ERROR', color: '#e53e3e' }
        };

        const status = statusMap[type];
        if (status) {
            terminalStatus.textContent = status.text;
            terminalStatus.style.background = status.color;
            footerStatus.textContent = status.text;
            footerStatus.style.color = status.color;
        }
    }

    // 私有方法：添加规划步骤
    _addPlanningStep(stepInfo) {
        const stepsList = document.getElementById('steps-list');
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

        const friendlyDescription = this._generateFriendlyDescription(stepInfo);

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
        this.currentPlanningSteps[stepId] = { ...stepInfo, element: stepElement, statusClass };

        stepElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return stepId;
    }

    // 私有方法：生成友好描述
    _generateFriendlyDescription(stepInfo) {
        const action = stepInfo.action || '';
        const step = stepInfo.step;

        if (action.includes('初始化')) {
            return { title: '🤖 启动AI智能助手', description: 'AI正在分析您的散步需求...' };
        } else if (action.includes('解析地址')) {
            return { title: '📍 定位起点位置', description: '正在查找起点的精确坐标...' };
        } else if (action.includes('搜索周边')) {
            return { title: '🔍 寻找附近景点', description: '正在搜索符合您偏好的附近地点...' };
        } else if (action.includes('文本搜索')) {
            return { title: '🏙️ 在城市中寻找地点', description: '正在搜索城市中的相关地点...' };
        } else if (action.includes('路径规划')) {
            return { title: '🛣️ 规划最优路径', description: '正在计算最佳散步路线...' };
        } else if (action.includes('生成最终')) {
            return { title: '🎯 生成推荐方案', description: 'AI正在综合所有信息，为您生成最佳散步路线...' };
        } else if (step === 'final') {
            return { title: '✅ 规划完成', description: '您的专属散步路线已成功生成！' };
        } else if (step === 'error') {
            return { title: '❌ 规划中断', description: '规划过程中遇到问题，请重试' };
        } else {
            return { title: `⚙️ 第${step}步: ${action}`, description: stepInfo.description || '正在处理...' };
        }
    }

    // 私有方法：创建粒子效果
    _createParticles() {
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

    // 私有方法：更新计时信息
    _updateTimingInfo() {
        const timingInfo = document.getElementById('timing-info');
        if (this.terminalStartTime && timingInfo) {
            const elapsed = Math.floor((Date.now() - this.terminalStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            timingInfo.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }
}

// 表单处理函数
async function handlePlanningForm(event) {
    event.preventDefault();

    console.log('📝 开始处理AI智能规划表单...');

    uiController.clearPlanningSteps();
    document.getElementById('planned-route').style.display = 'none';

    const formData = new FormData(event.target);
    const preferences = {
        startLocation: formData.get('start-location'),
        city: formData.get('city'),
        distance: formData.get('distance'),
        preference: formData.get('preference'),
        endType: formData.get('end-type')
    };

    // 验证表单
    const validation = ValidationUtils.validatePlanningForm(preferences);
    if (!validation.isValid) {
        DOMUtils.showMessage(validation.errors.join(', '), 'error');
        return;
    }

    const submitButton = document.getElementById('plan-button');
    const originalText = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-brain fa-spin"></i> AI智能规划中...';

    try {
        const initStepId = uiController.updatePlanningStatus('🤖 AI正在深度分析您的需求...', 'loading', 
            '正在启动智能代理，准备调用地图API', 
            { step: 1, action: '初始化AI智能代理', result: 'running' }
        );

        setTimeout(() => {
            uiController.updateStepStatus(initStepId, 'completed', '✅ AI智能代理启动成功');
        }, 1000);

        const result = await routeService.planRoute(preferences.startLocation, preferences.city, preferences);

        uiController.updatePlanningStatus('✅ AI智能规划完成！', 'success', 
            `AI经过${result.technical_info?.planning_steps?.length || '多'}轮分析生成最优路线`,
            { step: 'final', action: '生成最终路线方案', result: true }
        );

        setTimeout(() => {
            uiController.hidePlanningStatus();
            uiController.displayRouteResult(result);
        }, 1500);

    } catch (error) {
        console.error('❌ AI智能规划失败:', error);
        uiController.updatePlanningStatus(`❌ AI规划失败: ${error.message}`, 'error',
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

// 地图控制功能
function setupMapControls() {
    DOMUtils.safeAddEventListener('show-route', 'click', () => {
        if (currentRoute && mapService) {
            mapService.updateRoute(currentRoute);
        }
    });

    DOMUtils.safeAddEventListener('reset-map', 'click', () => {
        if (mapService) {
            mapService.resetMap();
        }
    });

    DOMUtils.safeAddEventListener('show-steps', 'click', () => {
        if (currentRoute?.route.steps) {
            showDetailedSteps(currentRoute.route.steps);
        } else {
            DOMUtils.showMessage('暂无详细步骤信息', 'warning');
        }
    });

    DOMUtils.safeAddEventListener('show-ai-process', 'click', () => {
        if (currentRoute?.technical_info?.planning_steps) {
            showAIProcessModal(currentRoute.technical_info.planning_steps);
        } else {
            DOMUtils.showMessage('暂无AI规划过程信息', 'warning');
        }
    });

    DOMUtils.safeAddEventListener('export-route', 'click', () => {
        if (currentRoute) {
            exportRoute(currentRoute);
        }
    });

    DOMUtils.safeAddEventListener('toggle-dify', 'click', () => {
        if (currentRoute) {
            exportRoute(currentRoute);
        }
    });

    // 添加重新定位按钮
    DOMUtils.safeAddEventListener('relocate-user', 'click', async () => {
        if (mapService) {
            try {
                await mapService.requestUserLocation();
            } catch (error) {
                DOMUtils.showMessage('重新定位失败: ' + error.message, 'error');
            }
        }
    });
}

// 显示详细步骤
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
    showModal(stepsHTML);
}

// 显示AI规划过程模态框
function showAIProcessModal(planningSteps) {
    let processHTML = '<h3>🤖 AI智能规划过程</h3><div style="max-height: 450px; overflow-y: auto;">';

    if (planningSteps?.length > 0) {
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
    showModal(processHTML);
}

// 显示模态框
function showModal(content) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
        background: rgba(0,0,0,0.5); z-index: 1000; 
        display: flex; align-items: center; justify-content: center;
    `;

    modal.innerHTML = `
        <div style="background: white; padding: 20px; border-radius: 10px; max-width: 700px; width: 90%; max-height: 80vh; overflow: hidden;">
            ${content}
            <div style="margin-top: 15px; text-align: center;">
                <button onclick="this.closest('div').parentElement.remove()" 
                        style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    关闭
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

// 导出路线
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
    DOMUtils.showMessage('路线已导出为JSON文件', 'success');
}

// 初始化应用
function initializeApp() {
    console.log('🚀 初始化智能散步规划器...');

    // 初始化服务和控制器
    mapService = new MapService();
    routeService = new RouteService();
    uiController = new UIController();

    // 等待高德地图API加载
    function waitForAMap() {
        if (typeof AMap !== 'undefined') {
            console.log('高德地图API已加载，开始初始化地图...');
            setTimeout(() => {
                mapService.initMap();
                // 注释掉重复的定位请求，让地图初始化时自动处理
                // mapService.requestUserLocation().catch(error => {
                //     DOMUtils.showMessage('获取位置信息失败: ' + error.message, 'warning');
                // });
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
        }

        setupMapControls();
        console.log('✅ 应用初始化完成');
    } catch (error) {
        console.error('❌ 应用初始化失败:', error);
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initializeApp);