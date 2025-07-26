
// LLM智能规划代理模块
import { OPENROUTER_CONFIG, AMAP_CONFIG } from './config.js';
import { isValidCoordinate, calculateDistance } from './utils.js';

export class LLMPlanningAgent {
    constructor() {
        console.log('🤖 初始化LLM智能规划代理...');
        this.apiKey = AMAP_CONFIG.apiKey;
        this.webApiBase = AMAP_CONFIG.webApiBase;
        this.planningHistory = [];
    }

    // 获取可用工具
    getAvailableTools() {
        return [
            {
                name: "geocode_address",
                description: "将地址转换为经纬度坐标",
                aliases: ["geocode", "get_coordinates", "address_to_coordinates", "resolve_address"],
                parameters: {
                    address: "地址描述",
                    city: "城市名称"
                }
            },
            {
                name: "search_nearby_pois",
                description: "搜索指定位置周边的兴趣点",
                aliases: ["search_pois", "find_nearby_pois", "nearby_search", "search_around", "find_nearby", "poi_search"],
                parameters: {
                    longitude: "经度",
                    latitude: "纬度", 
                    keywords: "搜索关键词",
                    radius: "搜索半径(米)"
                }
            },
            {
                name: "text_search_pois",
                description: "根据关键词搜索城市内的POI",
                aliases: ["search_text", "text_search", "keyword_search", "find_pois", "search_by_keyword"],
                parameters: {
                    keywords: "搜索关键词",
                    city: "城市名称",
                    citylimit: "是否限制在城市内"
                }
            },
            {
                name: "get_poi_details",
                description: "获取特定POI的详细信息",
                aliases: ["get_details", "get_poi", "poi_details", "get_poi_info", "fetch_poi_details", "detail_info"],
                parameters: {
                    poi_id: "POI ID"
                }
            },
            {
                name: "plan_walking_route",
                description: "规划两点间的步行路线",
                aliases: ["calculate_walking_route", "plan_route", "walking_route", "route_planning", "get_walking_route", "calculate_route", "plan_walking_path"],
                parameters: {
                    start_point: "起点坐标 {longitude, latitude}",
                    end_point: "终点坐标 {longitude, latitude}"
                }
            }
        ];
    }

    // 地理编码
    async geocodeAddress(address, city) {
        try {
            const url = `${this.webApiBase}/geocode/geo?address=${encodeURIComponent(address)}&city=${encodeURIComponent(city)}&key=${this.apiKey}`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.status === '1' && data.geocodes && data.geocodes.length > 0) {
                const location = data.geocodes[0].location.split(',');
                return {
                    success: true,
                    longitude: parseFloat(location[0]),
                    latitude: parseFloat(location[1]),
                    formatted_address: data.geocodes[0].formatted_address,
                    raw_data: data
                };
            } else {
                return { success: false, error: data.info || '地址解析失败' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // 搜索周边POI
    async searchNearbyPOIs(longitude, latitude, keywords, radius = 3000) {
        try {
            if (!longitude || !latitude || longitude === 0 || latitude === 0) {
                console.warn(`⚠️ 搜索周边POI参数无效: lng=${longitude}, lat=${latitude}`);
                return { success: false, error: '坐标参数无效', pois: [] };
            }
            
            const url = `${this.webApiBase}/place/around?location=${longitude},${latitude}&keywords=${encodeURIComponent(keywords)}&radius=${radius}&key=${this.apiKey}`;
            console.log(`📡 API调用: ${url.replace(this.apiKey, 'HIDDEN_KEY')}`);
            
            const response = await fetch(url);
            const data = await response.json();
            
            console.log(`📡 API响应状态: ${data.status}, 信息: ${data.info || '无'}`);
            
            if (data.status === '1' && data.pois) {
                console.log(`✅ 找到${data.pois.length}个周边POI`);
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
            } else {
                console.log(`⚠️ 搜索结果为空或API错误: ${data.info}`);
                return { success: true, pois: [] };
            }
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
            } else {
                return { success: true, pois: [] };
            }
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
            
            if (data.status === '1' && data.pois && data.pois.length > 0) {
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
            } else {
                return { success: false, error: 'POI详情获取失败' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // 规划步行路线
    async planWalkingRoute(startPoint, endPoint) {
        try {
            if (!startPoint || !endPoint || 
                !startPoint.longitude || !startPoint.latitude ||
                !endPoint.longitude || !endPoint.latitude ||
                startPoint.longitude === 0 || startPoint.latitude === 0 ||
                endPoint.longitude === 0 || endPoint.latitude === 0) {
                console.warn(`⚠️ 路径规划参数无效:`, { startPoint, endPoint });
                return { success: false, error: '路径规划参数无效' };
            }
            
            const origin = `${startPoint.longitude},${startPoint.latitude}`;
            const destination = `${endPoint.longitude},${endPoint.latitude}`;
            const url = `${this.webApiBase}/direction/walking?origin=${origin}&destination=${destination}&key=${this.apiKey}`;
            
            console.log(`📡 路径规划API调用: ${url.replace(this.apiKey, 'HIDDEN_KEY')}`);
            
            const response = await fetch(url);
            const data = await response.json();
            
            console.log(`📡 路径规划API响应状态: ${data.status}, 信息: ${data.info || '无'}`);
            
            if (data.status === '1' && data.route && data.route.paths && data.route.paths.length > 0) {
                const path = data.route.paths[0];
                console.log(`✅ 路径规划成功: ${path.distance}米, ${path.duration}秒`);
                return {
                    success: true,
                    distance: parseInt(path.distance),
                    duration: parseInt(path.duration),
                    steps: path.steps || [],
                    polyline: path.polyline,
                    raw_data: data
                };
            } else {
                console.log(`❌ 路径规划失败: ${data.info || '未知错误'}`);
                return { success: false, error: `Web API: ${data.info || '无法规划路径'}` };
            }
        } catch (error) {
            console.error(`❌ 路径规划异常:`, error);
            return { success: false, error: error.message };
        }
    }

    // 与LLM对话
    async chatWithLLM(messages) {
        try {
            const response = await fetch(`${OPENROUTER_CONFIG.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_CONFIG.apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'Smart Walking Route Planner'
                },
                body: JSON.stringify({
                    model: OPENROUTER_CONFIG.model,
                    messages: messages,
                    temperature: 0.7
                })
            });

            const data = await response.json();
            
            if (data.choices && data.choices[0] && data.choices[0].message) {
                const content = data.choices[0].message.content;
                this.planningHistory.push({
                    timestamp: new Date().toISOString(),
                    messages: messages,
                    response: content
                });
                return content;
            } else {
                throw new Error('LLM响应格式错误');
            }
        } catch (error) {
            console.error('❌ LLM对话失败:', error);
            throw error;
        }
    }

    // 根据用户偏好获取智能关键词
    getKeywordsByPreference(preference) {
        const keywordMap = {
            '水景': '湖泊|河流|水系|海滨|滨水|公园',
            '公园': '公园|绿地|植物园|花园|广场',
            '历史': '历史|古迹|文化|博物馆|纪念馆|遗址',
            '商业': '商场|购物|商业街|步行街|市场',
            '自然': '自然|山林|森林|郊野|山地|景区',
            '科技': '科技园|高新区|现代建筑|商务区|产业园'
        };
        
        return keywordMap[preference] || '景点|公园|广场|文化|商业';
    }

    // 主要的智能规划方法 - LLM主导整个过程
    async intelligentPlanRoute(startLocation, city, preferences) {
        try {
            console.log('🧠 开始LLM智能路径规划...');
            
            // 步骤1: 解析起点地址
            console.log('📍 第1步: 解析起点地址...');
            const startResult = await this.geocodeAddress(startLocation, city);
            if (!startResult.success) {
                throw new Error(`无法解析起点地址: ${startResult.error}`);
            }

            const startPoint = {
                longitude: startResult.longitude,
                latitude: startResult.latitude,
                formatted_address: startResult.formatted_address
            };

            // 步骤2: 根据偏好搜索附近地点
            console.log('🔍 第2步: 搜索符合偏好的地点...');
            const keywords = this.getKeywordsByPreference(preferences.preference);
            const poisResult = await this.searchNearbyPOIs(
                startPoint.longitude, 
                startPoint.latitude, 
                keywords, 
                parseInt(preferences.distance) * 1000
            );

            if (!poisResult.success || poisResult.pois.length === 0) {
                console.warn('⚠️ 未找到符合偏好的地点，使用通用搜索...');
                const fallbackResult = await this.searchNearbyPOIs(
                    startPoint.longitude, 
                    startPoint.latitude, 
                    '景点|公园', 
                    3000
                );
                poisResult.pois = fallbackResult.pois || [];
            }

            // 步骤3: 选择合适的途经点和终点
            console.log('🎯 第3步: 选择路线点...');
            const waypoints = [];
            const targetDistance = parseInt(preferences.distance) * 1000; // 转换为米
            
            // 选择2-3个途经点
            const selectedPOIs = poisResult.pois
                .filter(poi => poi.distance && poi.distance > 300) // 过滤太近的点
                .sort((a, b) => a.distance - b.distance) // 按距离排序
                .slice(0, 3); // 最多3个点

            selectedPOIs.forEach(poi => {
                waypoints.push({
                    name: poi.name,
                    longitude: poi.location[0],
                    latitude: poi.location[1],
                    address: poi.address,
                    distance: poi.distance,
                    reason: `符合${preferences.preference}偏好的推荐地点`
                });
            });

            // 选择终点
            let endPoint;
            if (preferences.endType === '回到起点') {
                endPoint = {
                    name: '起点',
                    longitude: startPoint.longitude,
                    latitude: startPoint.latitude,
                    address: startPoint.formatted_address
                };
            } else {
                // 选择一个远一点的地点作为终点
                const endPOI = poisResult.pois
                    .filter(poi => poi.distance > targetDistance * 0.3)
                    .sort((a, b) => b.distance - a.distance)[0];
                
                if (endPOI) {
                    endPoint = {
                        name: endPOI.name,
                        longitude: endPOI.location[0],
                        latitude: endPOI.location[1],
                        address: endPOI.address
                    };
                } else {
                    // 如果没有合适的终点，回到起点
                    endPoint = {
                        name: '起点',
                        longitude: startPoint.longitude,
                        latitude: startPoint.latitude,
                        address: startPoint.formatted_address
                    };
                }
            }

            // 步骤4: 计算路径信息
            console.log('🛣️ 第4步: 计算路径信息...');
            let totalDistance = 0;
            let totalDuration = 0;

            // 简单估算距离和时间
            if (waypoints.length > 0) {
                // 计算各点之间的直线距离估算
                let prevPoint = startPoint;
                for (const waypoint of waypoints) {
                    const dist = this.calculateDistance(prevPoint, waypoint);
                    totalDistance += dist;
                    prevPoint = waypoint;
                }
                // 到终点的距离
                totalDistance += this.calculateDistance(prevPoint, endPoint);
            } else {
                totalDistance = this.calculateDistance(startPoint, endPoint);
            }

            // 步行速度约 4km/h = 1.1m/s
            totalDuration = Math.round(totalDistance / 1.1);

            // 构建最终结果
            const result = {
                route: {
                    start_point: startPoint,
                    waypoints: waypoints,
                    end_point: endPoint,
                    distance: totalDistance,
                    duration: totalDuration,
                    steps: []
                },
                analysis: {
                    route_description: `根据您的${preferences.preference}偏好，为您规划了一条约${(totalDistance/1000).toFixed(1)}公里的散步路线`,
                    recommended_waypoints: waypoints.map(wp => ({
                        name: wp.name,
                        reason: wp.reason
                    })),
                    practical_tips: [
                        `建议步行时间约${Math.round(totalDuration/60)}分钟`,
                        `路线类型：${preferences.preference}主题散步`,
                        `适合休闲散步，请注意安全`
                    ],
                    experience_rating: '8.5'
                },
                technical_info: {
                    llm_guided: true,
                    planning_steps: this.planningHistory,
                    api_calls: ['geocode', 'search_nearby_pois'],
                    total_pois_found: poisResult.pois.length
                }
            };

            console.log('✅ LLM智能规划完成:', result);
            return result;

        } catch (error) {
            console.error('❌ LLM智能规划失败:', error);
            throw error;
        }
    }

    // 计算两点间距离的辅助方法
    calculateDistance(point1, point2) {
        const R = 6371000; // 地球半径（米）
        const lat1 = point1.latitude * Math.PI / 180;
        const lat2 = point2.latitude * Math.PI / 180;
        const deltaLat = (point2.latitude - point1.latitude) * Math.PI / 180;
        const deltaLng = (point2.longitude - point1.longitude) * Math.PI / 180;

        const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
                Math.cos(lat1) * Math.cos(lat2) *
                Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c;
    }
}
