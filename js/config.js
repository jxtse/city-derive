
// 配置模块 - 统一管理所有配置项
export const OPENROUTER_CONFIG = {
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: "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",
    model: "anthropic/claude-sonnet-4"
};

export const AMAP_CONFIG = {
    apiKey: "c9e4a3040fef05c4084a21c8a357d37f",
    webApiBase: "https://restapi.amap.com/v3"
};

export const DEFAULT_SETTINGS = {
    defaultCity: '北京',
    defaultRadius: 3000,
    maxSteps: 10,
    maxLogHistory: 20,
    walkingSpeed: 1.4 // m/s
};
