import crypto from 'node:crypto';

// Тестовый токен бота. ДОЛЖЕН совпадать с TELEGRAM_BOT_TOKEN, с которым запущен сервер
const botToken = process.env.TEST_BOT_TOKEN || 'test_test_token_123';

// Имитация данных пользователя Telegram
const user = {
	id: 123456789,
	username: 'testuser',
	first_name: 'Test',
	last_name: 'User',
	language_code: 'en'
};

const authDate = Math.floor(Date.now() / 1000);

// Формируем initData без hash
const params = new URLSearchParams();
params.set('auth_date', String(authDate));
params.set('user', JSON.stringify(user));
params.set('query_id', 'AAABBBCCC');

// Строка для проверки подписи (data_check_string)
const dataCheckString = [...params]
	.filter(([key]) => key !== 'hash')
	.sort(([a], [b]) => a.localeCompare(b))
	.map(([key, val]) => `${key}=${val}`)
	.join('\n');

// Секрет по правилам Telegram WebApp: secret = HMAC_SHA256("WebAppData", botToken)
const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
const hmac = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

params.set('hash', hmac);

// Печатаем итоговый initData (query-string)
process.stdout.write(params.toString());


