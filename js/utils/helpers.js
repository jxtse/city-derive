
// DOM操作工具
export const DOMUtils = {
    // 显示消息
    showMessage(message, type = 'info', duration = 3000) {
        const messageDiv = document.createElement('div');
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 8px;
            color: white;
            font-size: 14px;
            z-index: 10000;
            min-width: 200px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            transition: opacity 0.3s ease;
        `;

        const colors = {
            success: '#28a745',
            error: '#dc3545',
            warning: '#ffc107',
            info: '#17a2b8'
        };

        messageDiv.style.background = colors[type] || colors.info;
        messageDiv.textContent = message;

        document.body.appendChild(messageDiv);

        setTimeout(() => {
            messageDiv.style.opacity = '0';
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.parentNode.removeChild(messageDiv);
                }
            }, 300);
        }, duration);
    },

    // 安全添加事件监听器
    safeAddEventListener(elementId, event, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener(event, handler);
        } else {
            console.warn(`⚠️ 元素 ${elementId} 不存在`);
        }
    },

    // 创建SVG图标
    createSVGIcon(type, size = 24) {
        const colors = {
            start: '#28a745',
            end: '#dc3545',
            waypoint: '#17a2b8'
        };

        const color = colors[type] || colors.waypoint;
        
        const svg = `
            <svg width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="2"/>
                <circle cx="12" cy="12" r="4" fill="white"/>
            </svg>
        `;
        
        return 'data:image/svg+xml;base64,' + btoa(svg);
    }
};

// 地理工具
export const GeoUtils = {
    // 验证坐标是否有效
    isValidCoordinate(longitude, latitude) {
        return typeof longitude === 'number' && 
               typeof latitude === 'number' &&
               !isNaN(longitude) && 
               !isNaN(latitude) &&
               Math.abs(longitude) <= 180 &&
               Math.abs(latitude) <= 90;
    },

    // 计算两点间距离（公里）
    calculateDistance(point1, point2) {
        if (!this.isValidCoordinate(point1.longitude, point1.latitude) ||
            !this.isValidCoordinate(point2.longitude, point2.latitude)) {
            return 0;
        }

        const R = 6371; // 地球半径（公里）
        const dLat = this.toRadians(point2.latitude - point1.latitude);
        const dLon = this.toRadians(point2.longitude - point1.longitude);
        
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(this.toRadians(point1.latitude)) * 
                  Math.cos(this.toRadians(point2.latitude)) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    },

    // 角度转弧度
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    },

    // 解析高德地图的折线数据
    parsePolyline(polyline) {
        if (!polyline) return [];
        
        try {
            // 简单的坐标解析
            const coordinates = [];
            const parts = polyline.split(';');
            
            parts.forEach(part => {
                const coords = part.split(',');
                if (coords.length >= 2) {
                    const lng = parseFloat(coords[0]);
                    const lat = parseFloat(coords[1]);
                    if (this.isValidCoordinate(lng, lat)) {
                        coordinates.push([lng, lat]);
                    }
                }
            });
            
            return coordinates;
        } catch (error) {
            console.warn('⚠️ 解析折线数据失败:', error);
            return [];
        }
    }
};

// 表单验证工具
export const ValidationUtils = {
    // 验证规划表单
    validatePlanningForm(preferences) {
        const errors = [];
        
        if (!preferences.startLocation?.trim()) {
            errors.push('请输入起点位置');
        }
        
        if (!preferences.city?.trim()) {
            errors.push('请输入城市名称');
        }
        
        if (!preferences.distance) {
            errors.push('请选择距离范围');
        }
        
        if (!preferences.preference) {
            errors.push('请选择偏好类型');
        }
        
        if (!preferences.endType) {
            errors.push('请选择终点类型');
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }
};

// 日期时间工具
export const DateTimeUtils = {
    // 格式化时间戳
    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('zh-CN', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }
};
