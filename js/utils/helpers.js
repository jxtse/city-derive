
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
    // 创建SVG图标
    static createSVGIcon(type, size = 24) {
        const colors = {
            start: '#667eea',
            end: '#dc3545',
            waypoint: '#9c27b0',
            path: '#20c997'
        };
        
        const color = colors[type] || colors.start;
        const svgContent = `
            <svg width="${size}" height="${size}" viewBox="0 0 640 640" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M128 252.6C128 148.4 214 64 320 64C426 64 512 148.4 512 252.6C512 371.9 391.8 514.9 341.6 569.4C329.8 582.2 310.1 582.2 298.3 569.4C248.1 514.9 127.9 371.9 127.9 252.6zM320 320C355.3 320 384 291.3 384 256C384 220.7 355.3 192 320 192C284.7 192 256 220.7 256 256C256 291.3 284.7 320 320 320z" fill="${color}"/>
            </svg>
        `;
        
        return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgContent)));
    }
    
    // 显示临时消息
    static showMessage(message, type = 'info', duration = 4000) {
        const colors = {
            success: '#28a745',
            warning: '#ffc107',
            error: '#dc3545',
            info: '#17a2b8'
        };
        
        const msgDiv = document.createElement('div');
        msgDiv.style.cssText = `
            position: fixed; top: 20px; right: 20px; 
            background: ${colors[type]}; 
            color: ${type === 'warning' ? '#212529' : 'white'}; 
            padding: 10px 15px; border-radius: 5px; z-index: 10000; 
            font-size: 14px; max-width: 300px; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        `;
        msgDiv.textContent = message;
        document.body.appendChild(msgDiv);
        
        setTimeout(() => {
            if (msgDiv.parentNode) {
                msgDiv.parentNode.removeChild(msgDiv);
            }
        }, duration);
    }
    
    // 安全的事件监听器绑定
    static safeAddEventListener(elementId, eventType, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener(eventType, handler);
        } else {
            console.warn(`⚠️ 元素 '${elementId}' 不存在，跳过事件绑定`);
        }
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
