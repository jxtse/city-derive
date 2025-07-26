import { CONFIG } from './constants.js';

// 地理计算工具
export class GeoUtils {
    // 计算两点间距离（公里）
    static calculateDistance(point1, point2) {
        const lat1 = point1.latitude || point1.location?.[1];
        const lon1 = point1.longitude || point1.location?.[0];
        const lat2 = point2.latitude || point2.location?.[1];
        const lon2 = point2.longitude || point2.location?.[0];

        const R = 6371; // 地球半径（公里）
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    // 验证坐标有效性
    static isValidCoordinate(lng, lat) {
        return !isNaN(lng) && !isNaN(lat) && 
               lng >= -180 && lng <= 180 && 
               lat >= -90 && lat <= 90 &&
               !(lng === 0 && lat === 0);
    }

    // 解析高德地图polyline
    static parsePolyline(polylineStr) {
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
}

// DOM操作工具
export class DOMUtils {
    // DOM操作工具函数
    static safeAddEventListener(elementId, event, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener(event, handler);
            return true;
        }
        console.warn(`⚠️ 元素不存在: ${elementId}`);
        return false;
    }

    // 显示消息提示
    static showMessage(message, type = 'info', duration = 3000) {
        const messageElement = document.createElement('div');
        messageElement.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 9999;
            animation: slideInRight 0.3s ease-out;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        `;

        const colors = {
            error: '#dc3545',
            success: '#28a745',
            info: '#17a2b8',
            warning: '#ffc107'
        };

        messageElement.style.background = colors[type] || colors.info;
        messageElement.textContent = message;

        // 添加滑入动画
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideInRight {
                from {
                    opacity: 0;
                    transform: translateX(100%);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(messageElement);

        // 自动删除
        setTimeout(() => {
            if (messageElement.parentNode) {
                messageElement.style.opacity = '0';
                messageElement.style.transition = 'opacity 0.3s ease';
                setTimeout(() => {
                    if (messageElement.parentNode) {
                        messageElement.parentNode.removeChild(messageElement);
                    }
                    if (style.parentNode) {
                        style.parentNode.removeChild(style);
                    }
                }, 300);
            }
        }, duration);
    }
}

// 数据验证工具
export class ValidationUtils {
    // 验证表单数据
    static validatePlanningForm(formData) {
        const errors = [];

        if (!formData.startLocation?.trim()) {
            errors.push('请输入起点地址');
        }

        if (!formData.city?.trim()) {
            errors.push('请选择城市');
        }

        if (!formData.distance) {
            errors.push('请选择期望距离');
        }

        if (!formData.preference) {
            errors.push('请选择偏好类型');
        }

        if (!formData.endType) {
            errors.push('请选择终点类型');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // 验证API响应
    static validateAPIResponse(response, requiredFields = []) {
        if (!response) {
            return { isValid: false, error: '响应为空' };
        }

        for (const field of requiredFields) {
            if (!(field in response)) {
                return { isValid: false, error: `缺少必需字段: ${field}` };
            }
        }

        return { isValid: true };
    }
}

// 日期时间工具
export class DateTimeUtils {
    // 格式化时间戳
    static formatTimestamp(timestamp) {
        return new Date(timestamp).toLocaleTimeString().substring(0, 8);
    }

    // 计算持续时间
    static calculateDuration(startTime, endTime = Date.now()) {
        const duration = Math.floor((endTime - startTime) / 1000);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}