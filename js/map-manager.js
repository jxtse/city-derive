
// 地图管理模块
import { showTemporaryMessage } from './utils.js';

export class MapManager {
    constructor() {
        this.map = null;
        this.markers = [];
        this.polyline = null;
    }

    // 初始化地图
    initMap() {
        try {
            console.log('🗺️ 开始初始化全屏地图...');
            
            if (typeof AMap === 'undefined') {
                console.error('高德地图API未加载');
                this.showMapError('地图加载失败', '请检查网络连接');
                return;
            }

            const mapContainer = document.getElementById('map');
            if (!mapContainer) {
                console.error('地图容器不存在');
                return;
            }

            mapContainer.style.width = '100%';
            mapContainer.style.height = '100%';

            this.map = new AMap.Map('map', {
                zoom: 12,
                center: [116.397428, 39.90923],
                features: ['bg', "road", "building"], 
                mapStyle: 'amap://styles/macaron',
                viewMode: '2D',
                doubleClickZoom: true,
                scrollWheel: true,
                contextMenu: false
            });

            this.map.on('complete', () => {
                console.log('✅ 全屏地图加载完成');
                this.addMapControls();
                this.optimizeCanvas();
                this.setupResize();
            });

            this.map.on('error', (error) => {
                console.error('❌ 地图加载失败:', error);
                this.showMapError('地图加载失败', '请检查网络连接');
            });

        } catch (error) {
            console.error('❌ 地图初始化失败:', error);
            this.showMapError('地图初始化失败', error.message);
        }
    }

    // 清除地图
    clearMap() {
        this.markers.forEach(marker => {
            if (marker && this.map) {
                this.map.remove(marker);
            }
        });
        this.markers = [];
        
        if (this.polyline && this.map) {
            this.map.remove(this.polyline);
            this.polyline = null;
        }
    }

    // 创建自定义图标
    createCustomIcon(type, size = 24) {
        try {
            let svgContent;
            
            switch(type) {
                case 'start':
                    svgContent = `
                        <svg width="${size}" height="${size}" viewBox="0 0 640 640" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M128 252.6C128 148.4 214 64 320 64C426 64 512 148.4 512 252.6C512 371.9 391.8 514.9 341.6 569.4C329.8 582.2 310.1 582.2 298.3 569.4C248.1 514.9 127.9 371.9 127.9 252.6zM320 320C355.3 320 384 291.3 384 256C384 220.7 355.3 192 320 192C284.7 192 256 220.7 256 256C256 291.3 284.7 320 320 320z" fill="#667eea"/>
                        </svg>
                    `;
                    break;
                case 'end':
                    svgContent = `
                        <svg width="${size}" height="${size}" viewBox="0 0 640 640" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M128 252.6C128 148.4 214 64 320 64C426 64 512 148.4 512 252.6C512 371.9 391.8 514.9 341.6 569.4C329.8 582.2 310.1 582.2 298.3 569.4C248.1 514.9 127.9 371.9 127.9 252.6zM320 320C355.3 320 384 291.3 384 256C384 220.7 355.3 192 320 192C284.7 192 256 220.7 256 256C256 291.3 284.7 320 320 320z" fill="#dc3545"/>
                        </svg>
                    `;
                    break;
                case 'route':
                    svgContent = `
                        <svg width="${size}" height="${size}" viewBox="0 0 640 640" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M128 252.6C128 148.4 214 64 320 64C426 64 512 148.4 512 252.6C512 371.9 391.8 514.9 341.6 569.4C329.8 582.2 310.1 582.2 298.3 569.4C248.1 514.9 127.9 371.9 127.9 252.6zM320 320C355.3 320 384 291.3 384 256C384 220.7 355.3 192 320 192C284.7 192 256 220.7 256 256C256 291.3 284.7 320 320 320z" fill="#9c27b0"/>
                        </svg>
                    `;
                    break;
                default:
                    svgContent = `
                        <svg width="${size}" height="${size}" viewBox="0 0 640 640" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M128 252.6C128 148.4 214 64 320 64C426 64 512 148.4 512 252.6C512 371.9 391.8 514.9 341.6 569.4C329.8 582.2 310.1 582.2 298.3 569.4C248.1 514.9 127.9 371.9 127.9 252.6zM320 320C355.3 320 384 291.3 384 256C384 220.7 355.3 192 320 192C284.7 192 256 220.7 256 256C256 291.3 284.7 320 320 320z" fill="#667eea"/>
                        </svg>
                    `;
            }
            
            const dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgContent)));
            return dataUrl;
            
        } catch (error) {
            console.error(`图标创建失败 - 类型: ${type}, 尺寸: ${size}, 错误:`, error);
            
            const fallbackSvg = `
                <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 1}" fill="#667eea"/>
                </svg>
            `;
            return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(fallbackSvg)));
        }
    }

    // 显示地图错误
    showMapError(title, message) {
        const mapContainer = document.getElementById('map');
        if (mapContainer) {
            mapContainer.innerHTML = `
                <div style="display: flex; justify-content: center; align-items: center; height: 100%; 
                            background: #f8f9fa; color: #dc3545; font-size: 14px;">
                    <div style="text-align: center;">
                        <div style="margin-bottom: 10px;">⚠️</div>
                        <div>${title}</div>
                        <div style="font-size: 12px; margin-top: 5px;">${message}</div>
                    </div>
                </div>
            `;
        }
    }

    // 添加地图控件
    addMapControls() {
        try {
            if (AMap.Scale) {
                const scale = new AMap.Scale({
                    position: 'LB'
                });
                this.map.addControl(scale);
            }
            if (AMap.ToolBar) {
                const toolbar = new AMap.ToolBar({
                    position: 'RT'
                });
                this.map.addControl(toolbar);
            }
            console.log('✅ 地图控件添加成功');
        } catch (error) {
            console.warn('⚠️ 部分地图控件加载失败:', error);
        }
    }

    // 优化Canvas性能
    optimizeCanvas() {
        setTimeout(() => {
            try {
                const mapContainer = document.getElementById('map');
                if (mapContainer) {
                    const canvases = mapContainer.querySelectorAll('canvas');
                    canvases.forEach(canvas => {
                        if (!canvas.hasAttribute('data-optimized')) {
                            canvas.setAttribute('data-optimized', 'true');
                            if (canvas.style) {
                                canvas.style.willReadFrequently = 'true';
                            }
                        }
                    });
                }
            } catch (e) {
                console.log('Canvas优化跳过');
            }
        }, 1000);
    }

    // 设置窗口大小调整
    setupResize() {
        window.addEventListener('resize', () => {
            if (this.map && typeof this.map.getSize === 'function') {
                setTimeout(() => {
                    try {
                        this.map.getSize();
                        if (typeof this.map.setSize === 'function') {
                            const container = document.getElementById('map');
                            this.map.setSize(new AMap.Size(container.offsetWidth, container.offsetHeight));
                        }
                    } catch (error) {
                        console.warn('⚠️ 地图大小调整失败:', error);
                        if (typeof this.map.render === 'function') {
                            this.map.render();
                        }
                    }
                }, 100);
            }
        });
    }
}
