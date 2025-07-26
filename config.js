
// API配置文件
// 请在使用前设置正确的API keys
window.API_CONFIG = {
    // 高德地图API密钥
    AMAP_API_KEY: localStorage.getItem('AMAP_API_KEY') || 'your_amap_api_key',
    
    // Dify API Token
    DIFY_API_TOKEN: localStorage.getItem('DIFY_API_TOKEN') || 'your_dify_api_token',
    
    // OpenRouter API密钥
    OPENROUTER_API_KEY: localStorage.getItem('OPENROUTER_API_KEY') || 'your_openrouter_api_key'
};

// 设置API keys的辅助函数
window.setAPIKeys = function(keys) {
    Object.entries(keys).forEach(([key, value]) => {
        localStorage.setItem(key, value);
        window.API_CONFIG[key] = value;
    });
    console.log('✅ API keys已更新');
};

// 使用示例：
// setAPIKeys({
//     'AMAP_API_KEY': 'your-amap-key',
//     'DIFY_API_TOKEN': 'your-dify-token',
//     'OPENROUTER_API_KEY': 'your-openrouter-key'
// });
