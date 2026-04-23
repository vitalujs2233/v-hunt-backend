/**
* V-HUNT API Service
* Логика взаимодействия с бэкендом
*/

const CONFIG = {
API_URL: 'https://railway.app',
TIMEOUT: 5000
};

const vHuntService = {
// Проверка, жив ли сервер
async checkStatus() {
try {
const controller = new AbortController();
const id = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

const response = await fetch(`${CONFIG.API_URL}/status`, { signal: controller.signal });
clearTimeout(id);
return response.ok;
} catch (error) {
console.error("V-HUNT Service Error:", error);
return false;
}
},

// Получение списка листингов
async getListings() {
try {
const response = await fetch(`${CONFIG.API_URL}/listings`);
if (!response.ok) return [];
return await response.json();
// Ожидается массив объектов типа: { symbol: 'SOL', pair: 'SOL/USDT', exchange: 'BYBIT' }
} catch (error) {
return [];
}
}
};
