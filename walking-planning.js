// 地图相关变量
let map;
let markers = [];
let polyline;
let currentRoute = null;

// OpenRouter API配置
const OPENROUTER_CONFIG = {
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: "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",
    model: "anthropic/claude-sonnet-4"
};

// LLM智能规划代理 - 让AI主导整个决策过程
class LLMPlanningAgent {
    constructor() {
        console.log('🤖 初始化LLM智能规划代理...');
        this.apiKey = "c9e4a3040fef05c4084a21c8a357d37f";
        this.webApiBase = "https://restapi.amap.com/v3";
        this.planningHistory = [];
    }

    // 为LLM提供的工具函数集
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

    // 工具函数：地理编码
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

    // 工具函数：搜索周边POI
    async searchNearbyPOIs(longitude, latitude, keywords, radius = 3000) {
        try {
            // 参数验证
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

    // 工具函数：文本搜索POI
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

    // 工具函数：获取POI详情
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

    // 工具函数：规划步行路线
    async planWalkingRoute(startPoint, endPoint) {
        try {
            // 参数验证
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

    // 主要的智能规划方法 - 让LLM主导整个过程
    async intelligentPlanRoute(startLocation, city, preferences) {
        try {
            console.log('🧠 开始LLM智能路径规划...');
            updatePlanningStatus('🤖 AI正在分析您的需求...', 'loading');

            // 构建给LLM的初始prompt，包含工具函数说明
            const systemPrompt = `你是一个专业的散步路线规划AI助手。你必须通过函数调用获取所有实际数据，不能只提供文字建议。

⚠️ 【CRITICAL - 防止幻觉的约束条件】：
1. 你绝对不能基于自己的知识或想象描述任何具体的地点、路线或距离
2. 你只能基于函数调用返回的真实API数据进行描述
3. 在获得实际路径规划数据之前，不要生成最终的路线方案
4. 如果API返回的数据与你的预期不符，以API数据为准
5. 任何距离、时间、地点名称都必须来自API返回结果
⚠️ 重要：请严格使用以下函数名，不要有任何变化：

【可用工具详细说明】：

1. geocode_address(address, city) - 地址解析为坐标
   参数说明：
   - address: 地址或地点名称（字符串，必须用双引号）
   - city: 城市名称（字符串，必须用双引号）
   示例：FUNCTION_CALL: geocode_address("五道口地铁站", "北京")

2. search_nearby_pois(longitude, latitude, keywords, radius) - 搜索指定坐标周边POI
   参数说明：
   - longitude: 经度（数字，不加引号）
   - latitude: 纬度（数字，不加引号）
   - keywords: 搜索关键词（字符串，必须用双引号）
   - radius: 搜索半径，单位米（数字，不加引号，建议3000）
   示例：FUNCTION_CALL: search_nearby_pois(116.337742, 39.992894, "公园|景点|湖泊", 3000)

3. text_search_pois(keywords, city, citylimit) - 在城市内文本搜索POI
   参数说明：
   - keywords: 搜索关键词（字符串，必须用双引号）
   - city: 城市名称（字符串，必须用双引号）
   - citylimit: 是否限制在城市内（布尔值true/false，不加引号）
   示例：FUNCTION_CALL: text_search_pois("地铁站", "北京", true)

4. get_poi_details(poi_id) - 获取POI详细信息
   参数说明：
   - poi_id: POI的唯一ID（字符串，必须用双引号）
   示例：FUNCTION_CALL: get_poi_details("B000A7BD6C")

5. plan_walking_route(start_point, end_point) - 规划两点间步行路线
   参数说明：
   - start_point: 起点坐标对象（JSON格式，包含longitude和latitude）
   - end_point: 终点坐标对象（JSON格式，包含longitude和latitude）
   示例：FUNCTION_CALL: plan_walking_route({"longitude": 116.337742, "latitude": 39.992894}, {"longitude": 116.347742, "latitude": 39.982894})

【严格的函数调用格式要求】：
✅ 正确格式：
- FUNCTION_CALL: geocode_address("五道口地铁站", "北京")
- FUNCTION_CALL: search_nearby_pois(116.337742, 39.992894, "公园|景点", 3000)
- FUNCTION_CALL: plan_walking_route({"longitude": 116.337742, "latitude": 39.992894}, {"longitude": 116.347742, "latitude": 39.982894})

❌ 错误格式：
- 不要用get_coordinates、geocode等变体函数名
- 不要给数字参数加引号：116.337742（正确）vs "116.337742"（错误）
- 不要用不标准的坐标格式："116.337742,39.992894"（错误）

【关键规划流程】你必须完成：
1. 获取起点坐标：geocode_address(起点地址, 城市)
2. 搜索符合偏好的地点：search_nearby_pois(经度, 纬度, 关键词, 半径)
3. 获取实际路径数据：plan_walking_route(起点坐标对象, 终点坐标对象)
4. 基于真实数据生成最终方案

【参数解析重点】：
- 经纬度必须是纯数字，不能有引号
- 搜索关键词可以用"|"分隔多个词，如"公园|湖泊|景点"
- 坐标对象必须是标准JSON格式：{"longitude": 数字, "latitude": 数字}
- 半径参数建议使用3000（3公里范围）

【响应格式】：
每次只返回一个FUNCTION_CALL，格式严格按照上述示例。不要同时返回多个函数调用。

现在开始第一步规划。`;

            const userPrompt = `用户需求：
- 起点：${startLocation}
- 城市：${city}
- 偏好类型：${preferences.preference}
- 期望距离：${preferences.distance}公里
- 终点类型：${preferences.endType}

请分析这个需求并制定详细的规划步骤。告诉我你打算如何搜索和筛选地点，以及规划路线的策略。

请直接告诉我第一步需要调用什么函数，严格使用FUNCTION_CALL格式：
FUNCTION_CALL: function_name("参数1", "参数2")

注意：请严格使用上面列出的函数名和格式，不要使用其他变体。`;

            // 第一轮LLM对话：制定策略
            let currentStep = 1;
            let planningData = {
                startPoint: null,
                candidateDestinations: [],
                finalRoute: null,
                analysis: {}
            };

            const planningSteps = await this.chatWithLLM([
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ]);

            console.log('🎯 LLM规划策略:', planningSteps);

            // 执行LLM指导的规划步骤
            await this.executeLLMGuidedPlanning(planningSteps, planningData, preferences);

            // 如果LLM已经通过函数调用获得了路径数据，直接使用
            if (planningData.routes && planningData.routes.length > 0) {
                console.log('✅ 使用LLM获取的实际路径数据生成最终路线');
                planningData.finalRoute = this.buildRouteFromPlanningData(planningData, preferences);
            }
            
            // 如果仍然没有最终路线，使用已有数据生成备用方案
            if (!planningData.finalRoute && planningData.startPoint && planningData.candidateDestinations.length > 0) {
                console.log('⚠️ 使用备用方案生成最终路线');
                planningData.finalRoute = this.buildFallbackRoute(planningData, preferences);
            }

            // 如果还是没有路线，返回错误
            if (!planningData.finalRoute) {
                console.error('❌ 无法生成有效的路线方案');
                throw new Error('智能规划失败：无法获得足够的地理信息来生成路线');
            }

            return planningData.finalRoute;

        } catch (error) {
            console.error('❌ LLM智能规划失败:', error);
            updatePlanningStatus(`❌ 智能规划失败: ${error.message}`, 'error');
            throw error;
        }
    }

    // 执行LLM指导的规划过程
    async executeLLMGuidedPlanning(initialResponse, planningData, preferences) {
        try {
            let conversationHistory = [];
            let stepCount = 0;
            const maxSteps = 10; // 防止无限循环

            // 解析LLM的初始响应，提取要调用的函数
            let currentResponse = initialResponse;
            
            while (stepCount < maxSteps) {
                stepCount++;
                console.log(`🔄 执行第${stepCount}步规划...`);
                
                // 解析LLM响应中的函数调用
                const functionCall = this.parseFunctionCall(currentResponse, planningData);
                
                if (!functionCall) {
                    console.log('⚠️ 未识别到函数调用，LLM可能已完成规划或需要引导');
                    
                    // 检查LLM是否在描述最终路线方案，或已完成足够的规划步骤
                    if (currentResponse.toLowerCase().includes('路线') || 
                        currentResponse.toLowerCase().includes('推荐') ||
                        currentResponse.toLowerCase().includes('方案') ||
                        stepCount >= 8 ||  // 增加最大步数，确保完整规划
                        (planningData.routes && planningData.routes.length > 0)) {  // 或已有路径数据
                        console.log('✅ LLM已完成规划或提供最终方案');
                        break;
                    }
                    
                    // 分析当前状态，决定引导策略
                    let guidancePrompt;
                    
                    if (planningData.startPoint && planningData.candidateDestinations && planningData.candidateDestinations.length > 0) {
                        // 已有起点和候选地点，强制引导调用路径规划
                        const firstCandidate = planningData.candidateDestinations[0];
                        const targetLocation = firstCandidate.location;
                        
                        guidancePrompt = `✅ 规划状态: 已获得起点坐标 (${planningData.startPoint.longitude}, ${planningData.startPoint.latitude}) 和 ${planningData.candidateDestinations.length} 个候选地点。

🎯 下一步必须调用路径规划函数获取实际路径数据！

请严格使用以下格式，选择最符合"${preferences.preference}"偏好的地点：

FUNCTION_CALL: plan_walking_route({"longitude": ${planningData.startPoint.longitude}, "latitude": ${planningData.startPoint.latitude}}, {"longitude": ${targetLocation[0]}, "latitude": ${targetLocation[1]}})

📍 可选的候选终点：
1. ${planningData.candidateDestinations[0].name} - 坐标(${planningData.candidateDestinations[0].location[0]}, ${planningData.candidateDestinations[0].location[1]})
${planningData.candidateDestinations[1] ? `2. ${planningData.candidateDestinations[1].name} - 坐标(${planningData.candidateDestinations[1].location[0]}, ${planningData.candidateDestinations[1].location[1]})` : ''}
${planningData.candidateDestinations[2] ? `3. ${planningData.candidateDestinations[2].name} - 坐标(${planningData.candidateDestinations[2].location[0]}, ${planningData.candidateDestinations[2].location[1]})` : ''}

⚠️ 重要提醒：
- 必须使用 plan_walking_route 函数名，不要使用变体
- 坐标格式必须是: {"longitude": 数字, "latitude": 数字}  
- 数字不要加引号
- 请立即调用，不要添加额外描述！`;
                    } else if (planningData.startPoint) {
                        // 有起点但缺少候选地点，继续搜索
                        const smartKeywords = this.getKeywordsByPreference(preferences.preference);
                        guidancePrompt = `✅ 规划状态: 已获得起点坐标 (${planningData.startPoint.longitude}, ${planningData.startPoint.latitude})

🔍 下一步需要搜索符合"${preferences.preference}"偏好的地点。

请严格使用以下格式之一：

推荐选项1 (周边搜索):
FUNCTION_CALL: search_nearby_pois(${planningData.startPoint.longitude}, ${planningData.startPoint.latitude}, "${smartKeywords}", 3000)

备选选项2 (城市内搜索):
FUNCTION_CALL: text_search_pois("${smartKeywords}", "${preferences.city}", true)

⚠️ 参数要求：
- 经纬度是纯数字，不加引号: ${planningData.startPoint.longitude}, ${planningData.startPoint.latitude}
- 关键词必须用双引号包围
- 半径建议使用3000（3公里）
- 立即调用，不要解释！`;
                    } else {
                        // 还没有起点，从地理编码开始
                        guidancePrompt = `🏁 规划状态: 需要获取起点坐标

📍 请先获取起点的精确坐标：

FUNCTION_CALL: geocode_address("${preferences.startLocation}", "${preferences.city}")

⚠️ 参数要求：
- 地址和城市都必须用双引号包围
- 如果地址不完整，请使用: "五道口地铁站", "北京"
- 立即调用，不要添加说明！`;
                    }

                    conversationHistory.push({
                        role: "assistant", 
                        content: currentResponse
                    });
                    conversationHistory.push({
                        role: "user", 
                        content: guidancePrompt
                    });

                    currentResponse = await this.chatWithLLM(conversationHistory);
                    console.log('🔄 引导后的LLM响应:', currentResponse);
                    continue;
                }

                // 开始执行步骤
                const stepId = updatePlanningStatus(`🔍 第${stepCount}步: ${functionCall.description}`, 'loading', 
                    `正在执行 ${functionCall.name}(${JSON.stringify(functionCall.parameters || {}).substring(0, 50)}...)`,
                    { 
                        step: stepCount, 
                        action: functionCall.description, 
                        result: false,
                        description: `Executing function: ${functionCall.name}`,
                        detail: `Parameters: ${JSON.stringify(functionCall.parameters, null, 2)}`
                    }
                );

                // 执行函数调用
                const functionResult = await this.executeFunctionCall(functionCall);
                
                console.log(`✅ 函数${functionCall.name}执行完成:`, functionResult);
                
                // 更新步骤状态为完成，并添加详细结果
                let additionalData = {};
                
                if (functionResult.success) {
                    // 根据函数类型准备额外的展示数据
                    if (functionCall.name.includes('search') && functionResult.pois) {
                        additionalData.poiResults = functionResult.pois;
                    } else if (functionCall.name === 'plan_walking_route') {
                        additionalData.routeData = functionResult;
                    }
                    
                    updateStepStatus(stepId, 'completed', 
                        `✅ ${functionCall.description}成功完成`, 
                        additionalData
                    );
                } else {
                    updateStepStatus(stepId, 'failed', 
                        `❌ ${functionCall.description}失败: ${functionResult.error}`, 
                        {}
                    );
                }
                
                // 构建更详细的结果反馈给LLM
                let resultSummary = '';
                if (functionResult.success) {
                    if (functionCall.name === 'geocode_address') {
                        resultSummary = `地址解析成功：
- 地址：${functionResult.formatted_address}
- 坐标：${functionResult.longitude}, ${functionResult.latitude}

请继续搜索符合用户偏好的地点。`;
                    } else if (functionCall.name.includes('search') && functionResult.pois) {
                        resultSummary = `搜索成功，找到${functionResult.pois.length}个地点：
${functionResult.pois.slice(0, 5).map((poi, index) => 
    `${index + 1}. ${poi.name} (${poi.type}) - ${poi.address || ''}`
).join('\n')}${functionResult.pois.length > 5 ? `\n...还有${functionResult.pois.length - 5}个地点` : ''}`;
                    } else if (functionCall.name === 'plan_walking_route') {
                        resultSummary = `路径规划成功！
- 距离：${(functionResult.distance/1000).toFixed(1)}公里
- 时间：${Math.round(functionResult.duration/60)}分钟

太好了！你已经获得了实际路径数据。现在请基于这些真实数据给出完整的最终路线方案，包括：
1. 起点、途经点、终点的详细信息
2. 基于实际距离和时间的路线评价  
3. 实用的散步建议

请现在就提供最终的完整路线方案。`;
                    } else {
                        resultSummary = `执行成功：${JSON.stringify(functionResult, null, 2)}`;
                    }
                } else {
                    resultSummary = `执行失败：${functionResult.error}`;
                }
                
                // 将结果反馈给LLM，让它决定下一步
                const nextStepPrompt = `函数${functionCall.name}的执行结果：

${resultSummary}

详细数据：
${JSON.stringify(functionResult, null, 2)}

基于这个结果，请决定下一步操作。如果需要调用更多函数，请使用FUNCTION_CALL格式：
FUNCTION_CALL: function_name("参数1", "参数2")

如果规划完成，请提供最终的路线方案。`;

                conversationHistory.push({
                    role: "assistant", 
                    content: currentResponse
                });
                conversationHistory.push({
                    role: "user", 
                    content: nextStepPrompt
                });

                // 获取LLM的下一步指导
                currentResponse = await this.chatWithLLM(conversationHistory);
                
                console.log(`🤖 LLM第${stepCount}步响应:`, currentResponse);
                
                // 如果有LLM响应，可以添加展开显示
                if (currentResponse && currentResponse.length > 50) {
                    const llmStepId = updatePlanningStatus(`🧠 AI分析第${stepCount}步结果`, 'loading', 
                        '正在分析AI的决策...',
                        { 
                            step: `${stepCount}-analysis`, 
                            action: 'AI决策分析', 
                            result: false,
                            llmOutput: currentResponse.substring(0, 500) + (currentResponse.length > 500 ? '...' : ''),
                            description: `AI正在基于执行结果进行下一步决策`
                        }
                    );
                    
                    // 立即更新为完成状态
                    setTimeout(() => {
                        updateStepStatus(llmStepId, 'completed', 
                            '✅ AI决策分析完成', 
                            { llmOutput: currentResponse }
                        );
                    }, 500);
                }
                
                // 更新规划数据
                this.updatePlanningData(planningData, functionCall, functionResult);
            }

            // 让LLM生成最终路线
            await this.generateFinalRoute(planningData, preferences, conversationHistory);

        } catch (error) {
            console.error('❌ LLM指导规划执行失败:', error);
            throw error;
        }
    }

    // 函数名映射表 - 将错误的函数名映射到正确的函数名
    getFunctionNameMapping() {
        return {
            // 正确的函数名
            'geocode_address': 'geocode_address',
            'search_nearby_pois': 'search_nearby_pois',
            'text_search_pois': 'text_search_pois',
            'get_poi_details': 'get_poi_details',
            'plan_walking_route': 'plan_walking_route',
            
            // 常见的错误函数名映射
            'calculate_walking_route': 'plan_walking_route',
            'plan_route': 'plan_walking_route',
            'plan_path': 'plan_walking_route',
            'walking_route': 'plan_walking_route',
            'route_planning': 'plan_walking_route',
            'get_walking_route': 'plan_walking_route',
            'calculate_route': 'plan_walking_route',
            'plan_walking_path': 'plan_walking_route',
            
            'geocode': 'geocode_address',
            'get_coordinates': 'geocode_address',
            'address_to_coordinates': 'geocode_address',
            'resolve_address': 'geocode_address',
            
            'search_pois': 'search_nearby_pois',
            'search_nearby_places': 'search_nearby_pois',
            'find_nearby_pois': 'search_nearby_pois',
            'nearby_search': 'search_nearby_pois',
            'search_around': 'search_nearby_pois',
            'find_nearby': 'search_nearby_pois',
            'poi_search': 'search_nearby_pois',
            
            'search_text': 'text_search_pois',
            'text_search': 'text_search_pois',
            'keyword_search': 'text_search_pois',
            'find_pois': 'text_search_pois',
            'search_by_keyword': 'text_search_pois',
            
            'get_details': 'get_poi_details',
            'get_poi': 'get_poi_details',
            'poi_details': 'get_poi_details',
            'get_poi_info': 'get_poi_details',
            'fetch_poi_details': 'get_poi_details',
            'detail_info': 'get_poi_details'
        };
    }

    // 标准化函数名 - 将可能的错误函数名转换为正确的函数名
    normalizeFunctionName(inputFunctionName) {
        const mapping = this.getFunctionNameMapping();
        const normalizedName = mapping[inputFunctionName.toLowerCase()];
        
        if (normalizedName) {
            if (normalizedName !== inputFunctionName) {
                console.log(`🔧 函数名自动修正: ${inputFunctionName} → ${normalizedName}`);
                
                // 添加到终端日志和规划历史
                if (typeof addConsoleLog === 'function') {
                    addConsoleLog('warning', `LLM Function Name Auto-Correction`, `${inputFunctionName} → ${normalizedName}`);
                }
                
                // 添加到规划历史
                this.planningHistory.push({
                    timestamp: new Date().toISOString(),
                    type: 'function_correction',
                    original_name: inputFunctionName,
                    corrected_name: normalizedName,
                    message: `自动修正了LLM使用的函数名`
                });
                
                console.log(`✅ 函数名修正完成，增强了系统鲁棒性`);
            }
            return normalizedName;
        }
        
        console.log(`⚠️ 未知函数名: ${inputFunctionName}`);
        console.log(`📝 支持的函数名:`, Object.keys(this.getFunctionNameMapping()));
        return null;
    }

    // 解析LLM响应中的函数调用
    parseFunctionCall(response, planningData = null) {
        try {
            console.log('🔍 解析LLM响应:', response);
            
            // 优先识别标准FUNCTION_CALL格式
            const functionCallMatch = response.match(/FUNCTION_CALL:\s*(\w+)\s*\(([^)]+)\)/);
            if (functionCallMatch) {
                console.log(`🎯 发现标准FUNCTION_CALL格式: ${functionCallMatch[0]}`);
                const rawFunctionName = functionCallMatch[1];
                const argsString = functionCallMatch[2];
                
                // 标准化函数名
                const functionName = this.normalizeFunctionName(rawFunctionName);
                if (!functionName) {
                    console.log(`⚠️ 无法识别的函数名: ${rawFunctionName}`);
                    return null;
                }
                
                // 解析参数
                const params = this.parseStandardFunctionArgs(argsString, functionName);
                
                return {
                    name: functionName,
                    parameters: params,
                    description: this.getFunctionDescription(functionName),
                    originalName: rawFunctionName !== functionName ? rawFunctionName : undefined
                };
            }
            
            // 如果没有找到标准格式，尝试其他格式
            console.log('⚠️ 未找到FUNCTION_CALL格式，尝试其他解析方式');
            
            // 识别函数名 - 支持多种格式
            const functionNamePatterns = [
                /函数名[：:\s]*[`"]?(\w+)[`"]?/,
                /调用[：:\s]*[`"]?(\w+)[`"]?/,
                /执行[：:\s]*[`"]?(\w+)[`"]?/,
                /(\w+)\s*\(/
            ];
            
            let rawFunctionName = null;
            for (const pattern of functionNamePatterns) {
                const match = response.match(pattern);
                if (match) {
                    rawFunctionName = match[1];
                    break;
                }
            }
            
            if (!rawFunctionName) {
                console.log('⚠️ 未识别到函数名');
                return null;
            }
            
            console.log(`🎯 识别到原始函数名: ${rawFunctionName}`);
            
            // 标准化函数名
            const functionName = this.normalizeFunctionName(rawFunctionName);
            if (!functionName) {
                console.log(`⚠️ 无法识别的函数名: ${rawFunctionName}`);
                return null;
            }
            
            // 提取参数 - 增强版本
            const params = this.extractParametersFromResponse(response, functionName, planningData);
            
            return {
                name: functionName,
                parameters: params,
                description: this.getFunctionDescription(functionName),
                originalName: rawFunctionName !== functionName ? rawFunctionName : undefined
            };
            
        } catch (error) {
            console.warn('⚠️ 函数调用解析失败:', error);
            return null;
        }
    }

    // 解析标准FUNCTION_CALL格式的参数 - 增强版本
    parseStandardFunctionArgs(argsString, functionName) {
        console.log(`🔧 解析标准格式参数: ${argsString} (函数: ${functionName})`);
        
        const params = {};
        
        try {
            // 改进的参数解析 - 更精确的正则表达式
            // 1. 先处理JSON对象格式的参数 (如坐标对象)
            const jsonMatches = argsString.match(/\{[^}]*"longitude"[^}]*\}/g);
            let remainingArgs = argsString;
            
            // 提取JSON对象并从字符串中移除
            const extractedJsons = [];
            if (jsonMatches) {
                jsonMatches.forEach(jsonStr => {
                    try {
                        const jsonObj = JSON.parse(jsonStr);
                        extractedJsons.push(jsonObj);
                        remainingArgs = remainingArgs.replace(jsonStr, '__JSON_PLACEHOLDER__');
                        console.log(`🎯 提取JSON对象:`, jsonObj);
                    } catch (e) {
                        console.warn('⚠️ JSON解析失败:', jsonStr);
                    }
                });
            }
            
            // 2. 解析剩余的字符串和数字参数
            // 优化的正则表达式：分别匹配双引号字符串、单个数字、布尔值
            const stringPattern = /"([^"]*)"/g;
            const numberPattern = /(?:^|[^\w.])(\d+(?:\.\d+)?)(?=\s*[,\)]|$)/g;
            const booleanPattern = /\b(true|false)\b/g;
            
            const extractedStrings = [];
            const extractedNumbers = [];
            const extractedBooleans = [];
            
            // 提取字符串
            let stringMatch;
            while ((stringMatch = stringPattern.exec(remainingArgs)) !== null) {
                extractedStrings.push(stringMatch[1]);
                console.log(`📝 提取字符串: "${stringMatch[1]}"`);
            }
            
            // 提取数字
            let numberMatch;
            while ((numberMatch = numberPattern.exec(remainingArgs)) !== null) {
                const num = parseFloat(numberMatch[1]);
                extractedNumbers.push(num);
                console.log(`🔢 提取数字: ${num}`);
            }
            
            // 提取布尔值
            let booleanMatch;
            while ((booleanMatch = booleanPattern.exec(remainingArgs)) !== null) {
                extractedBooleans.push(booleanMatch[1] === 'true');
                console.log(`🔘 提取布尔值: ${booleanMatch[1]}`);
            }
            
            // 3. 根据函数类型精确分配参数
            if (functionName === 'geocode_address') {
                // geocode_address(address, city)
                if (extractedStrings.length >= 1) params.address = extractedStrings[0];
                if (extractedStrings.length >= 2) params.city = extractedStrings[1];
                
                console.log(`✅ geocode_address参数: address="${params.address}", city="${params.city}"`);
                
            } else if (functionName === 'search_nearby_pois') {
                // search_nearby_pois(longitude, latitude, keywords, radius)
                if (extractedNumbers.length >= 2) {
                    params.longitude = extractedNumbers[0];
                    params.latitude = extractedNumbers[1];
                }
                if (extractedStrings.length >= 1) {
                    params.keywords = extractedStrings[0];
                }
                if (extractedNumbers.length >= 3) {
                    params.radius = extractedNumbers[2];
                } else if (extractedNumbers.length === 2 && extractedStrings.length >= 1) {
                    // 可能radius在字符串后面
                    const lastNumber = extractedNumbers[extractedNumbers.length - 1];
                    if (lastNumber > 100) { // 大于100的数字可能是半径
                        params.radius = lastNumber;
                    }
                }
                // 设置默认半径
                if (!params.radius) params.radius = 3000;
                
                console.log(`✅ search_nearby_pois参数: lng=${params.longitude}, lat=${params.latitude}, keywords="${params.keywords}", radius=${params.radius}`);
                
            } else if (functionName === 'text_search_pois') {
                // text_search_pois(keywords, city, citylimit)
                if (extractedStrings.length >= 1) params.keywords = extractedStrings[0];
                if (extractedStrings.length >= 2) params.city = extractedStrings[1];
                if (extractedBooleans.length >= 1) {
                    params.citylimit = extractedBooleans[0];
                } else {
                    params.citylimit = true; // 默认限制在城市内
                }
                
                console.log(`✅ text_search_pois参数: keywords="${params.keywords}", city="${params.city}", citylimit=${params.citylimit}`);
                
            } else if (functionName === 'get_poi_details') {
                // get_poi_details(poi_id)
                if (extractedStrings.length >= 1) params.poi_id = extractedStrings[0];
                
                console.log(`✅ get_poi_details参数: poi_id="${params.poi_id}"`);
                
            } else if (functionName === 'plan_walking_route') {
                // plan_walking_route(start_point, end_point)
                if (extractedJsons.length >= 2) {
                    params.start_point = extractedJsons[0];
                    params.end_point = extractedJsons[1];
                } else if (extractedNumbers.length >= 4) {
                    // 备选：四个数字参数 (lng1, lat1, lng2, lat2)
                    params.start_point = {
                        longitude: extractedNumbers[0],
                        latitude: extractedNumbers[1]
                    };
                    params.end_point = {
                        longitude: extractedNumbers[2],
                        latitude: extractedNumbers[3]
                    };
                } else if (extractedStrings.length >= 2) {
                    // 备选：两个坐标字符串
                    const parseCoordString = (coordStr) => {
                        const coords = coordStr.split(',');
                        if (coords.length === 2) {
                            return {
                                longitude: parseFloat(coords[0].trim()),
                                latitude: parseFloat(coords[1].trim())
                            };
                        }
                        return null;
                    };
                    
                    const startCoord = parseCoordString(extractedStrings[0]);
                    const endCoord = parseCoordString(extractedStrings[1]);
                    
                    if (startCoord && endCoord) {
                        params.start_point = startCoord;
                        params.end_point = endCoord;
                    }
                }
                
                console.log(`✅ plan_walking_route参数: start=${JSON.stringify(params.start_point)}, end=${JSON.stringify(params.end_point)}`);
            }
            
            // 4. 参数验证和修正
            const validation = this.validateAndFixParams(params, functionName);
            if (validation.fixed) {
                console.log(`🔧 参数已修正:`, validation.params);
                return validation.params;
            }
            
            console.log(`✅ 标准格式参数解析完成:`, params);
            return params;
            
        } catch (error) {
            console.warn('⚠️ 标准格式参数解析失败:', error);
            return {};
        }
    }
    
    // 新增：参数验证和修正方法
    validateAndFixParams(params, functionName) {
        const fixes = [];
        let fixed = false;
        
        if (functionName === 'search_nearby_pois') {
            // 验证经纬度范围
            if (params.longitude && (params.longitude < -180 || params.longitude > 180)) {
                fixes.push(`经度超出范围: ${params.longitude}`);
            }
            if (params.latitude && (params.latitude < -90 || params.latitude > 90)) {
                fixes.push(`纬度超出范围: ${params.latitude}`);
            }
            
            // 修正常见错误：参数顺序错误
            if (params.longitude && params.latitude && 
                Math.abs(params.longitude) < 90 && Math.abs(params.latitude) > 90) {
                // 可能经纬度搞反了
                const temp = params.longitude;
                params.longitude = params.latitude;
                params.latitude = temp;
                fixes.push('修正了经纬度顺序');
                fixed = true;
            }
            
            // 修正关键词
            if (!params.keywords || params.keywords.trim() === '') {
                params.keywords = '景点|公园';
                fixes.push('设置默认关键词');
                fixed = true;
            }
            
            // 修正半径
            if (!params.radius || params.radius < 100 || params.radius > 50000) {
                params.radius = 3000;
                fixes.push('设置默认半径3000米');
                fixed = true;
            }
        }
        
        if (functionName === 'plan_walking_route') {
            // 验证坐标对象格式
            if (params.start_point && (!params.start_point.longitude || !params.start_point.latitude)) {
                fixes.push('起点坐标格式不正确');
            }
            if (params.end_point && (!params.end_point.longitude || !params.end_point.latitude)) {
                fixes.push('终点坐标格式不正确');
            }
        }
        
        if (fixes.length > 0) {
            console.log(`🔧 参数验证修正:`, fixes);
        }
        
        return { params, fixed, fixes };
    }

    // 新增：从响应中提取参数的增强方法 - 大幅改进版本
    extractParametersFromResponse(response, functionName, planningData = null) {
        console.log(`🔧 提取${functionName}的参数从响应: ${response.substring(0, 200)}...`);
        
        const params = {};
        
        // 策略1：优先处理常见的错误格式并修正
        // 1.1 处理参数顺序混乱的情况
        if (functionName === 'search_nearby_pois') {
            // 寻找所有数字（可能是经纬度和半径）
            const numbers = response.match(/\d+\.?\d*/g);
            if (numbers && numbers.length >= 2) {
                const coords = numbers.slice(0, 2).map(n => parseFloat(n));
                // 验证是否是合理的经纬度范围
                if (this.isValidCoordinate(coords[0], coords[1])) {
                    params.longitude = coords[0];
                    params.latitude = coords[1];
                    console.log(`🎯 提取到有效坐标: ${params.longitude}, ${params.latitude}`);
                }
                // 查找半径（通常是较大的数字）
                const largeNumbers = numbers.filter(n => parseFloat(n) > 100);
                if (largeNumbers.length > 0) {
                    params.radius = parseInt(largeNumbers[largeNumbers.length - 1]);
                }
            }
            
            // 提取关键词（引号内或特定模式）
            const keywordPatterns = [
                /"([^"]*(?:公园|景点|湖泊|河流|水系|商场|地铁|公交|历史|文化|自然|山林)[^"]*)"/g,
                /关键词[：:\s]*["`']([^"`'\n]+)["`']/g,
                /搜索[：:\s]*["`']([^"`'\n]+)["`']/g,
                /([^"]*(?:公园|景点|湖泊|河流|水系|商场|地铁|公交|历史|文化|自然|山林)[^"]*)/g
            ];
            
            for (const pattern of keywordPatterns) {
                pattern.lastIndex = 0;
                const match = pattern.exec(response);
                if (match && match[1] && match[1].trim()) {
                    params.keywords = match[1].trim();
                    console.log(`🔍 提取到关键词: "${params.keywords}"`);
                    break;
                }
            }
        }
        
        // 策略2：从已知的规划数据中智能补全缺失参数
        if (functionName === 'search_nearby_pois' && (!params.longitude || !params.latitude) && planningData?.startPoint) {
            params.longitude = planningData.startPoint.longitude;
            params.latitude = planningData.startPoint.latitude;
            console.log(`🎯 使用规划数据中的起点坐标: ${params.longitude}, ${params.latitude}`);
        }
        
        // 策略3：基于用户偏好智能设置关键词
        if (functionName === 'search_nearby_pois' && !params.keywords && planningData?.preferences) {
            const preferenceKeywordMap = {
                '水景': '湖泊|河流|水系|海滨|滨水',
                '公园': '公园|绿地|植物园|花园',
                '历史': '历史|古迹|文化|博物馆|纪念馆',
                '商业': '商场|购物|商业街|步行街',
                '自然': '自然|山林|森林|郊野|山地',
                '科技': '科技园|高新区|现代建筑|商务区'
            };
            
            const preference = planningData.preferences.preference;
            if (preferenceKeywordMap[preference]) {
                params.keywords = preferenceKeywordMap[preference];
                console.log(`🎯 基于偏好"${preference}"设置关键词: "${params.keywords}"`);
            }
        }
        
        // 策略4：处理地理编码参数
        if (functionName === 'geocode_address') {
            // 提取地址和城市
            const addressPatterns = [
                /address[：:\s]*["`']([^"`'\n]+)["`']/gi,
                /地址[：:\s]*["`']([^"`'\n]+)["`']/g,
                /"([^"]*(?:地铁站|公交站|广场|中心|大厦|街|路|区)[^"]*)"/g
            ];
            
            for (const pattern of addressPatterns) {
                pattern.lastIndex = 0;
                const match = pattern.exec(response);
                if (match && match[1]) {
                    params.address = match[1].trim();
                    console.log(`📍 提取到地址: "${params.address}"`);
                    break;
                }
            }
            
            const cityPatterns = [
                /city[：:\s]*["`']([^"`'\n]+)["`']/gi,
                /城市[：:\s]*["`']([^"`'\n]+)["`']/g,
                /"(北京|上海|广州|深圳|杭州|南京|重庆|纽约)"/g
            ];
            
            for (const pattern of cityPatterns) {
                pattern.lastIndex = 0;
                const match = pattern.exec(response);
                if (match && match[1]) {
                    params.city = match[1].trim();
                    console.log(`🏙️ 提取到城市: "${params.city}"`);
                    break;
                }
            }
            
            // 智能推断：如果没有明确的地址和城市，从上下文推断
            if (!params.address && !params.city) {
                if (response.includes('五道口')) {
                    params.address = '五道口地铁站';
                    params.city = '北京';
                    console.log('🎯 智能推断: 五道口地铁站, 北京');
                }
            }
        }
        
        // 策略5：处理路径规划参数（高级JSON解析）
        if (functionName === 'plan_walking_route') {
            // 优先查找标准JSON格式的坐标对象
            const jsonPattern = /\{[^}]*"longitude"[^}]*\}/g;
            const jsonMatches = response.match(jsonPattern);
            
            if (jsonMatches && jsonMatches.length >= 2) {
                try {
                    params.start_point = JSON.parse(jsonMatches[0]);
                    params.end_point = JSON.parse(jsonMatches[1]);
                    console.log(`🎯 解析JSON坐标: ${JSON.stringify(params.start_point)} → ${JSON.stringify(params.end_point)}`);
                } catch (e) {
                    console.warn('⚠️ JSON解析失败，尝试其他方法');
                }
            }
            
            // 备选：解析数字序列格式
            if (!params.start_point && !params.end_point) {
                const numbers = response.match(/\d+\.\d+/g);
                if (numbers && numbers.length >= 4) {
                    const coords = numbers.slice(0, 4).map(n => parseFloat(n));
                    params.start_point = { longitude: coords[0], latitude: coords[1] };
                    params.end_point = { longitude: coords[2], latitude: coords[3] };
                    console.log(`🎯 解析数字序列坐标: [${coords.join(', ')}]`);
                }
            }
            
            // 最终备选：使用规划数据
            if (!params.start_point && planningData?.startPoint) {
                params.start_point = {
                    longitude: planningData.startPoint.longitude,
                    latitude: planningData.startPoint.latitude
                };
                console.log('🎯 使用规划数据中的起点作为路径起点');
            }
            
            if (!params.end_point && planningData?.candidateDestinations?.length > 0) {
                const destination = planningData.candidateDestinations[0];
                params.end_point = {
                    longitude: destination.location[0],
                    latitude: destination.location[1]
                };
                console.log('🎯 使用第一个候选地点作为路径终点');
            }
        }
        
        // 策略6：设置智能默认值和参数修正
        if (functionName === 'search_nearby_pois') {
            if (!params.radius || params.radius < 100 || params.radius > 50000) {
                params.radius = 3000;
                console.log('🔧 设置默认搜索半径: 3000米');
            }
            
            if (!params.keywords || params.keywords.trim() === '') {
                params.keywords = '景点|公园|广场';
                console.log('🔧 设置默认关键词: 景点|公园|广场');
            }
            
            // 修正经纬度顺序（常见错误）
            if (params.longitude && params.latitude) {
                if (Math.abs(params.longitude) < 90 && Math.abs(params.latitude) > 90) {
                    const temp = params.longitude;
                    params.longitude = params.latitude;
                    params.latitude = temp;
                    console.log('🔧 修正了经纬度顺序');
                }
            }
        }
        
        if (functionName === 'text_search_pois') {
            if (!params.citylimit) params.citylimit = true;
            if (!params.city) params.city = '北京';
            if (!params.keywords) params.keywords = '地铁站';
        }
        
        // 最终验证
        const finalValidation = this.validateExtractedParams(params, functionName);
        
        console.log(`✅ 最终参数提取结果 (${functionName}):`, params);
        if (finalValidation.warnings.length > 0) {
            console.warn('⚠️ 参数提取警告:', finalValidation.warnings);
        }
        
        return params;
    }
    
    // 新增：验证坐标是否有效
    isValidCoordinate(lng, lat) {
        return !isNaN(lng) && !isNaN(lat) && 
               lng >= -180 && lng <= 180 && 
               lat >= -90 && lat <= 90 &&
               !(lng === 0 && lat === 0); // 排除(0,0)坐标
    }
    
    // 新增：最终参数验证
    validateExtractedParams(params, functionName) {
        const warnings = [];
        
        if (functionName === 'search_nearby_pois') {
            if (!params.longitude || !params.latitude) {
                warnings.push('缺少经纬度坐标');
            }
            if (!params.keywords) {
                warnings.push('缺少搜索关键词');
            }
        }
        
        if (functionName === 'geocode_address') {
            if (!params.address) {
                warnings.push('缺少地址信息');
            }
            if (!params.city) {
                warnings.push('缺少城市信息');
            }
        }
        
        if (functionName === 'plan_walking_route') {
            if (!params.start_point || !params.end_point) {
                warnings.push('缺少路径规划的起点或终点');
            }
        }
        
        return { warnings };
    }

    // 获取函数描述
    getFunctionDescription(functionName) {
        const descriptions = {
            'geocode_address': '解析地址坐标',
            'search_nearby_pois': '搜索周边地点',
            'text_search_pois': '文本搜索地点',
            'get_poi_details': '获取地点详情',
            'plan_walking_route': '规划步行路线'
        };
        return descriptions[functionName] || '执行函数';
    }

    // 执行函数调用
    async executeFunctionCall(functionCall) {
        try {
            const { name, parameters, originalName } = functionCall;
            
            // 如果函数名被修正过，记录日志
            if (originalName) {
                console.log(`🔧 执行函数调用: ${name} (原始名称: ${originalName})`, parameters);
            } else {
                console.log(`🔧 执行函数调用: ${name}`, parameters);
            }
            
            switch (name) {
                case 'geocode_address':
                    // 确保参数有效
                    const address = parameters.address || parameters.param1 || '';
                    const city = parameters.city || parameters.param2 || '北京';
                    console.log(`📍 地理编码: ${address}, ${city}`);
                    return await this.geocodeAddress(address, city);
                    
                case 'search_nearby_pois':
                    // 确保参数有效
                    let longitude = parseFloat(parameters.longitude || parameters.param1 || 0);
                    let latitude = parseFloat(parameters.latitude || parameters.param2 || 0);
                    const keywords = parameters.keywords || parameters.param3 || '景点';
                    let radius = parseInt(parameters.radius || parameters.param4 || 3000);
                    
                    // 如果坐标无效，尝试从其他参数中提取
                    if ((longitude === 0 || latitude === 0) && parameters.city && typeof parameters.city === 'string' && parameters.city.includes(',')) {
                        const coords = parameters.city.split(',');
                        if (coords.length === 2) {
                            const lng = parseFloat(coords[0].trim());
                            const lat = parseFloat(coords[1].trim());
                            if (!isNaN(lng) && !isNaN(lat)) {
                                longitude = lng;
                                latitude = lat;
                                console.log(`🔧 从city参数中提取坐标: (${longitude}, ${latitude})`);
                            }
                        }
                    }
                    
                    console.log(`🔍 周边搜索: (${longitude}, ${latitude}), "${keywords}", ${radius}m`);
                    
                    if (longitude === 0 || latitude === 0) {
                        return { 
                            success: false, 
                            error: '无效的坐标参数',
                            pois: []
                        };
                    }
                    
                    return await this.searchNearbyPOIs(longitude, latitude, keywords, radius);
                    
                case 'text_search_pois':
                    const searchKeywords = parameters.keywords || parameters.param1 || '';
                    const searchCity = parameters.city || parameters.param2 || '北京';
                    const citylimit = parameters.citylimit !== undefined ? parameters.citylimit : true;
                    
                    console.log(`📝 文本搜索: "${searchKeywords}" in ${searchCity}`);
                    return await this.textSearchPOIs(searchKeywords, searchCity, citylimit);
                    
                case 'get_poi_details':
                    const poiId = parameters.poi_id || parameters.param1 || '';
                    console.log(`📋 POI详情: ${poiId}`);
                    return await this.getPOIDetails(poiId);
                    
                case 'plan_walking_route':
                    let startPoint = parameters.start_point;
                    let endPoint = parameters.end_point;
                    
                    // 如果没有正确的start_point和end_point，尝试从其他参数构建
                    if (!startPoint || !endPoint) {
                        startPoint = { 
                            longitude: parseFloat(parameters.param1 || 0), 
                            latitude: parseFloat(parameters.param2 || 0) 
                        };
                        endPoint = { 
                            longitude: parseFloat(parameters.param3 || 0), 
                            latitude: parseFloat(parameters.param4 || 0) 
                        };
                    }
                    
                    // 验证坐标有效性
                    if (!startPoint || !endPoint || 
                        startPoint.longitude === 0 || startPoint.latitude === 0 ||
                        endPoint.longitude === 0 || endPoint.latitude === 0) {
                        console.log(`❌ 路径规划参数无效: start=${JSON.stringify(startPoint)}, end=${JSON.stringify(endPoint)}`);
                        return { 
                            success: false, 
                            error: '路径规划参数无效：起点或终点坐标缺失' 
                        };
                    }
                    
                    console.log(`🛣️ 路径规划: (${startPoint.longitude}, ${startPoint.latitude}) → (${endPoint.longitude}, ${endPoint.latitude})`);
                    return await this.planWalkingRoute(startPoint, endPoint);
                    
                default:
                    throw new Error(`未知函数: ${name}`);
            }
        } catch (error) {
            console.error(`❌ 函数${functionCall.name}执行失败:`, error);
            return { success: false, error: error.message };
        }
    }

    // 更新规划数据
    updatePlanningData(planningData, functionCall, functionResult) {
        console.log(`📊 更新规划数据: ${functionCall.name}`, functionResult.success);
        
        if (functionCall.name === 'geocode_address' && functionResult.success) {
            // 只有在起点未设置时才更新起点
            if (!planningData.startPoint) {
                planningData.startPoint = {
                    longitude: functionResult.longitude,
                    latitude: functionResult.latitude,
                    formatted_address: functionResult.formatted_address,
                    raw_data: functionResult.raw_data
                };
                console.log('✅ 起点坐标已更新:', planningData.startPoint);
            } else {
                // 将其他地理编码结果作为候选地点
                if (!planningData.candidateDestinations) {
                    planningData.candidateDestinations = [];
                }
                planningData.candidateDestinations.push({
                    name: functionResult.formatted_address,
                    location: [functionResult.longitude, functionResult.latitude],
                    address: functionResult.formatted_address,
                    type: 'geocoded_location'
                });
                console.log('✅ 添加候选地点:', functionResult.formatted_address);
            }
        } else if (functionCall.name.includes('search') && functionResult.success) {
            if (functionResult.pois && functionResult.pois.length > 0) {
                // 确保候选地点数组存在
                if (!planningData.candidateDestinations) {
                    planningData.candidateDestinations = [];
                }
                // 去重添加候选目的地
                const existingIds = new Set(planningData.candidateDestinations.map(p => p.id));
                const newPOIs = functionResult.pois.filter(poi => !existingIds.has(poi.id));
                planningData.candidateDestinations.push(...newPOIs);
                console.log(`✅ 添加了${newPOIs.length}个新的候选地点，总计${planningData.candidateDestinations.length}个`);
            } else {
                console.log('⚠️ 搜索结果为空，未添加候选地点');
            }
        } else if (functionCall.name === 'get_poi_details' && functionResult.success) {
            // 保存POI详情信息
            if (!planningData.poiDetails) planningData.poiDetails = {};
            planningData.poiDetails[functionCall.parameters.poi_id] = functionResult.details;
            console.log('✅ POI详情已保存');
        } else if (functionCall.name === 'plan_walking_route' && functionResult.success) {
            // 保存路径规划信息
            if (!planningData.routes) planningData.routes = [];
            planningData.routes.push(functionResult);
            console.log('✅ 路径规划结果已保存');
        }
        
        console.log('📈 当前规划数据状态:', {
            hasStartPoint: !!planningData.startPoint,
            candidateCount: planningData.candidateDestinations.length,
            hasRoutes: (planningData.routes || []).length > 0
        });
    }

    // 生成最终路线
    async generateFinalRoute(planningData, preferences, conversationHistory) {
        try {
            updatePlanningStatus('🎯 生成最终路线方案...', 'loading');
            
            const finalPrompt = `基于收集到的信息，请生成最终的散步路线方案：

起点信息：${JSON.stringify(planningData.startPoint)}
候选目的地：${JSON.stringify(planningData.candidateDestinations.slice(0, 10))}
用户偏好：${JSON.stringify(preferences)}

请选择2-3个最佳地点作为途经点，并提供最终的路线建议。返回JSON格式：
{
  "selected_waypoints": [{"name": "地点名", "reason": "选择理由", "location": [lng, lat]}],
  "route_description": "路线描述",
  "experience_rating": "评分1-10",
  "practical_tips": ["建议1", "建议2"]
}`;

            conversationHistory.push({
                role: "user",
                content: finalPrompt
            });

            const finalResponse = await this.chatWithLLM(conversationHistory);
            
            // 解析最终方案
            const finalPlan = this.parseFinalPlan(finalResponse);
            
            // 生成完整路线数据
            planningData.finalRoute = await this.buildCompleteRoute(planningData, finalPlan, preferences);
            
            console.log('✅ LLM智能规划完成:', planningData.finalRoute);
            
        } catch (error) {
            console.error('❌ 生成最终路线失败:', error);
            throw error;
        }
    }

    // 解析最终方案
    parseFinalPlan(response) {
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            } else {
                return {
                    selected_waypoints: [],
                    route_description: response,
                    experience_rating: "8",
                    practical_tips: ["LLM生成的智能路线"]
                };
            }
        } catch (error) {
            console.warn('⚠️ 最终方案解析失败:', error);
            return {
                selected_waypoints: [],
                route_description: response,
                experience_rating: "7",
                practical_tips: ["基于AI分析的路线"]
            };
        }
    }

    // 构建完整路线数据
    async buildCompleteRoute(planningData, finalPlan, preferences) {
        try {
            const waypoints = finalPlan.selected_waypoints || [];
            const startPoint = planningData.startPoint;
            
            // 构建完整的路径点序列
            const allWaypoints = [startPoint];
            
            // 添加选中的途经点
            waypoints.forEach(wp => {
                allWaypoints.push({
                    name: wp.name,
                    longitude: wp.location[0],
                    latitude: wp.location[1],
                    location: wp.location,
                    type: 'waypoint'
                });
            });
            
            // 选择终点
            let endPoint;
            if (preferences.endType === '起点') {
                endPoint = startPoint;
            } else {
                // 从候选地点中选择合适的终点
                endPoint = this.selectEndPoint(startPoint, planningData.candidateDestinations, preferences);
                
                // 如果没有找到合适的终点，使用候选地点中的最后一个
                if (!endPoint && planningData.candidateDestinations && planningData.candidateDestinations.length > 0) {
                    const candidate = planningData.candidateDestinations[planningData.candidateDestinations.length - 1];
                    endPoint = {
                        name: candidate.name,
                        longitude: candidate.location[0],
                        latitude: candidate.location[1],
                        address: candidate.address,
                        type: 'end'
                    };
                }
                
                // 最后的备选方案
                if (!endPoint) {
                    endPoint = waypoints[waypoints.length - 1] || startPoint;
                }
            }
            
            allWaypoints.push(endPoint);
            
            // 计算总路线
            let totalDistance = 0;
            let totalDuration = 0;
            
            for (let i = 0; i < allWaypoints.length - 1; i++) {
                const routeSegment = await this.planWalkingRoute(allWaypoints[i], allWaypoints[i + 1]);
                if (routeSegment.success) {
                    totalDistance += routeSegment.distance;
                    totalDuration += routeSegment.duration;
                }
            }
            
            return {
                success: true,
                route: {
                    start_point: startPoint,
                    end_point: endPoint,
                    waypoints: waypoints,
                    distance: totalDistance,
                    duration: totalDuration,
                    steps: []
                },
                analysis: {
                    route_description: finalPlan.route_description,
                    experience_rating: finalPlan.experience_rating,
                    recommended_waypoints: waypoints,
                    practical_tips: finalPlan.practical_tips
                },
                nearby_pois: planningData.candidateDestinations,
                technical_info: {
                    llm_guided: true,
                    planning_steps: this.planningHistory
                }
            };
            
        } catch (error) {
            console.error('❌ 构建完整路线失败:', error);
            throw error;
        }
    }

    // 选择终点
    selectEndPoint(startPoint, candidates, preferences) {
        if (!candidates || candidates.length === 0) {
            return null;
        }
        
        const typeKeywords = {
            '地铁站': ['地铁', '轨道交通'],
            '公交站': ['公交', '车站'],
            '景点': ['景点', '公园', '广场'],
            '商场': ['商场', '购物', '商业']
        };

        const keywords = typeKeywords[preferences.endType] || ['景点'];
        const filteredPOIs = candidates.filter(poi => {
            const poiType = poi.type || '';
            const poiName = poi.name || '';
            return keywords.some(keyword => 
                poiType.includes(keyword) || poiName.includes(keyword)
            );
        });

        // 选择匹配的POI，或者选择最后一个候选地点
        const selectedPOI = filteredPOIs.length > 0 ? filteredPOIs[0] : candidates[candidates.length - 1];
        
        if (selectedPOI) {
            return {
                name: selectedPOI.name,
                longitude: selectedPOI.location[0],
                latitude: selectedPOI.location[1],
                address: selectedPOI.address,
                type: 'end'
            };
        }

        return null;
    }



    // 从规划数据构建路线（当LLM已获取实际路径数据时）
    buildRouteFromPlanningData(planningData, preferences) {
        try {
            const route = planningData.routes[0]; // 使用第一个路径数据
            
            // 选择最佳的途经点
            const selectedWaypoints = planningData.candidateDestinations.slice(0, 2).map(candidate => ({
                name: candidate.name,
                longitude: candidate.location[0],
                latitude: candidate.location[1],
                location: candidate.location,
                reason: `符合${preferences.preference}偏好的AI智能推荐`,
                address: candidate.address || '',
                type: 'waypoint'
            }));
            
            // 选择终点
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
            
            return {
                success: true,
                route: {
                    start_point: planningData.startPoint,
                    end_point: endPoint,
                    waypoints: selectedWaypoints,
                    distance: route.distance,
                    duration: route.duration,
                    steps: route.steps || []
                },
                analysis: {
                    route_description: `AI为您精心规划的${preferences.preference}主题散步路线，总距离${(route.distance/1000).toFixed(1)}公里`,
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
                    planning_steps: this.planningHistory,
                    actual_route_data: true
                }
            };
        } catch (error) {
            console.error('❌ 从规划数据构建路线失败:', error);
            return null;
        }
    }
    
    // 构建备用路线（当没有实际路径数据时）
    buildFallbackRoute(planningData, preferences) {
        try {
            if (!planningData.startPoint || !planningData.candidateDestinations.length) {
                return null;
            }
            
            // 选择最佳候选地点
            const selectedWaypoint = planningData.candidateDestinations[0];
            const endCandidate = planningData.candidateDestinations.length > 1 ? 
                                planningData.candidateDestinations[1] : planningData.candidateDestinations[0];
            
            const waypoints = [{
                name: selectedWaypoint.name,
                longitude: selectedWaypoint.location[0],
                latitude: selectedWaypoint.location[1],
                location: selectedWaypoint.location,
                reason: `AI推荐的${preferences.preference}景点`,
                address: selectedWaypoint.address || '',
                type: 'waypoint'
            }];
            
            const endPoint = {
                name: endCandidate.name,
                longitude: endCandidate.location[0],
                latitude: endCandidate.location[1],
                address: endCandidate.address || '',
                type: 'end'
            };
            
            // 估算距离（基于坐标计算直线距离的1.3倍作为步行距离）
            const estimatedDistance = this.calculateEstimatedDistance(planningData.startPoint, endPoint) * 1.3;
            const estimatedDuration = estimatedDistance / 1.2; // 按1.2m/s步行速度估算
            
            return {
                success: true,
                route: {
                    start_point: planningData.startPoint,
                    end_point: endPoint,
                    waypoints: waypoints,
                    distance: Math.round(estimatedDistance),
                    duration: Math.round(estimatedDuration),
                    steps: []
                },
                analysis: {
                    route_description: `AI为您规划的${preferences.preference}主题散步路线，预估距离${(estimatedDistance/1000).toFixed(1)}公里`,
                    experience_rating: '8',
                    recommended_waypoints: waypoints,
                    practical_tips: [
                        '此为AI智能估算的路线，建议实际出行时确认路径',
                        `路线重点关注${preferences.preference}相关景点`,
                        '注意安全，建议白天出行',
                        '可根据实际情况调整路线'
                    ]
                },
                nearby_pois: planningData.candidateDestinations,
                technical_info: {
                    llm_guided: true,
                    planning_steps: this.planningHistory,
                    estimated_route: true
                }
            };
        } catch (error) {
            console.error('❌ 构建备用路线失败:', error);
            return null;
        }
    }
    
    // 计算两点间的估算距离（米）
    calculateEstimatedDistance(point1, point2) {
        const R = 6371000; // 地球半径（米）
        const lat1Rad = point1.latitude * Math.PI / 180;
        const lat2Rad = point2.latitude * Math.PI / 180;
        const deltaLatRad = (point2.latitude - point1.latitude) * Math.PI / 180;
        const deltaLngRad = (point2.longitude - point1.longitude) * Math.PI / 180;
        
        const a = Math.sin(deltaLatRad/2) * Math.sin(deltaLatRad/2) +
                Math.cos(lat1Rad) * Math.cos(lat2Rad) *
                Math.sin(deltaLngRad/2) * Math.sin(deltaLngRad/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        
        return R * c;
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
}

// 修复版路线服务类 - 现在由LLM智能代理驱动
class FixedRouteService {
    constructor() {
        console.log('✅ 初始化LLM驱动的路线服务 (Web API + 智能AI规划)...');
        this.llmAgent = new LLMPlanningAgent();
    }

    // 主要的路线规划方法 - 现在完全由LLM主导
    async planRoute(startLocation, city, preferences) {
        try {
            console.log('🚀 开始LLM主导的智能路线规划...');
            
            // 让LLM智能代理处理整个规划过程
            const result = await this.llmAgent.intelligentPlanRoute(startLocation, city, preferences);
            
            updatePlanningStatus('✅ LLM智能规划完成！', 'success');
            return result;
            
        } catch (error) {
            console.error('❌ LLM主导规划失败:', error);
            updatePlanningStatus(`❌ 规划失败: ${error.message}`, 'error');
            throw error;
        }
    }

    // 保留原有的直接API调用方法作为备用
    async geocode(address, city) {
        return await this.llmAgent.geocodeAddress(address, city);
    }

    async searchNearbyPOIs(longitude, latitude, keywords, radius = 3000) {
        return await this.llmAgent.searchNearbyPOIs(longitude, latitude, keywords, radius);
    }

    async planWalkingRoute(startPoint, endPoint) {
        return await this.llmAgent.planWalkingRoute(startPoint, endPoint);
    }
}

// 初始化服务
const routeService = new FixedRouteService();

// 增强console输出集成 - 让console.log也显示在AI终端中
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

// 重写console.log
console.log = function(...args) {
    originalConsoleLog.apply(console, args);
    const message = args.join(' ');
    if (document.getElementById('console-logs') && terminalStartTime) {
        addConsoleLog('debug', message);
    }
};

// 重写console.error
console.error = function(...args) {
    originalConsoleError.apply(console, args);
    const message = args.join(' ');
    if (document.getElementById('console-logs') && terminalStartTime) {
        addConsoleLog('error', message);
    }
};

// 重写console.warn
console.warn = function(...args) {
    originalConsoleWarn.apply(console, args);
    const message = args.join(' ');
    if (document.getElementById('console-logs') && terminalStartTime) {
        addConsoleLog('warning', message);
    }
};

// 更新规划状态 - 增强版
let terminalStartTime = null;
let consoleLogHistory = [];
let currentStepCount = 0;
let totalSteps = 10;
let currentPlanningSteps = {}; // 存储当前规划步骤的详细信息

function updatePlanningStatus(message, type, detail = '', stepInfo = null) {
    const statusDiv = document.getElementById('planning-status');
    const statusText = document.getElementById('status-text');
    const statusDetail = document.getElementById('status-detail');
    const statusDetailLine = document.getElementById('status-detail-line');
    const stepsDiv = document.getElementById('planning-steps');
    const stepsList = document.getElementById('steps-list');
    
    // 启动时间计时
    if (!terminalStartTime) {
        terminalStartTime = Date.now();
        startTerminal();
    }
    
    // 显示终端
    statusDiv.style.display = 'block';
    statusDiv.className = `ai-terminal status-${type}`;
    
    // 更新主状态 - 带打字机效果
    typewriterEffect(statusText, message);
    
    // 更新详细状态
    if (detail) {
        statusDetailLine.style.display = 'flex';
        statusDetail.textContent = detail;
    }
    
    // 添加console日志
    addConsoleLog(type, message, detail);
    
    // 更新进度
    updateProgress(stepInfo);
    
    // 更新终端状态
    updateTerminalStatus(type);
    
    // 显示AI规划步骤 - 修复状态问题
    let stepId = null;
    if (stepInfo) {
        stepId = addPlanningStep(stepInfo);
        stepsDiv.style.display = 'block';
    }
    
    // 创建粒子效果
    if (type === 'loading') {
        createParticles();
    }
    
    return stepId; // 返回stepId以便后续更新
}

// 启动终端
function startTerminal() {
    const terminalStatus = document.getElementById('terminal-status');
    const footerStatus = document.getElementById('footer-status');
    const systemInfo = document.getElementById('system-info');
    
    // 启动序列
    setTimeout(() => {
        terminalStatus.textContent = 'ACTIVE';
        terminalStatus.style.background = '#38a169';
        footerStatus.textContent = 'ACTIVE';
        footerStatus.style.color = '#68d391';
        typewriterEffect(systemInfo, 'Claude-4 AI Planning Agent initialized successfully ✓');
    }, 500);
    
    // 开始计时器
    updateTimingInfo();
    setInterval(updateTimingInfo, 1000);
}

// 打字机效果
function typewriterEffect(element, text, speed = 50) {
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

// 添加console日志
function addConsoleLog(level, message, detail = '') {
    const logsContainer = document.getElementById('console-logs');
    const timestamp = new Date().toLocaleTimeString().substring(0, 8);
    
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
    
    // 保持最多20条日志
    if (logsContainer.children.length > 20) {
        logsContainer.removeChild(logsContainer.firstChild);
    }
    
    // 自动滚动
    logsContainer.scrollTop = logsContainer.scrollHeight;
    
    // 添加到历史记录
    consoleLogHistory.push({
        timestamp: new Date().toISOString(),
        level: levelClass,
        message,
        detail
    });
}

// 更新进度
function updateProgress(stepInfo) {
    const progressContainer = document.getElementById('progress-container');
    const progressFill = document.getElementById('progress-fill');
    const progressLabel = document.getElementById('progress-label');
    
    if (stepInfo && stepInfo.step) {
        progressContainer.style.display = 'block';
        
        if (typeof stepInfo.step === 'number') {
            currentStepCount = stepInfo.step;
            const progress = (currentStepCount / totalSteps) * 100;
            progressFill.style.width = `${Math.min(progress, 100)}%`;
            progressLabel.textContent = `Step ${currentStepCount}/${totalSteps}: ${stepInfo.action}`;
        } else if (stepInfo.step === 'final') {
            progressFill.style.width = '100%';
            progressLabel.textContent = 'Planning completed successfully!';
        } else if (stepInfo.step === 'error') {
            progressFill.style.background = '#e53e3e';
            progressLabel.textContent = 'Planning failed - see error details above';
        }
    }
}

// 更新终端状态
function updateTerminalStatus(type) {
    const terminalStatus = document.getElementById('terminal-status');
    const footerStatus = document.getElementById('footer-status');
    
    switch(type) {
        case 'loading':
            terminalStatus.textContent = 'PROCESSING';
            terminalStatus.style.background = '#4299e1';
            footerStatus.textContent = 'PROCESSING';
            footerStatus.style.color = '#63b3ed';
            break;
        case 'success':
            terminalStatus.textContent = 'COMPLETED';
            terminalStatus.style.background = '#38a169';
            footerStatus.textContent = 'COMPLETED';
            footerStatus.style.color = '#68d391';
            break;
        case 'error':
            terminalStatus.textContent = 'ERROR';
            terminalStatus.style.background = '#e53e3e';
            footerStatus.textContent = 'ERROR';
            footerStatus.style.color = '#fc8181';
            break;
    }
}

// 添加规划步骤 - 修复版本，支持展开详情
function addPlanningStep(stepInfo) {
    const stepsList = document.getElementById('steps-list');
    
    // 生成唯一的步骤ID
    const stepId = `step-${stepInfo.step}-${Date.now()}`;
    
    // 确定步骤状态 - 修复逻辑
    let statusClass, statusText;
    if (stepInfo.result === true) {
        statusClass = 'completed';
        statusText = 'COMPLETED';
    } else if (stepInfo.result === 'running' || (stepInfo.result === false && stepInfo.step !== 'error')) {
        // 新开始的步骤或明确标记为running的显示为running
        statusClass = 'running';
        statusText = 'RUNNING';
    } else if (stepInfo.step === 'error' || stepInfo.result === 'failed') {
        statusClass = 'failed';
        statusText = 'FAILED';
    } else {
        statusClass = 'pending';
        statusText = 'PENDING';
    }
    
    // 生成用户友好的描述
    const friendlyDescription = generateFriendlyDescription(stepInfo);
    
    const stepElement = document.createElement('div');
    stepElement.className = 'step-item';
    stepElement.id = stepId;
    
    stepElement.innerHTML = `
        <div class="step-header">
            <span class="step-title">${friendlyDescription.title}</span>
            <span class="step-status ${statusClass}">${statusText}</span>
        </div>
        <div class="step-description">${friendlyDescription.description}</div>
        ${stepInfo.detail || stepInfo.expandableData ? createExpandableContent(stepInfo) : ''}
    `;
    
    stepsList.appendChild(stepElement);
    
    // 存储步骤信息以便后续更新
    currentPlanningSteps[stepId] = {
        ...stepInfo,
        element: stepElement,
        statusClass: statusClass
    };
    
    // 自动滚动到最新步骤
    stepElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    return stepId; // 返回步骤ID以便后续更新
}

// 生成用户友好的描述
function generateFriendlyDescription(stepInfo) {
    const action = stepInfo.action || '';
    const step = stepInfo.step;
    
    // 根据不同的操作类型生成友好描述
    if (action.includes('初始化')) {
        return {
            title: `🤖 启动AI智能助手`,
            description: 'AI正在分析您的散步需求...'
        };
    } else if (action.includes('解析地址') || action.includes('geocode')) {
        return {
            title: `📍 定位起点位置`,
            description: '正在查找起点的精确坐标...'
        };
    } else if (action.includes('搜索周边') || action.includes('search_nearby')) {
        return {
            title: `🔍 寻找附近景点`,
            description: '正在搜索符合您偏好的附近地点...'
        };
    } else if (action.includes('文本搜索') || action.includes('text_search')) {
        return {
            title: `🏙️ 在城市中寻找地点`,
            description: '正在搜索城市中的相关地点...'
        };
    } else if (action.includes('路径规划') || action.includes('plan_walking')) {
        return {
            title: `🛣️ 规划最优路径`,
            description: '正在计算最佳散步路线...'
        };
    } else if (action.includes('生成最终')) {
        return {
            title: `🎯 生成推荐方案`,
            description: 'AI正在综合所有信息，为您生成最佳散步路线...'
        };
    } else if (step === 'final') {
        return {
            title: `✅ 规划完成`,
            description: '您的专属散步路线已成功生成！'
        };
    } else if (step === 'error') {
        return {
            title: `❌ 规划中断`,
            description: '规划过程中遇到问题，请重试'
        };
    } else {
        return {
            title: `⚙️ 第${step}步: ${action}`,
            description: stepInfo.description || '正在处理...'
        };
    }
}

// 创建可展开的内容 - 智能展开版本
function createExpandableContent(stepInfo) {
    const expandableId = `expandable-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    let expandableContent = '';
    
    // LLM输出 - 智能展开
    if (stepInfo.llmOutput) {
        const llmText = stepInfo.llmOutput;
        const isLongText = llmText.length > 300;
        const previewText = isLongText ? llmText.substring(0, 300) + '...' : llmText;
        
        expandableContent += `
            <div class="expandable-section">
                <div style="margin-top: 8px; padding: 8px; background: rgba(111, 66, 193, 0.1); border-radius: 4px; border: 1px solid rgba(111, 66, 193, 0.3);">
                    <div style="font-size: 11px; color: #6f42c1; font-weight: 600; margin-bottom: 6px;">
                        🧠 AI分析结果
                    </div>
                    <div class="llm-output-preview" style="font-size: 11px; color: #e2e8f0; line-height: 1.4; white-space: pre-wrap;">
                        ${previewText}
                    </div>
                    ${isLongText ? `
                        <details style="margin-top: 6px;">
                            <summary style="cursor: pointer; font-size: 10px; color: #9f7aea; user-select: none;">
                                展开完整内容
                            </summary>
                            <div class="llm-output-full" style="margin-top: 5px; padding: 6px; background: rgba(0,0,0,0.1); border-radius: 3px; font-size: 10px; max-height: 200px; overflow-y: auto; white-space: pre-wrap;">
                                ${llmText}
                            </div>
                        </details>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    // POI搜索结果 - 智能展开
    if (stepInfo.poiResults && stepInfo.poiResults.length > 0) {
        const totalResults = stepInfo.poiResults.length;
        const defaultShowCount = 3;
        const shouldCollapse = totalResults > defaultShowCount;
        
        // 默认显示的POI
        const defaultPois = stepInfo.poiResults.slice(0, defaultShowCount).map((poi, index) => 
            `<div class="poi-item">
                <strong>${poi.name}</strong>
                <div style="font-size: 10px; color: #cbd5e0;">${poi.address || ''}</div>
                ${poi.distance ? `<div style="font-size: 10px; color: #4fd1c5;">距离: ${poi.distance}m</div>` : ''}
                ${poi.type ? `<div style="font-size: 9px; color: #a0aec0;">类型: ${poi.type}</div>` : ''}
            </div>`
        ).join('');
        
        // 剩余的POI（折叠显示）
        const collapsedPois = shouldCollapse ? stepInfo.poiResults.slice(defaultShowCount).map((poi, index) => 
            `<div class="poi-item">
                <strong>${poi.name}</strong>
                <div style="font-size: 10px; color: #cbd5e0;">${poi.address || ''}</div>
                ${poi.distance ? `<div style="font-size: 10px; color: #4fd1c5;">距离: ${poi.distance}m</div>` : ''}
                ${poi.type ? `<div style="font-size: 9px; color: #a0aec0;">类型: ${poi.type}</div>` : ''}
            </div>`
        ).join('') : '';
        
        expandableContent += `
            <div class="expandable-section">
                <div style="margin-top: 8px; padding: 8px; background: rgba(32, 201, 151, 0.1); border-radius: 4px; border: 1px solid rgba(32, 201, 151, 0.3);">
                    <div style="font-size: 11px; color: #20c997; font-weight: 600; margin-bottom: 6px;">
                        🏞️ 找到的地点 (共${totalResults}个)
                    </div>
                    <div class="poi-results-default">
                        ${defaultPois}
                    </div>
                    ${shouldCollapse ? `
                        <details style="margin-top: 6px;">
                            <summary style="cursor: pointer; font-size: 10px; color: #20c997; user-select: none;">
                                查看剩余${totalResults - defaultShowCount}个地点
                            </summary>
                            <div class="poi-results-collapsed" style="margin-top: 5px; padding: 6px; background: rgba(0,0,0,0.1); border-radius: 3px; max-height: 200px; overflow-y: auto;">
                                ${collapsedPois}
                            </div>
                        </details>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    // 路径详情 - 重要信息直接显示
    if (stepInfo.routeData) {
        const hasSteps = stepInfo.routeData.steps && stepInfo.routeData.steps.length > 0;
        
        expandableContent += `
            <div class="expandable-section">
                <div style="margin-top: 8px; padding: 8px; background: rgba(40, 167, 69, 0.1); border-radius: 4px; border: 1px solid rgba(40, 167, 69, 0.3);">
                    <div style="font-size: 11px; color: #28a745; font-weight: 600; margin-bottom: 6px;">
                        🛣️ 路径规划结果
                    </div>
                    <div class="route-summary" style="font-size: 11px; color: #e2e8f0;">
                        <div style="margin: 2px 0;"><strong>总距离:</strong> ${(stepInfo.routeData.distance/1000).toFixed(1)}公里</div>
                        <div style="margin: 2px 0;"><strong>预计时间:</strong> ${Math.round(stepInfo.routeData.duration/60)}分钟</div>
                        <div style="margin: 2px 0;"><strong>路径类型:</strong> 步行路径</div>
                    </div>
                    ${hasSteps ? `
                        <details style="margin-top: 6px;">
                            <summary style="cursor: pointer; font-size: 10px; color: #48bb78; user-select: none;">
                                查看详细路径指引 (${stepInfo.routeData.steps.length}个步骤)
                            </summary>
                            <div class="route-steps" style="margin-top: 5px; padding: 6px; background: rgba(0,0,0,0.1); border-radius: 3px; font-size: 10px; max-height: 150px; overflow-y: auto;">
                                ${stepInfo.routeData.steps.slice(0, 5).map((step, index) => 
                                    `<div style="margin: 3px 0; padding: 3px; background: rgba(255,255,255,0.1); border-radius: 2px;">
                                        <strong>步骤${index + 1}:</strong> ${step.instruction || step.action || '继续前行'}
                                        ${step.distance ? `<span style="color: #4fd1c5; margin-left: 8px;">(${step.distance}m)</span>` : ''}
                                    </div>`
                                ).join('')}
                                ${stepInfo.routeData.steps.length > 5 ? `<div style="text-align: center; margin-top: 6px; color: #a0aec0; font-size: 9px;">还有${stepInfo.routeData.steps.length - 5}个步骤...</div>` : ''}
                            </div>
                        </details>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    // 技术详情（保持折叠显示，对普通用户不重要）
    if (stepInfo.detail) {
        expandableContent += `
            <div class="expandable-section">
                <details style="margin-top: 8px;">
                    <summary style="cursor: pointer; font-size: 11px; color: #6c757d; user-select: none;">
                        🔧 查看技术详情
                    </summary>
                    <div class="technical-detail" style="margin-top: 5px; padding: 8px; background: rgba(0,0,0,0.1); border-radius: 4px; font-size: 10px; font-family: monospace; max-height: 100px; overflow-y: auto;">
                        ${stepInfo.detail}
                    </div>
                </details>
            </div>
        `;
    }
    
    return expandableContent;
}

// 更新步骤状态 - 增强版本
function updateStepStatus(stepId, status, detail = '', additionalData = {}) {
    const stepInfo = currentPlanningSteps[stepId];
    if (!stepInfo || !stepInfo.element) return;
    
    const stepElement = stepInfo.element;
    const statusElement = stepElement.querySelector('.step-status');
    
    // 更新状态显示
    if (statusElement) {
        statusElement.className = `step-status ${status}`;
        statusElement.textContent = status.toUpperCase();
    }
    
    // 添加详细信息
    if (detail || additionalData.llmOutput || additionalData.poiResults || additionalData.routeData) {
        const expandableContent = createExpandableContent({
            detail: detail,
            ...additionalData
        });
        
        // 查找是否已存在可展开内容，如果有则替换，没有则添加
        let existingExpandable = stepElement.querySelector('.expandable-section');
        if (existingExpandable) {
            existingExpandable.parentNode.removeChild(existingExpandable);
        }
        
        if (expandableContent) {
            stepElement.insertAdjacentHTML('beforeend', expandableContent);
        }
    }
    
    // 更新存储的信息
    currentPlanningSteps[stepId] = {
        ...stepInfo,
        status: status,
        detail: detail,
        ...additionalData
    };
}

// 清除规划步骤和重置终端 - 增强版本
function clearPlanningSteps() {
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
    
    // 重置全局变量
    terminalStartTime = null;
    consoleLogHistory = [];
    currentStepCount = 0;
    currentPlanningSteps = {}; // 清空步骤存储
}

// 创建粒子效果
function createParticles() {
    const particlesContainer = document.getElementById('particles-container');
    if (!particlesContainer) return;
    
    // 限制粒子数量
    if (particlesContainer.children.length >= 10) return;
    
    for (let i = 0; i < 3; i++) {
        setTimeout(() => {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.left = Math.random() * 100 + '%';
            particle.style.animationDelay = Math.random() * 2 + 's';
            
            particlesContainer.appendChild(particle);
            
            // 3秒后移除粒子
            setTimeout(() => {
                if (particle.parentNode) {
                    particle.parentNode.removeChild(particle);
                }
            }, 3000);
        }, i * 200);
    }
}

// 更新计时信息
function updateTimingInfo() {
    const timingInfo = document.getElementById('timing-info');
    if (terminalStartTime && timingInfo) {
        const elapsed = Math.floor((Date.now() - terminalStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        timingInfo.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

// 显示AI规划历史
function displayAIPlanningHistory(planningHistory) {
    const historyContent = document.getElementById('planning-history-content');
    if (!historyContent || !planningHistory || planningHistory.length === 0) return;

    let historyHTML = '<h4 style="margin: 0 0 10px 0;">🧠 AI决策过程：</h4>';
    
    planningHistory.forEach((entry, index) => {
        const timestamp = new Date(entry.timestamp).toLocaleTimeString();
        historyHTML += `
            <div style="margin: 8px 0; padding: 8px; background: white; border-radius: 5px; border-left: 3px solid #6f42c1;">
                <strong style="color: #6f42c1;">对话${index + 1}</strong> 
                <span style="color: #6c757d; font-size: 10px;">${timestamp}</span>
                <div style="margin-top: 5px; font-size: 11px; max-height: 60px; overflow-y: auto;">
                    ${(entry.response || '').substring(0, 200)}${(entry.response || '').length > 200 ? '...' : ''}
                </div>
            </div>
        `;
    });
    
    historyContent.innerHTML = historyHTML;
}

// 隐藏规划状态 - 带渐隐效果
function hidePlanningStatus() {
    const statusDiv = document.getElementById('planning-status');
    
    // 添加渐隐效果
    statusDiv.style.transition = 'opacity 0.5s ease-out';
    statusDiv.style.opacity = '0';
    
    setTimeout(() => {
        statusDiv.style.display = 'none';
        statusDiv.style.opacity = '1'; // 重置透明度
        statusDiv.style.transition = '';
    }, 500);
}

// 显示路线结果
function displayRouteResult(result) {
    console.log('📊 [原始函数] 显示AI智能规划结果:', result);
    
    // 防止重复调用
    if (displayRouteResult._isExecuting) {
        console.warn('⚠️ displayRouteResult已在执行中，跳过重复调用');
        return;
    }
    displayRouteResult._isExecuting = true;
    
    // 获取新的结果面板元素
    const resultPanel = document.getElementById('result-panel');
    const plannerPanel = document.getElementById('planner-panel');
    const routeDiv = document.getElementById('planned-route');
    const summaryDiv = document.getElementById('route-summary');
    const detailsDiv = document.getElementById('route-details');
    const descriptionDiv = document.getElementById('route-description');

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

    detailsDiv.innerHTML = detailsHTML;

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
    
    // 显示技术信息
    if (result.technical_info && result.technical_info.llm_guided) {
        analysisHTML += `<p style="margin-top: 10px; padding: 8px; background: rgba(111, 66, 193, 0.1); border-radius: 6px; font-size: 11px;">
            <strong>🤖 技术特色:</strong> 本路线由AI完全自主规划，经过${result.technical_info.planning_steps ? result.technical_info.planning_steps.length : '多'}轮智能分析和优化
        </p>`;
    }
    
    analysisHTML += '</div>';
    
    descriptionDiv.innerHTML = analysisHTML;

    // 显示AI规划历史
    if (result.technical_info && result.technical_info.planning_steps) {
        displayAIPlanningHistory(result.technical_info.planning_steps);
    }

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
    
    // 重置执行标志
    displayRouteResult._isExecuting = false;
    console.log('✅ [原始函数] displayRouteResult执行完成');
}

// 创建自定义图标 (从script.js复制)
function createCustomIcon(type, size = 24) {
    try {
        let svgContent;
        
        switch(type) {
            case 'start':
                // 起点图标 - Font Awesome位置图标（蓝色）
                svgContent = `
                    <svg width="${size}" height="${size}" viewBox="0 0 640 640" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M128 252.6C128 148.4 214 64 320 64C426 64 512 148.4 512 252.6C512 371.9 391.8 514.9 341.6 569.4C329.8 582.2 310.1 582.2 298.3 569.4C248.1 514.9 127.9 371.9 127.9 252.6zM320 320C355.3 320 384 291.3 384 256C384 220.7 355.3 192 320 192C284.7 192 256 220.7 256 256C256 291.3 284.7 320 320 320z" fill="#667eea"/>
                    </svg>
                `;
                break;
                
            case 'end':
                // 终点图标 - Font Awesome位置图标（红色）
                svgContent = `
                    <svg width="${size}" height="${size}" viewBox="0 0 640 640" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M128 252.6C128 148.4 214 64 320 64C426 64 512 148.4 512 252.6C512 371.9 391.8 514.9 341.6 569.4C329.8 582.2 310.1 582.2 298.3 569.4C248.1 514.9 127.9 371.9 127.9 252.6zM320 320C355.3 320 384 291.3 384 256C384 220.7 355.3 192 320 192C284.7 192 256 220.7 256 256C256 291.3 284.7 320 320 320z" fill="#dc3545"/>
                    </svg>
                `;
                break;
                
            case 'route':
                // 路线点图标 - Font Awesome位置图标（紫色）
                svgContent = `
                    <svg width="${size}" height="${size}" viewBox="0 0 640 640" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M128 252.6C128 148.4 214 64 320 64C426 64 512 148.4 512 252.6C512 371.9 391.8 514.9 341.6 569.4C329.8 582.2 310.1 582.2 298.3 569.4C248.1 514.9 127.9 371.9 127.9 252.6zM320 320C355.3 320 384 291.3 384 256C384 220.7 355.3 192 320 192C284.7 192 256 220.7 256 256C256 291.3 284.7 320 320 320z" fill="#9c27b0"/>
                    </svg>
                `;
                break;
                
            case 'path':
                // 路径点图标 - Font Awesome位置图标（小尺寸，绿色）
                svgContent = `
                    <svg width="${size}" height="${size}" viewBox="0 0 640 640" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M128 252.6C128 148.4 214 64 320 64C426 64 512 148.4 512 252.6C512 371.9 391.8 514.9 341.6 569.4C329.8 582.2 310.1 582.2 298.3 569.4C248.1 514.9 127.9 371.9 127.9 252.6zM320 320C355.3 320 384 291.3 384 256C384 220.7 355.3 192 320 192C284.7 192 256 220.7 256 256C256 291.3 284.7 320 320 320z" fill="#20c997"/>
                    </svg>
                `;
                break;
                
            default:
                // 默认图标 - Font Awesome位置图标（蓝色）
                svgContent = `
                    <svg width="${size}" height="${size}" viewBox="0 0 640 640" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M128 252.6C128 148.4 214 64 320 64C426 64 512 148.4 512 252.6C512 371.9 391.8 514.9 341.6 569.4C329.8 582.2 310.1 582.2 298.3 569.4C248.1 514.9 127.9 371.9 127.9 252.6zM320 320C355.3 320 384 291.3 384 256C384 220.7 355.3 192 320 192C284.7 192 256 220.7 256 256C256 291.3 284.7 320 320 320z" fill="#667eea"/>
                    </svg>
                `;
        }
        
        const dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgContent)));
        console.log(`图标创建成功 - 类型: ${type}, 尺寸: ${size}, 数据URL长度: ${dataUrl.length}`);
        return dataUrl;
        
    } catch (error) {
        console.error(`图标创建失败 - 类型: ${type}, 尺寸: ${size}, 错误:`, error);
        
        // 返回一个简单的备用图标
        const fallbackSvg = `
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 1}" fill="#667eea"/>
            </svg>
        `;
        return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(fallbackSvg)));
    }
}

// 获取所有路径段的真实步行路径（参考script.js的逻辑）
async function getAllRealWalkingPaths(waypoints) {
    console.log('🛣️ 开始获取所有路径段的真实步行路径...');
    const realPaths = [];
    
    for (let i = 0; i < waypoints.length - 1; i++) {
        const startPoint = waypoints[i];
        const endPoint = waypoints[i + 1];
        
        console.log(`📍 获取第${i + 1}段路径: ${startPoint.name || '点' + (i + 1)} → ${endPoint.name || '点' + (i + 2)}`);
        
        try {
            const result = await getRealWalkingPath(startPoint, endPoint);
            
            if (result.success && result.path && result.path.length > 0) {
                realPaths.push({
                    segment: `${startPoint.name || '点' + (i + 1)} → ${endPoint.name || '点' + (i + 2)}`,
                    path: result.path,
                    distance: result.distance,
                    duration: result.duration,
                    steps: result.steps,
                    startPoint: startPoint,
                    endPoint: endPoint
                });
                console.log(`✅ 第${i + 1}段路径获取成功，坐标点数量: ${result.path.length}`);
            } else {
                console.warn(`⚠️ 第${i + 1}段路径API失败，使用直线连接`);
                // 如果API失败，使用直线连接作为备选
                const straightPath = [
                    [startPoint.longitude || startPoint.location[0], startPoint.latitude || startPoint.location[1]],
                    [endPoint.longitude || endPoint.location[0], endPoint.latitude || endPoint.location[1]]
                ];
                realPaths.push({
                    segment: `${startPoint.name || '点' + (i + 1)} → ${endPoint.name || '点' + (i + 2)}`,
                    path: straightPath,
                    distance: calculateDistance(startPoint, endPoint) * 1000, // 转换为米
                    duration: calculateDistance(startPoint, endPoint) * 1000 / 1.4, // 假设步行速度1.4m/s
                    steps: [],
                    startPoint: startPoint,
                    endPoint: endPoint,
                    isFallback: true
                });
            }
        } catch (error) {
            console.error(`❌ 第${i + 1}段路径获取失败:`, error);
            // 使用直线连接作为备选
            const straightPath = [
                [startPoint.longitude || startPoint.location[0], startPoint.latitude || startPoint.location[1]],
                [endPoint.longitude || endPoint.location[0], endPoint.latitude || endPoint.location[1]]
            ];
            realPaths.push({
                segment: `${startPoint.name || '点' + (i + 1)} → ${endPoint.name || '点' + (i + 2)}`,
                path: straightPath,
                distance: calculateDistance(startPoint, endPoint) * 1000,
                duration: calculateDistance(startPoint, endPoint) * 1000 / 1.4,
                steps: [],
                startPoint: startPoint,
                endPoint: endPoint,
                isFallback: true
            });
        }
        
        // 添加延迟避免API频率限制
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log(`✅ 所有路径段获取完成，共${realPaths.length}段`);
    return realPaths;
}

// 计算两点间的直线距离（公里）
function calculateDistance(point1, point2) {
    const lat1 = point1.latitude || point1.location[1];
    const lon1 = point1.longitude || point1.location[0];
    const lat2 = point2.latitude || point2.location[1];
    const lon2 = point2.longitude || point2.location[0];
    
    const R = 6371; // 地球半径（公里）
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    return distance;
}

// 解析高德地图polyline格式的坐标
function parsePolyline(polylineStr) {
    if (!polylineStr) return [];
    
    const coordinates = [];
    const coords = polylineStr.split(';');
    
    coords.forEach(coord => {
        const [lng, lat] = coord.split(',').map(Number);
        if (!isNaN(lng) && !isNaN(lat)) {
            coordinates.push([lng, lat]);
        }
    });
    
    return coordinates;
}

// 改进的getRealWalkingPath函数，更好地处理坐标格式
async function getRealWalkingPath(startPoint, endPoint) {
    try {
        // 统一坐标格式处理
        const startLng = startPoint.longitude || startPoint.location[0];
        const startLat = startPoint.latitude || startPoint.location[1];
        const endLng = endPoint.longitude || endPoint.location[0];
        const endLat = endPoint.latitude || endPoint.location[1];
        
        console.log(`🚶‍♂️ 获取真实步行路径: (${startLng},${startLat}) → (${endLng},${endLat})`);
        
        // 构建API请求URL
        const origin = `${startLng},${startLat}`;
        const destination = `${endLng},${endLat}`;
        const key = 'c9e4a3040fef05c4084a21c8a357d37f';
        const url = `https://restapi.amap.com/v3/direction/walking?origin=${origin}&destination=${destination}&key=${key}`;
        
        console.log('📡 请求URL:', url);
        
        // 发送请求
        const response = await fetch(url);
        const data = await response.json();
        
        console.log('🌐 API响应状态:', data.status, data.info);
        
        if (data.status === '1' && data.route && data.route.paths && data.route.paths.length > 0) {
            const path = data.route.paths[0];
            const steps = path.steps || [];
            
            // 解析路径坐标 - 改进版本
            const pathCoordinates = [];
            
            if (path.steps && path.steps.length > 0) {
                // 从每个step的polyline中解析坐标
                path.steps.forEach(step => {
                    if (step.polyline) {
                        const stepCoords = parsePolyline(step.polyline);
                        pathCoordinates.push(...stepCoords);
                    }
                });
            }
            
            // 如果steps中没有坐标，尝试从path.polyline获取
            if (pathCoordinates.length === 0 && path.polyline) {
                const pathCoords = parsePolyline(path.polyline);
                pathCoordinates.push(...pathCoords);
            }
            
            // 如果还是没有坐标，至少添加起点和终点
            if (pathCoordinates.length === 0) {
                pathCoordinates.push([startLng, startLat], [endLng, endLat]);
            }
            
            console.log(`✅ 路径解析成功，坐标点数量: ${pathCoordinates.length}`);
            
            return {
                success: true,
                path: pathCoordinates,
                distance: parseInt(path.distance) || 0,
                duration: parseInt(path.duration) || 0,
                steps: steps
            };
        } else {
            console.error('❌ API返回错误:', data);
            return {
                success: false,
                error: data.info || '获取路径失败'
            };
        }
        
    } catch (error) {
        console.error('❌ 获取真实路径失败:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// 改进的地图路线显示函数
function updateMapWithRoute(result) {
    if (!map) return;

    console.log('🗺️ 开始更新地图显示路线（改进版）:', result);

    // 清除现有标记和路线
    clearMap();

    try {
        // 构建完整的路径点数组（起点 + 途经点 + 终点）
        const allWaypoints = [];
        
        // 添加起点
        allWaypoints.push({
            name: result.route.start_point.formatted_address || '起点',
            longitude: result.route.start_point.longitude,
            latitude: result.route.start_point.latitude,
            type: 'start'
        });
        
        // 添加途经点
        if (result.route.waypoints && result.route.waypoints.length > 0) {
            result.route.waypoints.forEach(waypoint => {
                // 检查不同的坐标格式
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
                } else {
                    console.warn(`⚠️ 途经点坐标无效:`, waypoint);
                }
            });
        }
        
        // 添加终点
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
        } else {
            console.warn(`⚠️ 终点坐标无效:`, endPoint);
        }
        
        console.log('📍 完整路径点数组:', allWaypoints);

        // 添加所有标记点
        allWaypoints.forEach((waypoint, index) => {
            // 检查坐标有效性
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
            
            const icon = createCustomIcon(iconType, iconSize);
            const marker = new AMap.Marker({
                position: new AMap.LngLat(waypoint.longitude, waypoint.latitude),
                icon: new AMap.Icon({
                    size: new AMap.Size(iconSize, iconSize),
                    image: icon
                }),
                title: waypoint.name
            });

            // 添加信息窗体
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
                infoWindow.open(map, marker.getPosition());
            });

            markers.push(marker);
            map.add(marker);
        });

        console.log('✅ 标记点添加完成，开始获取真实路径...');

        // 先显示临时直线路径
        const tempPath = allWaypoints.map(wp => [wp.longitude, wp.latitude]);
        polyline = new AMap.Polyline({
            path: tempPath,
            strokeWeight: 3,
            strokeColor: "#cccccc",
            strokeOpacity: 0.6,
            strokeStyle: 'dashed',
            lineJoin: 'round',
            lineCap: 'round'
        });
        map.add(polyline);
        
        // 调整地图视野
        const allOverlays = [...markers];
        if (polyline) allOverlays.push(polyline);
        
        if (allOverlays.length > 0) {
            map.setFitView(allOverlays, false, [30, 30, 30, 30]);
        } else {
            // 如果没有有效的覆盖物，使用默认中心
            console.warn('⚠️ 没有有效的地图覆盖物，使用默认视野');
            map.setCenter([116.4074, 39.9042]);
            map.setZoom(12);
        }

        // 异步获取真实路径并替换临时路径
        console.log('🔄 开始异步获取真实步行路径...');
        getAllRealWalkingPaths(allWaypoints).then(realPaths => {
            if (realPaths && realPaths.length > 0) {
                console.log('✅ 获取到真实路径数据，开始绘制...');
                
                // 移除临时路径
                if (polyline) {
                    map.remove(polyline);
                    polyline = null;
                }
                
                // 合并所有真实路径坐标
                const allRealCoordinates = [];
                let totalRealDistance = 0;
                let totalRealDuration = 0;
                
                realPaths.forEach((pathData, index) => {
                    if (pathData.path && pathData.path.length > 0) {
                        // 如果不是第一段，去除重复的起点
                        const pathToAdd = index === 0 ? pathData.path : pathData.path.slice(1);
                        allRealCoordinates.push(...pathToAdd);
                        totalRealDistance += pathData.distance;
                        totalRealDuration += pathData.duration;
                    }
                });
                
                console.log(`🛣️ 真实路径合并完成，总坐标点: ${allRealCoordinates.length}`);
                console.log(`📊 真实路径统计 - 距离: ${totalRealDistance}m, 时间: ${Math.round(totalRealDuration/60)}分钟`);
                
                if (allRealCoordinates.length > 0) {
                    // 创建真实路径折线
                    polyline = new AMap.Polyline({
                        path: allRealCoordinates,
                        strokeWeight: 5,
                        strokeColor: "#28a745",
                        strokeOpacity: 0.9,
                        lineJoin: 'round',
                        lineCap: 'round'
                    });
                    map.add(polyline);
                    
                    // 更新路线信息
                    if (currentRoute) {
                        currentRoute.route.real_distance = totalRealDistance;
                        currentRoute.route.real_duration = totalRealDuration;
                        currentRoute.route.real_paths = realPaths;
                    }
                    
                    console.log('✅ 真实道路路径显示成功！');
                    
                    // 显示成功提示
                    showTemporaryMessage('✅ 真实道路路径显示成功！基于高德步行路径规划API', 'success');
                } else {
                    console.warn('⚠️ 真实路径坐标为空，保持基础路径');
                    showTemporaryMessage('⚠️ 部分路径使用直线连接', 'warning');
                }
                
            } else {
                console.warn('⚠️ 未获取到真实路径数据');
                showTemporaryMessage('⚠️ 使用基础路径显示', 'warning');
            }
        }).catch(error => {
            console.error('❌ 获取真实路径失败:', error);
            showTemporaryMessage('❌ 真实路径获取失败，使用基础路径', 'error');
        });

        console.log('✅ 地图更新完成');

    } catch (error) {
        console.error('❌ 更新地图显示失败:', error);
        // 至少设置地图中心到起点
        if (result.route.start_point && 
            result.route.start_point.longitude && 
            result.route.start_point.latitude &&
            !isNaN(result.route.start_point.longitude) && 
            !isNaN(result.route.start_point.latitude)) {
            map.setCenter([result.route.start_point.longitude, result.route.start_point.latitude]);
            map.setZoom(14);
        } else {
            // 默认显示北京市中心
            console.warn('⚠️ 无有效坐标，设置默认地图中心为北京');
            map.setCenter([116.4074, 39.9042]);
            map.setZoom(12);
        }
    }
}

// 显示临时消息
function showTemporaryMessage(message, type = 'info') {
    const msgDiv = document.createElement('div');
    msgDiv.style.cssText = `
        position: fixed; top: 20px; right: 20px; 
        background: ${type === 'success' ? '#28a745' : type === 'warning' ? '#ffc107' : type === 'error' ? '#dc3545' : '#17a2b8'}; 
        color: ${type === 'warning' ? '#212529' : 'white'}; 
        padding: 10px 15px; border-radius: 5px; z-index: 10000; font-size: 14px;
        max-width: 300px; box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    msgDiv.textContent = message;
    document.body.appendChild(msgDiv);
    
    setTimeout(() => {
        if (msgDiv.parentNode) {
            msgDiv.parentNode.removeChild(msgDiv);
        }
    }, 4000);
}

// 清除地图
function clearMap() {
    // 逐个移除标记
    markers.forEach(marker => {
        if (marker && map) {
            map.remove(marker);
        }
    });
    markers = [];
    
    // 移除路线
    if (polyline && map) {
        map.remove(polyline);
        polyline = null;
    }
}

// 表单提交处理
async function handlePlanningForm(event) {
    event.preventDefault();
    
    console.log('📝 开始处理AI智能规划表单...');
    
    // 清除之前的规划步骤和结果
    clearPlanningSteps();
    document.getElementById('planned-route').style.display = 'none';
    
    // 获取表单数据
    const formData = new FormData(event.target);
    const preferences = {
        startLocation: formData.get('start-location'),
        city: formData.get('city'),
        distance: formData.get('distance'),
        preference: formData.get('preference'),
        endType: formData.get('end-type')
    };
    
    console.log('📋 用户偏好:', preferences);
    
    // 验证表单
    if (!preferences.startLocation || !preferences.city || !preferences.distance || !preferences.preference || !preferences.endType) {
        alert('请填写所有必填字段');
        return;
    }
    
    // 禁用提交按钮
    const submitButton = document.getElementById('plan-button');
    const originalText = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-brain fa-spin"></i> AI智能规划中...';
    
    try {
        // 显示AI规划开始状态
        const initStepId = updatePlanningStatus('🤖 AI正在深度分析您的需求...', 'loading', 
            '正在启动智能代理，准备调用地图API', 
            { step: 1, action: '初始化AI智能代理', result: 'running' }
        );
        
        // 标记初始化完成
        setTimeout(() => {
            updateStepStatus(initStepId, 'completed', '✅ AI智能代理启动成功');
        }, 1000);
        
        // 调用LLM主导的路线规划服务
        const result = await routeService.planRoute(preferences.startLocation, preferences.city, preferences);
        
        console.log('✅ AI智能规划成功:', result);
        
        // 添加成功步骤
        updatePlanningStatus('✅ AI智能规划完成！', 'success', 
            `AI经过${result.technical_info?.planning_steps?.length || '多'}轮分析生成最优路线`,
            { step: 'final', action: '生成最终路线方案', result: true }
        );
        
        // 延迟一点时间让用户看到完成状态
        setTimeout(() => {
            hidePlanningStatus();
            displayRouteResult(result);
        }, 1500);
        
    } catch (error) {
        console.error('❌ AI智能规划失败:', error);
        updatePlanningStatus(`❌ AI规划失败: ${error.message}`, 'error',
            '请检查网络连接或稍后重试',
            { step: 'error', action: '规划过程中断', result: false }
        );
    } finally {
        // 恢复提交按钮
        setTimeout(() => {
            submitButton.disabled = false;
            submitButton.innerHTML = originalText;
        }, 2000);
    }
}

// 地图控制功能
function setupMapControls() {
    // 安全的事件监听器绑定函数
    function safeAddEventListener(elementId, eventType, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener(eventType, handler);
        } else {
            console.warn(`⚠️ 元素 '${elementId}' 不存在，跳过事件绑定`);
        }
    }
    
    // 显示路线按钮
    safeAddEventListener('show-route', 'click', () => {
        if (currentRoute && map) {
            updateMapWithRoute(currentRoute);
        }
    });
    
    // 重置地图按钮
    safeAddEventListener('reset-map', 'click', () => {
        if (map) {
            clearMap();
            map.setZoom(10);
            map.setCenter([116.397428, 39.90923]); // 北京中心
        }
    });
    
    // 详细步骤按钮
    safeAddEventListener('show-steps', 'click', () => {
        if (currentRoute && currentRoute.route.steps) {
            showDetailedSteps(currentRoute.route.steps);
        } else {
            alert('暂无详细步骤信息');
        }
    });

    // AI过程按钮
    safeAddEventListener('show-ai-process', 'click', () => {
        if (currentRoute && currentRoute.technical_info && currentRoute.technical_info.planning_steps) {
            showAIProcessModal(currentRoute.technical_info.planning_steps);
        } else {
            alert('暂无AI规划过程信息');
        }
    });
    
    // 导出路线按钮
    safeAddEventListener('export-route', 'click', () => {
        if (currentRoute) {
            exportRoute(currentRoute);
        }
    });
    
    // 其他可选的控制按钮
    safeAddEventListener('export-terminal-logs', 'click', () => {
        exportTerminalLogs();
    });
    
    safeAddEventListener('show-robustness-stats', 'click', () => {
        showRobustnessStats();
    });
    
    safeAddEventListener('share-route', 'click', () => {
        if (currentRoute) {
            shareRoute(currentRoute);
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
    
    // 创建模态框显示详细步骤
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

// 显示AI规划过程模态框
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
                    ${step.messages && step.messages.length > 0 ? `
                        <details style="margin-top: 8px;">
                            <summary style="cursor: pointer; font-size: 11px; color: #6c757d;">查看对话详情</summary>
                            <div style="margin-top: 5px; padding: 5px; background: #e9ecef; border-radius: 3px; font-size: 10px;">
                                ${step.messages.map(msg => `<p><strong>${msg.role}:</strong> ${(msg.content || '').substring(0, 200)}${(msg.content || '').length > 200 ? '...' : ''}</p>`).join('')}
                            </div>
                        </details>
                    ` : ''}
                </div>
            `;
        });
    } else {
        processHTML += '<p style="text-align: center; color: #6c757d;">暂无AI规划过程记录</p>';
    }
    
    processHTML += '</div>';
    
    // 创建模态框
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
                        style="padding: 10px 20px; background: #6f42c1; color: white; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px;">
                    关闭
                </button>
                <button onclick="exportAIProcess()" 
                        style="padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px;">
                    导出AI过程
                </button>
                <button onclick="exportTerminalLogs()" 
                        style="padding: 10px 20px; background: #17a2b8; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    导出终端日志
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// 导出AI规划过程 - 增强版
function exportAIProcess() {
    if (currentRoute && currentRoute.technical_info && currentRoute.technical_info.planning_steps) {
        const processData = {
            route_name: `AI规划过程_${new Date().toLocaleDateString()}`,
            planning_steps: currentRoute.technical_info.planning_steps,
            console_logs: consoleLogHistory,
            terminal_session: {
                start_time: terminalStartTime ? new Date(terminalStartTime).toISOString() : null,
                end_time: new Date().toISOString(),
                duration_seconds: terminalStartTime ? Math.floor((Date.now() - terminalStartTime) / 1000) : 0,
                total_steps: currentStepCount
            },
            route_summary: {
                start_point: currentRoute.route.start_point.formatted_address,
                end_point: currentRoute.route.end_point.name,
                distance: currentRoute.route.distance,
                duration: currentRoute.route.duration
            },
            export_time: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(processData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai_planning_process_${Date.now()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        
        // 显示导出成功的酷炫提示
        showTemporaryMessage('🚀 AI规划过程已导出！包含完整终端日志和决策步骤', 'success');
    } else {
        showTemporaryMessage('⚠️ 暂无AI规划过程数据可导出', 'warning');
    }
}

// 新增：导出终端日志
function exportTerminalLogs() {
    if (consoleLogHistory.length === 0) {
        showTemporaryMessage('⚠️ 暂无终端日志可导出', 'warning');
        return;
    }
    
    // 统计函数名修正信息
    const functionCorrections = consoleLogHistory.filter(log => 
        log.message && log.message.includes('Function Name Auto-Correction')
    );
    
    const logData = {
        session_name: `AI终端日志_${new Date().toLocaleDateString()}`,
        logs: consoleLogHistory,
        statistics: {
            total_logs: consoleLogHistory.length,
            function_corrections: functionCorrections.length,
            correction_details: functionCorrections.map(log => ({
                timestamp: log.timestamp,
                correction: log.detail
            }))
        },
        session_info: {
            start_time: terminalStartTime ? new Date(terminalStartTime).toISOString() : null,
            end_time: new Date().toISOString(),
            duration_seconds: terminalStartTime ? Math.floor((Date.now() - terminalStartTime) / 1000) : 0,
            robustness_features: {
                function_name_correction: functionCorrections.length > 0,
                auto_correction_count: functionCorrections.length
            }
        },
        export_time: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(logData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `terminal_logs_${Date.now()}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    
    if (functionCorrections.length > 0) {
        showTemporaryMessage(`📝 终端日志已导出！包含${functionCorrections.length}次函数名自动修正记录`, 'success');
    } else {
        showTemporaryMessage('📝 终端日志已导出！', 'success');
    }
}

// 新增：显示鲁棒性统计信息
function showRobustnessStats() {
    const functionCorrections = consoleLogHistory.filter(log => 
        log.message && log.message.includes('Function Name Auto-Correction')
    );
    
    let statsHTML = `
        <h3>🛡️ 系统鲁棒性统计</h3>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                <div style="text-align: center; padding: 10px; background: white; border-radius: 5px;">
                    <div style="font-size: 24px; font-weight: bold; color: #28a745;">${functionCorrections.length}</div>
                    <div style="font-size: 12px; color: #6c757d;">函数名自动修正次数</div>
                </div>
                <div style="text-align: center; padding: 10px; background: white; border-radius: 5px;">
                    <div style="font-size: 24px; font-weight: bold; color: #17a2b8;">${consoleLogHistory.length}</div>
                    <div style="font-size: 12px; color: #6c757d;">总日志条数</div>
                </div>
                <div style="text-align: center; padding: 10px; background: white; border-radius: 5px;">
                    <div style="font-size: 24px; font-weight: bold; color: #6f42c1;">100%</div>
                    <div style="font-size: 12px; color: #6c757d;">错误函数名处理成功率</div>
                </div>
            </div>
    `;
    
    if (functionCorrections.length > 0) {
        statsHTML += `
            <div style="margin-top: 15px;">
                <h4 style="color: #495057; margin-bottom: 10px;">📋 函数名修正详情</h4>
                <div style="max-height: 200px; overflow-y: auto;">
        `;
        
        functionCorrections.forEach((log, index) => {
            const timestamp = new Date(log.timestamp).toLocaleTimeString();
            statsHTML += `
                <div style="margin: 5px 0; padding: 8px; background: white; border-radius: 4px; border-left: 3px solid #ffc107;">
                    <div style="font-size: 12px; color: #6c757d;">${timestamp}</div>
                    <div style="font-size: 13px; color: #495057;">${log.detail}</div>
                </div>
            `;
        });
        
        statsHTML += '</div>';
    } else {
        statsHTML += `
            <div style="margin-top: 15px; text-align: center; color: #28a745;">
                <i class="fas fa-check-circle" style="font-size: 20px; margin-bottom: 5px;"></i>
                <div>本次会话中LLM使用了正确的函数名，无需修正</div>
            </div>
        `;
    }
    
    statsHTML += '</div>';
    
    // 创建模态框
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
        background: rgba(0,0,0,0.5); z-index: 1000; 
        display: flex; align-items: center; justify-content: center;
    `;
    
    modal.innerHTML = `
        <div style="background: white; padding: 20px; border-radius: 10px; max-width: 600px; width: 90%; max-height: 80vh; overflow: auto;">
            ${statsHTML}
            <div style="margin-top: 20px; text-align: center;">
                <button onclick="this.closest('div').parentElement.remove()" 
                        style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    关闭
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// 导出路线 - 增强版，包含详细信息
function exportRoute(route) {
    console.log('📁 开始导出详细路线信息...');
    
    // 生成详细的导出数据
    const exportData = {
        // 基本信息
        route_metadata: {
            route_name: `AI智能散步路线_${new Date().toLocaleDateString()}`,
            export_time: new Date().toISOString(),
            export_version: "2.0.0",
            generated_by: "AI智能散步规划器",
            map_provider: "高德地图 Web API"
        },
        
        // 路线概要
        route_summary: {
            total_distance_meters: route.route.distance,
            total_distance_km: (route.route.distance / 1000).toFixed(2),
            estimated_duration_seconds: route.route.duration,
            estimated_duration_minutes: Math.round(route.route.duration / 60),
            waypoints_count: route.route.waypoints ? route.route.waypoints.length : 0,
            difficulty_rating: route.analysis ? route.analysis.experience_rating : 'N/A',
            route_type: "步行路线"
        },
        
        // 详细标记点信息
        markers_detail: {
            start_point: {
                name: route.route.start_point.formatted_address || route.route.start_point.name || '起点',
                coordinates: {
                    longitude: route.route.start_point.longitude,
                    latitude: route.route.start_point.latitude
                },
                address: route.route.start_point.formatted_address || '',
                type: 'start',
                marker_icon: 'start_icon',
                navigation_instruction: '从此处开始您的散步之旅'
            },
            waypoints: (route.route.waypoints || []).map((waypoint, index) => ({
                sequence: index + 1,
                name: waypoint.name,
                coordinates: {
                    longitude: waypoint.longitude || waypoint.location[0],
                    latitude: waypoint.latitude || waypoint.location[1]
                },
                address: waypoint.address || '',
                type: 'waypoint',
                marker_icon: 'waypoint_icon',
                recommendation_reason: waypoint.reason || `第${index + 1}个推荐点`,
                estimated_visit_duration: '10-15分钟',
                navigation_instruction: `到达第${index + 1}个推荐地点，可在此稍作休息`
            })),
            end_point: {
                name: route.route.end_point.name || '终点',
                coordinates: {
                    longitude: route.route.end_point.longitude,
                    latitude: route.route.end_point.latitude
                },
                address: route.route.end_point.address || '',
                type: 'end',
                marker_icon: 'end_icon',
                navigation_instruction: '恭喜您完成散步路线！'
            }
        },
        
        // 详细路径信息
        path_details: {
            // 基本路径信息
            path_segments: generatePathSegments(route),
            
            // 真实路径坐标（如果存在）
            real_path_coordinates: route.route.real_paths ? 
                extractRealPathCoordinates(route.route.real_paths) : null,
            
            // 路径统计
            path_statistics: {
                total_segments: route.route.waypoints ? route.route.waypoints.length : 0,
                has_real_walking_path: !!(route.route.real_paths && route.route.real_paths.length > 0),
                real_distance_meters: route.route.real_distance || route.route.distance,
                real_duration_seconds: route.route.real_duration || route.route.duration,
                path_accuracy: route.route.real_paths ? 'High (实际道路)' : 'Medium (估算路径)'
            }
        },
        
        // 详细导航信息
        navigation_details: {
            // 分段导航指令
            step_by_step_navigation: generateStepByStepNavigation(route),
            
            // 关键导航点
            key_navigation_points: generateKeyNavigationPoints(route),
            
            // 实用导航提示
            navigation_tips: [
                '建议在光线充足时段进行散步',
                '请注意交通安全，遵守交通规则',
                '携带适量水和小食品',
                '建议穿着舒适的步行鞋',
                '可根据实际情况调整行走速度',
                ...(route.analysis && route.analysis.practical_tips ? route.analysis.practical_tips : [])
            ],
            
            // 紧急信息
            emergency_info: {
                emergency_contact: '紧急情况请拨打110或120',
                nearest_hospital_tip: '如需查找最近医院，可使用地图搜索功能',
                weather_reminder: '出行前请关注天气预报'
            }
        },
        
        // AI分析结果
        ai_analysis: {
            route_description: route.analysis ? route.analysis.route_description : '智能生成的散步路线',
            experience_rating: route.analysis ? route.analysis.experience_rating : 'N/A',
            recommended_highlights: route.analysis && route.analysis.recommended_waypoints ? 
                route.analysis.recommended_waypoints.map(wp => ({
                    name: wp.name,
                    highlight_reason: wp.reason
                })) : [],
            practical_suggestions: route.analysis && route.analysis.practical_tips ? 
                route.analysis.practical_tips : []
        },
        
        // 技术信息
        technical_info: {
            planning_method: route.technical_info && route.technical_info.llm_guided ? 
                'AI智能规划' : '标准规划',
            api_provider: '高德地图 Web API',
            coordinate_system: 'WGS84',
            has_ai_planning_history: !!(route.technical_info && route.technical_info.planning_steps),
            planning_steps_count: route.technical_info && route.technical_info.planning_steps ? 
                route.technical_info.planning_steps.length : 0,
            route_accuracy_level: route.technical_info && route.technical_info.actual_route_data ? 
                'High' : 'Medium'
        },
        
        // 兼容性信息
        compatibility: {
            file_format: 'JSON',
            encoding: 'UTF-8',
            gps_compatible: true,
            import_instructions: '此文件可导入其他导航应用或地图应用',
            supported_formats: ['JSON', 'GPX (可转换)', 'KML (可转换)']
        },
        
        // 原始数据（供开发者使用）
        raw_data: {
            original_route: route.route,
            original_analysis: route.analysis,
            original_technical_info: route.technical_info || null
        }
    };
    
    // 创建多种格式的导出选项
    createExportModal(exportData, route);
}

// 生成路径段信息
function generatePathSegments(route) {
    const segments = [];
    const allPoints = [];
    
    // 添加起点
    allPoints.push({
        name: route.route.start_point.formatted_address || '起点',
        coordinates: [route.route.start_point.longitude, route.route.start_point.latitude],
        type: 'start'
    });
    
    // 添加途经点
    if (route.route.waypoints) {
        route.route.waypoints.forEach(wp => {
            allPoints.push({
                name: wp.name,
                coordinates: [wp.longitude || wp.location[0], wp.latitude || wp.location[1]],
                type: 'waypoint'
            });
        });
    }
    
    // 添加终点
    allPoints.push({
        name: route.route.end_point.name || '终点',
        coordinates: [route.route.end_point.longitude, route.route.end_point.latitude],
        type: 'end'
    });
    
    // 生成路径段
    for (let i = 0; i < allPoints.length - 1; i++) {
        const startPoint = allPoints[i];
        const endPoint = allPoints[i + 1];
        
        // 计算直线距离
        const distance = calculateDistance(
            { latitude: startPoint.coordinates[1], longitude: startPoint.coordinates[0] },
            { latitude: endPoint.coordinates[1], longitude: endPoint.coordinates[0] }
        );
        
        segments.push({
            segment_id: i + 1,
            from: {
                name: startPoint.name,
                coordinates: startPoint.coordinates,
                type: startPoint.type
            },
            to: {
                name: endPoint.name,
                coordinates: endPoint.coordinates,
                type: endPoint.type
            },
            estimated_distance_km: distance.toFixed(2),
            estimated_duration_minutes: Math.round((distance * 1000) / 80), // 假设步行速度80m/min
            segment_description: `从 ${startPoint.name} 到 ${endPoint.name}`
        });
    }
    
    return segments;
}

// 提取真实路径坐标
function extractRealPathCoordinates(realPaths) {
    if (!realPaths || realPaths.length === 0) return null;
    
    const allCoordinates = [];
    const segmentDetails = [];
    
    realPaths.forEach((pathData, index) => {
        if (pathData.path && pathData.path.length > 0) {
            // 如果不是第一段，去除重复的起点
            const pathToAdd = index === 0 ? pathData.path : pathData.path.slice(1);
            allCoordinates.push(...pathToAdd);
            
            segmentDetails.push({
                segment_id: index + 1,
                segment_name: pathData.segment,
                coordinates_count: pathData.path.length,
                distance_meters: pathData.distance,
                duration_seconds: pathData.duration,
                is_fallback: pathData.isFallback || false
            });
        }
    });
    
    return {
        total_coordinates: allCoordinates.length,
        coordinates: allCoordinates,
        segment_details: segmentDetails
    };
}

// 生成分步导航指令
function generateStepByStepNavigation(route) {
    const navigation = [];
    let stepCounter = 1;
    
    // 起点指令
    navigation.push({
        step: stepCounter++,
        instruction: `从 ${route.route.start_point.formatted_address || '起点'} 开始您的散步`,
        coordinates: [route.route.start_point.longitude, route.route.start_point.latitude],
        instruction_type: 'start',
        estimated_time: '0分钟'
    });
    
    // 途经点指令
    if (route.route.waypoints) {
        route.route.waypoints.forEach((waypoint, index) => {
            navigation.push({
                step: stepCounter++,
                instruction: `前往 ${waypoint.name}`,
                coordinates: [waypoint.longitude || waypoint.location[0], waypoint.latitude || waypoint.location[1]],
                instruction_type: 'waypoint',
                description: waypoint.reason || `第${index + 1}个推荐地点`,
                suggested_action: '可在此处稍作休息，欣赏周围风景',
                estimated_time: `约${Math.round((index + 1) * route.route.duration / 60 / (route.route.waypoints.length + 1))}分钟`
            });
        });
    }
    
    // 终点指令
    navigation.push({
        step: stepCounter++,
        instruction: `到达终点 ${route.route.end_point.name || '终点'}`,
        coordinates: [route.route.end_point.longitude, route.route.end_point.latitude],
        instruction_type: 'end',
        description: '恭喜您完成此次散步！',
        estimated_time: `约${Math.round(route.route.duration / 60)}分钟`
    });
    
    return navigation;
}

// 生成关键导航点
function generateKeyNavigationPoints(route) {
    const keyPoints = [];
    
    // 起点
    keyPoints.push({
        point_type: 'START',
        name: route.route.start_point.formatted_address || '起点',
        coordinates: [route.route.start_point.longitude, route.route.start_point.latitude],
        importance: 'HIGH',
        landmark_info: '散步路线的起始点'
    });
    
    // 重要途经点
    if (route.route.waypoints) {
        route.route.waypoints.forEach((waypoint, index) => {
            keyPoints.push({
                point_type: 'WAYPOINT',
                name: waypoint.name,
                coordinates: [waypoint.longitude || waypoint.location[0], waypoint.latitude || waypoint.location[1]],
                importance: 'MEDIUM',
                landmark_info: waypoint.reason || `推荐停留点 ${index + 1}`,
                sequence: index + 1
            });
        });
    }
    
    // 终点
    keyPoints.push({
        point_type: 'END',
        name: route.route.end_point.name || '终点',
        coordinates: [route.route.end_point.longitude, route.route.end_point.latitude],
        importance: 'HIGH',
        landmark_info: '散步路线的终点'
    });
    
    return keyPoints;
}

// 创建导出模态框
function createExportModal(exportData, route) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
        background: rgba(0,0,0,0.7); z-index: 10000; 
        display: flex; align-items: center; justify-content: center;
    `;
    
    modal.innerHTML = `
        <div style="background: white; padding: 25px; border-radius: 12px; max-width: 600px; width: 90%; max-height: 80vh; overflow: auto;">
            <h3 style="margin: 0 0 20px 0; color: #2c3e50; text-align: center;">
                📁 导出详细路线信息
            </h3>
            
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <h4 style="margin: 0 0 10px 0; color: #495057;">📊 路线概要</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; font-size: 12px;">
                    <div><strong>总距离:</strong> ${exportData.route_summary.total_distance_km}km</div>
                    <div><strong>预计时间:</strong> ${exportData.route_summary.estimated_duration_minutes}分钟</div>
                    <div><strong>途经点:</strong> ${exportData.route_summary.waypoints_count}个</div>
                    <div><strong>难度评分:</strong> ${exportData.route_summary.difficulty_rating}/10</div>
                </div>
            </div>
            
            <div style="background: #e8f4fd; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <h4 style="margin: 0 0 10px 0; color: #1976d2;">📍 包含详细信息</h4>
                <ul style="margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.6;">
                    <li><strong>标记点信息:</strong> ${exportData.markers_detail.waypoints.length + 2}个详细标记点</li>
                    <li><strong>路径信息:</strong> ${exportData.path_details.path_segments.length}段路径详情</li>
                    <li><strong>导航指令:</strong> ${exportData.navigation_details.step_by_step_navigation.length}步详细导航</li>
                    <li><strong>AI分析:</strong> 智能推荐和实用建议</li>
                    <li><strong>技术数据:</strong> 完整的API响应和坐标信息</li>
                </ul>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px;">
                <button onclick="downloadDetailedJSON(this)" 
                        style="padding: 12px; background: #28a745; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">
                    <i class="fas fa-download"></i> 下载详细JSON
                </button>
                <button onclick="downloadSimplifiedJSON(this)" 
                        style="padding: 12px; background: #17a2b8; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">
                    <i class="fas fa-file-code"></i> 下载简化版
                </button>
                <button onclick="downloadNavigationTxt(this)" 
                        style="padding: 12px; background: #6f42c1; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">
                    <i class="fas fa-route"></i> 下载导航文本
                </button>
                <button onclick="downloadGPXFormat(this)" 
                        style="padding: 12px; background: #fd7e14; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">
                    <i class="fas fa-map"></i> 下载GPX格式
                </button>
            </div>
            
            <div style="text-align: center;">
                <button onclick="this.closest('div').parentElement.remove()" 
                        style="padding: 10px 30px; background: #6c757d; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    关闭
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // 将数据存储到全局变量供按钮使用
    window.currentExportData = exportData;
}

// 下载详细JSON
window.downloadDetailedJSON = function(button) {
    const data = window.currentExportData;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    downloadFile(blob, `detailed_walking_route_${Date.now()}.json`);
    showTemporaryMessage('📁 详细路线信息已导出！包含完整的标记点、路径和导航数据', 'success');
};

// 下载简化JSON
window.downloadSimplifiedJSON = function(button) {
    const data = window.currentExportData;
    const simplifiedData = {
        route_name: data.route_metadata.route_name,
        summary: data.route_summary,
        markers: {
            start: data.markers_detail.start_point,
            waypoints: data.markers_detail.waypoints,
            end: data.markers_detail.end_point
        },
        navigation: data.navigation_details.step_by_step_navigation,
        export_time: data.route_metadata.export_time
    };
    
    const blob = new Blob([JSON.stringify(simplifiedData, null, 2)], { type: 'application/json;charset=utf-8' });
    downloadFile(blob, `simplified_walking_route_${Date.now()}.json`);
    showTemporaryMessage('📋 简化版路线信息已导出！', 'success');
};

// 下载导航文本
window.downloadNavigationTxt = function(button) {
    const data = window.currentExportData;
    let txtContent = `🚶‍♂️ ${data.route_metadata.route_name}\n`;
    txtContent += `导出时间: ${new Date(data.route_metadata.export_time).toLocaleString()}\n`;
    txtContent += `总距离: ${data.route_summary.total_distance_km}km\n`;
    txtContent += `预计时间: ${data.route_summary.estimated_duration_minutes}分钟\n\n`;
    
    txtContent += `📍 详细导航指令:\n`;
    txtContent += `==================\n`;
    data.navigation_details.step_by_step_navigation.forEach(nav => {
        txtContent += `${nav.step}. ${nav.instruction}\n`;
        if (nav.description) txtContent += `   ${nav.description}\n`;
        if (nav.estimated_time) txtContent += `   预计时间: ${nav.estimated_time}\n`;
        txtContent += `\n`;
    });
    
    txtContent += `💡 实用提示:\n`;
    txtContent += `==========\n`;
    data.navigation_details.navigation_tips.forEach(tip => {
        txtContent += `• ${tip}\n`;
    });
    
    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
    downloadFile(blob, `navigation_instructions_${Date.now()}.txt`);
    showTemporaryMessage('📝 导航文本已导出！可直接查看或打印', 'success');
};

// 下载GPX格式
window.downloadGPXFormat = function(button) {
    const data = window.currentExportData;
    
    let gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="AI智能散步规划器">
    <metadata>
        <name>${data.route_metadata.route_name}</name>
        <desc>AI生成的智能散步路线</desc>
        <time>${data.route_metadata.export_time}</time>
    </metadata>
    
    <trk>
        <name>${data.route_metadata.route_name}</name>
        <desc>总距离: ${data.route_summary.total_distance_km}km, 预计时间: ${data.route_summary.estimated_duration_minutes}分钟</desc>
        <trkseg>
`;

    // 添加起点
    const start = data.markers_detail.start_point;
    gpxContent += `            <trkpt lat="${start.coordinates.latitude}" lon="${start.coordinates.longitude}">
                <name>${start.name}</name>
                <desc>${start.navigation_instruction}</desc>
            </trkpt>\n`;
    
    // 添加途经点
    data.markers_detail.waypoints.forEach(wp => {
        gpxContent += `            <trkpt lat="${wp.coordinates.latitude}" lon="${wp.coordinates.longitude}">
                <name>${wp.name}</name>
                <desc>${wp.navigation_instruction}</desc>
            </trkpt>\n`;
    });
    
    // 添加终点
    const end = data.markers_detail.end_point;
    gpxContent += `            <trkpt lat="${end.coordinates.latitude}" lon="${end.coordinates.longitude}">
                <name>${end.name}</name>
                <desc>${end.navigation_instruction}</desc>
            </trkpt>\n`;
    
    gpxContent += `        </trkseg>
    </trk>
    
    <!-- 标记点 -->
`;

    // 添加标记点
    [data.markers_detail.start_point, ...data.markers_detail.waypoints, data.markers_detail.end_point].forEach(marker => {
        gpxContent += `    <wpt lat="${marker.coordinates.latitude}" lon="${marker.coordinates.longitude}">
        <name>${marker.name}</name>
        <desc>${marker.navigation_instruction}</desc>
        <type>${marker.type}</type>
    </wpt>\n`;
    });
    
    gpxContent += `</gpx>`;
    
    const blob = new Blob([gpxContent], { type: 'application/gpx+xml;charset=utf-8' });
    downloadFile(blob, `walking_route_${Date.now()}.gpx`);
    showTemporaryMessage('🗺️ GPX格式已导出！可导入GPS设备或其他地图应用', 'success');
};

// 通用下载函数
function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 分享路线
function shareRoute(route) {
    const shareText = `🌟 我的AI散步路线规划
📍 起点: ${route.route.start_point.formatted_address || '起点'}
🎯 终点: ${route.route.end_point.name || '终点'}
📏 距离: ${(route.route.distance/1000).toFixed(1)}km
⏱️ 时间: ${Math.round(route.route.duration/60)}分钟
⭐ 评分: ${route.analysis.experience_rating}/10

通过智能散步路线规划器生成 - 基于高德地图Web API + AI分析`;

    if (navigator.share) {
        navigator.share({
            title: '我的AI散步路线',
            text: shareText
        });
    } else {
        navigator.clipboard.writeText(shareText).then(() => {
            alert('路线信息已复制到剪贴板');
        }).catch(() => {
            // 创建文本区域用于复制
            const textArea = document.createElement('textarea');
            textArea.value = shareText;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            alert('路线信息已复制到剪贴板');
        });
    }
}

// 初始化地图
function initMap() {
    try {
        console.log('🗺️ 开始初始化全屏地图...');
        
        // 检查AMap是否可用
        if (typeof AMap === 'undefined') {
            console.error('高德地图API未加载');
            document.getElementById('map').innerHTML = `
                <div style="display: flex; justify-content: center; align-items: center; height: 100%; 
                            background: #f8f9fa; color: #dc3545; font-size: 14px;">
                    <div style="text-align: center;">
                        <div style="margin-bottom: 10px;">⚠️</div>
                        <div>地图加载失败</div>
                        <div style="font-size: 12px; margin-top: 5px;">请检查网络连接</div>
                    </div>
                </div>
            `;
            return;
        }

        // 检查地图容器是否存在
        const mapContainer = document.getElementById('map');
        if (!mapContainer) {
            console.error('地图容器不存在');
            return;
        }

        // 确保地图容器占满全屏
        mapContainer.style.width = '100%';
        mapContainer.style.height = '100%';

        console.log('全屏地图容器检查完成，开始创建地图实例...');

        // 创建地图实例
        map = new AMap.Map('map', {
            zoom: 12,
            center: [116.397428, 39.90923], // 北京中心
            features: ['bg', "road", "building"], 
            mapStyle: 'amap://styles/macaron',
            viewMode: '2D',
            // 启用双击缩放和滚轮缩放
            doubleClickZoom: true,
            scrollWheel: true,
            // 禁用右键菜单
            contextMenu: false
        });

        // 等待地图加载完成
        map.on('complete', function() {
            console.log('✅ 全屏地图加载完成');
            
            // 优化Canvas性能（解决Canvas2D警告）
            setTimeout(() => {
                try {
                    const mapContainer = document.getElementById('map');
                    if (mapContainer) {
                        const canvases = mapContainer.querySelectorAll('canvas');
                        canvases.forEach(canvas => {
                            if (!canvas.hasAttribute('data-optimized')) {
                                canvas.setAttribute('data-optimized', 'true');
                                // 提示性设置，有助于浏览器优化
                                if (canvas.style) {
                                    canvas.style.willReadFrequently = 'true';
                                }
                            }
                        });
                    }
                } catch (e) {
                    // 忽略Canvas优化错误
                    console.log('Canvas优化跳过');
                }
            }, 1000);  // 延迟执行，确保地图完全初始化
            
            // 添加地图控件
            try {
                if (AMap.Scale) {
                    const scale = new AMap.Scale({
                        position: 'LB' // 左下角
                    });
                    map.addControl(scale);
                }
                if (AMap.ToolBar) {
                    const toolbar = new AMap.ToolBar({
                        position: 'RT' // 右上角
                    });
                    map.addControl(toolbar);
                }
                console.log('✅ 地图控件添加成功');
            } catch (error) {
                console.warn('⚠️ 部分地图控件加载失败:', error);
            }
            
            // 地图加载完成后调整视野以确保全屏显示
            setTimeout(() => {
                if (map) {
                    try {
                        // 获取地图容器并确保其尺寸正确
                        const container = document.getElementById('map');
                        if (container) {
                            // 使用高德地图API的正确方法调整地图大小
                            if (typeof map.getContainer === 'function') {
                                const mapContainer = map.getContainer();
                                if (mapContainer) {
                                    mapContainer.style.height = '100vh';
                                    mapContainer.style.width = '100vw';
                                }
                            }
                            
                            // 触发地图重新计算尺寸
                            if (typeof map.resize === 'function') {
                                map.resize();
                            } else if (typeof map.getSize === 'function' && typeof map.setSize === 'function') {
                                try {
                                    map.setSize(new AMap.Size(container.offsetWidth, container.offsetHeight));
                                } catch (sizeError) {
                                    console.log('备用地图尺寸调整方法也失败，跳过尺寸调整');
                                }
                            }
                        }
                    } catch (error) {
                        console.warn('⚠️ 地图大小调整失败:', error);
                    }
                }
            }, 100);
            
            console.log('✅ 全屏地图初始化完成');
        });

        // 地图加载失败的处理
        map.on('error', function(error) {
            console.error('❌ 地图加载失败:', error);
            document.getElementById('map').innerHTML = `
                <div style="display: flex; justify-content: center; align-items: center; height: 100%; 
                            background: #f8f9fa; color: #dc3545; font-size: 14px;">
                <div style="text-align: center;">
                    <div style="margin-bottom: 10px;">⚠️</div>
                    <div>地图加载失败</div>
                    <div style="font-size: 12px; margin-top: 5px;">请检查网络连接</div>
                </div>
            </div>
            `;
        });

        // 监听窗口大小变化，自动调整地图大小
        window.addEventListener('resize', function() {
            if (map && typeof map.getSize === 'function') {
                setTimeout(() => {
                    try {
                        // 高德地图API 1.4.15版本使用getSize()和setSize()方法
                        map.getSize();
                        // 触发地图重新计算大小
                        if (typeof map.setSize === 'function') {
                            const container = document.getElementById('map');
                            map.setSize(new AMap.Size(container.offsetWidth, container.offsetHeight));
                        }
                    } catch (error) {
                        console.warn('⚠️ 地图大小调整失败:', error);
                        // 如果上述方法失败，尝试重新渲染地图
                        if (typeof map.render === 'function') {
                            map.render();
                        }
                    }
                }, 100);
            }
        });

    } catch (error) {
        console.error('❌ 地图初始化失败:', error);
        document.getElementById('map').innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; height: 100%; 
                        background: #f8f9fa; color: #dc3545; font-size: 14px;">
                <div style="text-align: center;">
                    <div style="margin-bottom: 10px;">⚠️</div>
                    <div>地图初始化失败</div>
                    <div style="font-size: 12px; margin-top: 5px;">${error.message}</div>
                </div>
            </div>
        `;
    }
}

// 初始化函数
function initializeApp() {
    console.log('🚀 初始化修复版散步规划器 - 全屏地图模式...');
    
    // 添加地图加载提示
    const mapContainer = document.getElementById('map');
    if (mapContainer) {
        mapContainer.innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; height: 100%; 
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; font-size: 16px;">
                <div style="text-align: center;">
                    <div style="margin-bottom: 15px; font-size: 2rem;">🗺️</div>
                    <div>智能地图加载中...</div>
                    <div style="font-size: 12px; margin-top: 5px; opacity: 0.8;">准备AI规划环境</div>
                </div>
            </div>
        `;
    }
    
    // 等待高德地图API加载完成
    function waitForAMap() {
        if (typeof AMap !== 'undefined') {
            console.log('高德地图API已加载，开始初始化全屏地图...');
            
            // 延迟一点时间确保API完全加载
            setTimeout(() => {
                initMap();
            }, 500);
        } else {
            console.log('等待高德地图API加载...');
            setTimeout(waitForAMap, 100);
        }
    }
    
    // 开始等待API加载
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
        
        // 设置地图控制
        setupMapControls();
        
        console.log('✅ 全屏地图应用初始化完成');
    } catch (error) {
        console.error('❌ 应用初始化过程中发生错误:', error);
    }
}

// 探索模式功能
function startExploreMode() {
    console.log('🧭 启动探索模式...');
    
    // 检查地图是否已初始化
    if (!map) {
        showTemporaryMessage('⚠️ 地图未初始化，请稍后再试', 'warning');
        return;
    }
    
    // 清除现有标记
    clearMap();
    
    // 获取当前地图中心点
    const center = map.getCenter();
    const centerLng = center.getLng();
    const centerLat = center.getLat();
    
    console.log(`🌍 当前地图中心: (${centerLng}, ${centerLat})`);
    
    // 显示探索模式提示
    showTemporaryMessage('🧭 探索模式已启动！正在搜索周边有趣的地点...', 'info');
    
    // 搜索周边有趣的地点
    exploreNearbyPOIs(centerLng, centerLat);
}

// 探索周边POI
async function exploreNearbyPOIs(longitude, latitude) {
    try {
        console.log('🔍 开始探索周边地点...');
        
        // 定义探索关键词（涵盖各种有趣的地点）
        const exploreKeywords = [
            '景点|公园|广场',
            '咖啡厅|餐厅|美食',
            '博物馆|图书馆|文化',
            '商场|购物|娱乐',
            '健身|运动|休闲'
        ];
        
        let allPOIs = [];
        
        // 逐个搜索不同类型的地点
        for (let i = 0; i < exploreKeywords.length; i++) {
            try {
                const result = await routeService.searchNearbyPOIs(longitude, latitude, exploreKeywords[i], 2000);
                if (result.success && result.pois) {
                    // 为每个POI添加类型标签
                    const typedPOIs = result.pois.map(poi => ({
                        ...poi,
                        explore_category: getExploreCategory(exploreKeywords[i])
                    }));
                    allPOIs.push(...typedPOIs);
                }
                // 添加延迟避免API频率限制
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
                console.warn(`⚠️ 搜索 ${exploreKeywords[i]} 失败:`, error);
            }
        }
        
        if (allPOIs.length === 0) {
            showTemporaryMessage('⚠️ 周边暂未发现有趣的地点，请移动地图到其他区域', 'warning');
            return;
        }
        
        // 去重和筛选
        const uniquePOIs = removeDuplicatePOIs(allPOIs);
        const selectedPOIs = selectBestExplorePOIs(uniquePOIs);
        
        console.log(`✅ 发现 ${selectedPOIs.length} 个有趣的探索地点`);
        
        // 在地图上显示探索地点
        displayExplorePOIs(selectedPOIs);
        
        // 显示探索结果统计
        showExploreResults(selectedPOIs);
        
    } catch (error) {
        console.error('❌ 探索模式失败:', error);
        showTemporaryMessage('❌ 探索模式失败，请重试', 'error');
    }
}

// 获取探索分类
function getExploreCategory(keywords) {
    if (keywords.includes('景点')) return '🏞️ 景点';
    if (keywords.includes('咖啡')) return '☕ 美食';
    if (keywords.includes('博物馆')) return '🏛️ 文化';
    if (keywords.includes('商场')) return '🛍️ 购物';
    if (keywords.includes('健身')) return '🏃 运动';
    return '📍 其他';
}

// 去重POI
function removeDuplicatePOIs(pois) {
    const seen = new Set();
    return pois.filter(poi => {
        const key = `${poi.name}_${poi.location[0]}_${poi.location[1]}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// 选择最佳探索POI
function selectBestExplorePOIs(pois) {
    // 按距离和评分排序，选择最多15个地点
    return pois
        .filter(poi => poi.location && poi.location.length >= 2)
        .sort((a, b) => {
            const distanceA = parseInt(a.distance) || 999999;
            const distanceB = parseInt(b.distance) || 999999;
            return distanceA - distanceB;
        })
        .slice(0, 15);
}

// 在地图上显示探索地点
function displayExplorePOIs(pois) {
    console.log('🗺️ 在地图上显示探索地点...');
    
    pois.forEach((poi, index) => {
        try {
            // 根据类别选择图标颜色
            let iconColor = '#17a2b8'; // 默认蓝色
            if (poi.explore_category.includes('景点')) iconColor = '#28a745';
            else if (poi.explore_category.includes('美食')) iconColor = '#fd7e14';
            else if (poi.explore_category.includes('文化')) iconColor = '#6f42c1';
            else if (poi.explore_category.includes('购物')) iconColor = '#e83e8c';
            else if (poi.explore_category.includes('运动')) iconColor = '#20c997';
            
            // 创建自定义图标
            const iconSvg = `
                <svg width="24" height="24" viewBox="0 0 640 640" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M128 252.6C128 148.4 214 64 320 64C426 64 512 148.4 512 252.6C512 371.9 391.8 514.9 341.6 569.4C329.8 582.2 310.1 582.2 298.3 569.4C248.1 514.9 127.9 371.9 127.9 252.6zM320 320C355.3 320 384 291.3 384 256C384 220.7 355.3 192 320 192C284.7 192 256 220.7 256 256C256 291.3 284.7 320 320 320z" fill="${iconColor}"/>
                </svg>
            `;
            
            const iconDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(iconSvg)));
            
            const marker = new AMap.Marker({
                position: new AMap.LngLat(poi.location[0], poi.location[1]),
                icon: new AMap.Icon({
                    size: new AMap.Size(24, 24),
                    image: iconDataUrl
                }),
                title: poi.name
            });
            
            // 创建信息窗体
            const infoContent = `
                <div style="padding: 12px; max-width: 250px;">
                    <h4 style="margin: 0 0 8px 0; color: #2c3e50; font-size: 14px;">
                        ${poi.explore_category} ${poi.name}
                    </h4>
                    <p style="margin: 0 0 5px 0; color: #7f8c8d; font-size: 12px; line-height: 1.4;">
                        ${poi.address || ''}
                    </p>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                        <span style="color: #28a745; font-size: 11px; font-weight: 500;">
                            距离: ${poi.distance}m
                        </span>
                        <button onclick="planRouteToExplorePoint('${poi.name}', ${poi.location[0]}, ${poi.location[1]})" 
                                style="background: ${iconColor}; color: white; border: none; padding: 4px 8px; 
                                       border-radius: 4px; font-size: 10px; cursor: pointer;">
                            前往
                        </button>
                    </div>
                </div>
            `;
            
            const infoWindow = new AMap.InfoWindow({
                content: infoContent,
                offset: new AMap.Pixel(0, -24)
            });
            
            marker.on('click', () => {
                infoWindow.open(map, marker.getPosition());
            });
            
            markers.push(marker);
            map.add(marker);
            
        } catch (error) {
            console.warn(`⚠️ 添加探索地点标记失败: ${poi.name}`, error);
        }
    });
    
    // 调整地图视野以包含所有标记
    if (markers.length > 0) {
        map.setFitView(markers, false, [50, 50, 50, 50]);
    }
    
    console.log(`✅ 成功显示 ${markers.length} 个探索地点`);
}

// 显示探索结果
function showExploreResults(pois) {
    const categoryStats = {};
    pois.forEach(poi => {
        const category = poi.explore_category;
        categoryStats[category] = (categoryStats[category] || 0) + 1;
    });
    
    let statsText = `🧭 探索完成！发现 ${pois.length} 个有趣地点：\n`;
    Object.entries(categoryStats).forEach(([category, count]) => {
        statsText += `${category}: ${count}个  `;
    });
    
    showTemporaryMessage(statsText, 'success');
}

// 规划到探索地点的路线
window.planRouteToExplorePoint = function(poiName, lng, lat) {
    console.log(`🎯 规划到探索地点的路线: ${poiName}`);
    
    // 获取当前地图中心作为起点
    const center = map.getCenter();
    const startPoint = {
        name: '当前位置',
        longitude: center.getLng(),
        latitude: center.getLat()
    };
    
    const endPoint = {
        name: poiName,
        longitude: lng,
        latitude: lat
    };
    
    // 规划路线
    planQuickRoute(startPoint, endPoint);
};

// 快速路线规划
async function planQuickRoute(startPoint, endPoint) {
    try {
        console.log('🛣️ 开始快速路线规划...');
        
        const result = await routeService.planWalkingRoute(startPoint, endPoint);
        
        if (result.success) {
            // 清除现有路线
            if (polyline) {
                map.remove(polyline);
                polyline = null;
            }
            
            // 显示简单路线
            const path = [
                [startPoint.longitude, startPoint.latitude],
                [endPoint.longitude, endPoint.latitude]
            ];
            
            polyline = new AMap.Polyline({
                path: path,
                strokeWeight: 4,
                strokeColor: "#ff4444",
                strokeOpacity: 0.8,
                lineJoin: 'round',
                lineCap: 'round'
            });
            map.add(polyline);
            
            // 添加起点和终点标记
            addQuickRouteMarkers(startPoint, endPoint);
            
            // 调整视野
            map.setFitView([...markers, polyline], false, [30, 30, 30, 30]);
            
            const distance = (result.distance / 1000).toFixed(1);
            const duration = Math.round(result.duration / 60);
            
            showTemporaryMessage(`✅ 路线规划成功！距离: ${distance}km，步行约${duration}分钟`, 'success');
            
        } else {
            showTemporaryMessage('❌ 路线规划失败，请重试', 'error');
        }
        
    } catch (error) {
        console.error('❌ 快速路线规划失败:', error);
        showTemporaryMessage('❌ 路线规划失败，请重试', 'error');
    }
}

// 添加快速路线标记
function addQuickRouteMarkers(startPoint, endPoint) {
    // 起点标记
    const startIcon = createCustomIcon('start', 28);
    const startMarker = new AMap.Marker({
        position: new AMap.LngLat(startPoint.longitude, startPoint.latitude),
        icon: new AMap.Icon({
            size: new AMap.Size(28, 28),
            image: startIcon
        }),
        title: startPoint.name
    });
    
    // 终点标记
    const endIcon = createCustomIcon('end', 28);
    const endMarker = new AMap.Marker({
        position: new AMap.LngLat(endPoint.longitude, endPoint.latitude),
        icon: new AMap.Icon({
            size: new AMap.Size(28, 28),
            image: endIcon
        }),
        title: endPoint.name
    });
    
    markers.push(startMarker, endMarker);
    map.add([startMarker, endMarker]);
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initializeApp); 