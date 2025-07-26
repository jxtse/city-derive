
// 地理位置服务工具
export class GeolocationService {
    constructor() {
        this.currentPosition = null;
        this.watchId = null;
    }

    // 检查浏览器是否支持地理位置
    isSupported() {
        return 'geolocation' in navigator;
    }

    // 获取当前位置
    async getCurrentPosition(options = {}) {
        const defaultOptions = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000 // 5分钟缓存
        };

        const finalOptions = { ...defaultOptions, ...options };

        return new Promise((resolve, reject) => {
            if (!this.isSupported()) {
                reject(new Error('浏览器不支持地理位置功能'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.currentPosition = {
                        longitude: position.coords.longitude,
                        latitude: position.coords.latitude,
                        accuracy: position.coords.accuracy,
                        timestamp: position.timestamp
                    };
                    console.log('✅ 成功获取用户位置:', this.currentPosition);
                    resolve(this.currentPosition);
                },
                (error) => {
                    console.error('❌ 获取位置失败:', error);
                    let errorMessage = '获取位置失败';
                    
                    switch (error.code) {
                        case error.PERMISSION_DENIED:
                            errorMessage = '用户拒绝了位置访问请求';
                            break;
                        case error.POSITION_UNAVAILABLE:
                            errorMessage = '位置信息不可用';
                            break;
                        case error.TIMEOUT:
                            errorMessage = '获取位置超时';
                            break;
                    }
                    
                    reject(new Error(errorMessage));
                },
                finalOptions
            );
        });
    }

    // 监听位置变化
    watchPosition(callback, options = {}) {
        if (!this.isSupported()) {
            throw new Error('浏览器不支持地理位置功能');
        }

        const defaultOptions = {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 60000 // 1分钟缓存
        };

        const finalOptions = { ...defaultOptions, ...options };

        this.watchId = navigator.geolocation.watchPosition(
            (position) => {
                this.currentPosition = {
                    longitude: position.coords.longitude,
                    latitude: position.coords.latitude,
                    accuracy: position.coords.accuracy,
                    timestamp: position.timestamp
                };
                callback(this.currentPosition);
            },
            (error) => {
                console.error('❌ 位置监听失败:', error);
                callback(null, error);
            },
            finalOptions
        );

        return this.watchId;
    }

    // 停止监听位置变化
    stopWatching() {
        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
            console.log('📍 停止位置监听');
        }
    }

    // 获取缓存的位置
    getCachedPosition() {
        return this.currentPosition;
    }

    // 通过高德地图API进行逆地理编码
    async reverseGeocode(longitude, latitude, amapKey) {
        try {
            const url = `https://restapi.amap.com/v3/geocode/regeo?location=${longitude},${latitude}&key=${amapKey}&radius=1000&extensions=all`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.status === '1' && data.regeocode) {
                return {
                    success: true,
                    formatted_address: data.regeocode.formatted_address,
                    address_component: data.regeocode.addressComponent,
                    pois: data.regeocode.pois || []
                };
            }
            return { success: false, error: data.info || '逆地理编码失败' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // 请求位置权限并显示友好的提示
    async requestLocationWithPrompt() {
        return new Promise((resolve, reject) => {
            // 创建位置请求提示框
            const promptDiv = document.createElement('div');
            promptDiv.className = 'location-prompt';
            promptDiv.innerHTML = `
                <div class="location-prompt-overlay">
                    <div class="location-prompt-content">
                        <div class="location-icon">📍</div>
                        <h3>获取您的位置</h3>
                        <p>允许访问位置信息，我们将为您提供更精确的散步路线规划</p>
                        <div class="location-prompt-buttons">
                            <button class="btn-allow">允许定位</button>
                            <button class="btn-deny">暂不定位</button>
                        </div>
                    </div>
                </div>
            `;

            // 添加样式
            const style = document.createElement('style');
            style.textContent = `
                .location-prompt {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    z-index: 10000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .location-prompt-overlay {
                    background: rgba(0, 0, 0, 0.5);
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .location-prompt-content {
                    background: white;
                    padding: 30px;
                    border-radius: 16px;
                    text-align: center;
                    max-width: 400px;
                    margin: 20px;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
                }
                .location-icon {
                    font-size: 3rem;
                    margin-bottom: 16px;
                }
                .location-prompt-content h3 {
                    color: #2c3e50;
                    margin-bottom: 12px;
                    font-size: 1.4rem;
                }
                .location-prompt-content p {
                    color: #7f8c8d;
                    margin-bottom: 24px;
                    line-height: 1.5;
                }
                .location-prompt-buttons {
                    display: flex;
                    gap: 12px;
                    justify-content: center;
                }
                .location-prompt-buttons button {
                    padding: 12px 24px;
                    border: none;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                }
                .btn-allow {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }
                .btn-allow:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
                }
                .btn-deny {
                    background: #e9ecef;
                    color: #6c757d;
                }
                .btn-deny:hover {
                    background: #dee2e6;
                }
            `;

            document.head.appendChild(style);
            document.body.appendChild(promptDiv);

            // 绑定事件
            const allowBtn = promptDiv.querySelector('.btn-allow');
            const denyBtn = promptDiv.querySelector('.btn-deny');

            allowBtn.addEventListener('click', async () => {
                document.body.removeChild(promptDiv);
                document.head.removeChild(style);
                try {
                    const position = await this.getCurrentPosition();
                    resolve(position);
                } catch (error) {
                    reject(error);
                }
            });

            denyBtn.addEventListener('click', () => {
                document.body.removeChild(promptDiv);
                document.head.removeChild(style);
                reject(new Error('用户拒绝定位'));
            });
        });
    }
}
