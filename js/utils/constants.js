
// 系统常量配置
export const CONFIG = {
    // 高德地图配置
    AMAP: {
        KEY: process.env.AMAP_API_KEY || 'c9e4a3040fef05c4084a21c8a357d37f',
        BASE_URL: 'https://restapi.amap.com/v3'
    },
    
    // OpenRouter AI配置
    OPENROUTER: {
        BASE_URL: "https://openrouter.ai/api/v1",
        API_KEY: "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",
        MODEL: "anthropic/claude-sonnet-4"
    },
    
    // Dify配置
    DIFY: {
        BASE_URL: 'https://api.dify.ai/v1',
        DEFAULT_TOKEN: 'app-66AeBLjLKMIYEsb5ufu0h8Ch'
    },
    
    // 地图默认设置
    MAP_DEFAULTS: {
        CENTER: [116.397428, 39.90923], // 北京中心
        ZOOM: 12,
        STYLE: 'amap://styles/macaron'
    },
    
    // 规划参数
    PLANNING: {
        MAX_STEPS: 10,
        DEFAULT_RADIUS: 3000,
        DEFAULT_WALK_SPEED: 1.4, // m/s
        MAX_RETRIES: 10
    }
};

// 偏好关键词映射
export const PREFERENCE_KEYWORDS = {
    '水景': '湖泊|河流|水系|海滨|滨水',
    '公园': '公园|绿地|植物园|花园',
    '历史': '历史|古迹|文化|博物馆|纪念馆',
    '商业': '商场|购物|商业街|步行街',
    '自然': '自然|山林|森林|郊野|山地',
    '科技': '科技园|高新区|现代建筑|商务区'
};

// 图标配置
export const ICON_TYPES = {
    START: { color: '#667eea', size: 32 },
    END: { color: '#dc3545', size: 32 },
    WAYPOINT: { color: '#9c27b0', size: 24 },
    PATH: { color: '#20c997', size: 16 }
};
// 应用配置常量
export const CONFIG = {
    // 高德地图配置
    AMAP: {
        KEY: 'your-amap-key-here', // 需要替换为实际的高德地图API密钥
        BASE_URL: 'https://restapi.amap.com/v3'
    },
    
    // 地图默认设置
    MAP_DEFAULTS: {
        ZOOM: 13,
        CENTER: [116.397428, 39.90923], // 北京天安门
        STYLE: 'normal'
    },
    
    // 规划配置
    PLANNING: {
        DEFAULT_RADIUS: 3000, // 默认搜索半径（米）
        DEFAULT_WALK_SPEED: 1.2 // 默认步行速度（米/秒）
    },
    
    // OpenRouter配置（如果使用）
    OPENROUTER: {
        API_KEY: 'your-openrouter-key-here',
        BASE_URL: 'https://openrouter.ai/api/v1',
        MODEL: 'anthropic/claude-3-haiku'
    }
};

// 偏好关键词映射
export const PREFERENCE_KEYWORDS = {
    '水景': '湖泊|河流|海滨|水库|喷泉',
    '公园': '公园|绿地|广场|花园',
    '历史': '古迹|博物馆|纪念馆|文化|遗址',
    '商业': '商场|购物|商圈|步行街',
    '自然': '山|森林|郊野|自然|生态',
    '科技': '科技园|高新区|现代建筑|CBD'
};

// 图标类型配置
export const ICON_TYPES = {
    START: {
        color: '#28a745',
        size: 32
    },
    END: {
        color: '#dc3545',
        size: 32
    },
    WAYPOINT: {
        color: '#17a2b8',
        size: 28
    }
};
