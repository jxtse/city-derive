
// 路线服务模块
import { LLMPlanningAgent } from './llm-agent.js';

export class FixedRouteService {
    constructor() {
        console.log('✅ 初始化LLM驱动的路线服务 (Web API + 智能AI规划)...');
        this.llmAgent = new LLMPlanningAgent();
    }

    // 主要的路线规划方法
    async planRoute(startLocation, city, preferences) {
        try {
            console.log('🚀 开始LLM主导的智能路线规划...');
            
            // 让LLM智能代理处理整个规划过程
            const result = await this.llmAgent.intelligentPlanRoute(startLocation, city, preferences);
            
            if (typeof updatePlanningStatus === 'function') {
                updatePlanningStatus('✅ LLM智能规划完成！', 'success');
            }
            return result;
            
        } catch (error) {
            console.error('❌ LLM主导规划失败:', error);
            if (typeof updatePlanningStatus === 'function') {
                updatePlanningStatus(`❌ 规划失败: ${error.message}`, 'error');
            }
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
