
// 工具函数模块
export function calculateDistance(point1, point2) {
    const lat1 = point1.latitude || point1.location[1];
    const lon1 = point1.longitude || point1.location[0];
    const lat2 = point2.latitude || point2.location[1];
    const lon2 = point2.longitude || point2.location[0];
    
    const R = 6371; // 地球半径（公里）
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    return distance;
}

export function parsePolyline(polylineStr) {
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

export function isValidCoordinate(lng, lat) {
    return !isNaN(lng) && !isNaN(lat) && 
           lng >= -180 && lng <= 180 && 
           lat >= -90 && lat <= 90 &&
           !(lng === 0 && lat === 0);
}

export function showTemporaryMessage(message, type = 'info') {
    const msgDiv = document.createElement('div');
    msgDiv.style.cssText = `
        position: fixed; top: 20px; right: 20px; 
        background: ${type === 'success' ? '#28a745' : type === 'warning' ? '#ffc107' : type === 'error' ? '#dc3545' : '#17a2b8'}; 
        color: ${type === 'warning' ? '#212529' : 'white'}; 
        padding: 10px 15px; border-radius: 5px; z-index: 10000; font-size: 14px;
        max-width: 300px; box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    msgDiv.textContent = message;
    document.body.appendChild(msgDiv);
    
    setTimeout(() => {
        if (msgDiv.parentNode) {
            msgDiv.parentNode.removeChild(msgDiv);
        }
    }, 4000);
}

export function typewriterEffect(element, text, speed = 50) {
    element.textContent = '';
    element.classList.add('typewriter');
    
    let i = 0;
    const timer = setInterval(() => {
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
        } else {
            clearInterval(timer);
            setTimeout(() => {
                element.classList.remove('typewriter');
            }, 1000);
        }
    }, speed);
}
