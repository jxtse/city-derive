
// API配置文件
// 请在使用前设置正确的API keys
window.API_CONFIG = {
    // 高德地图API密钥
    AMAP_API_KEY: localStorage.getItem('AMAP_API_KEY') || 'c9e4a3040fef05c4084a21c8a357d37f',
    
    // Dify API Token
    DIFY_API_TOKEN: localStorage.getItem('DIFY_API_TOKEN') || 'app-66AeBLjLKMIYEsb5ufu0h8Ch',
    
    // OpenRouter API密钥
    OPENROUTER_API_KEY: localStorage.getItem('OPENROUTER_API_KEY') || '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'
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
