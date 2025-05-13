// app.js – основной сервер приложения
const express = require('express');
const fetch = require('node-fetch');  // для вызова внешних API (если нужен)
const { Configuration, OpenAIApi } = require('openai');
// Google Sheets API
const { google } = require('googleapis');
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function checkAndSendReminders() {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: 'Tasks!A2:E'
    });
    const rows = res.data.values || [];

    const now = new Date();
    const soon = new Date(now.getTime() + 15 * 60 * 1000);

    for (const row of rows) {
      const [id, userId, description, due, status] = row;
      if (!due || status === 'Done') continue;

      const taskTime = new Date(due);
      if (taskTime > now && taskTime <= soon) {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const body = {
          chat_id: userId,
          text: `Через 15 минут задача: "${description}"`
        };
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const result = await response.json();
        
        if (!result.ok) {
          console.error('Ошибка от Telegram:', result);
        } else {
          console.log('Уведомление отправлено:', result);
        }
      }
    }
  } catch (err) {
    console.error('Ошибка при проверке напоминаний:', err);
  }
}

// Проверять каждые 5 минут
setInterval(checkAndSendReminders, 5 * 60 * 1000);
const app = express();
app.use(express.json());  // встроенный body-parser для JSON

app.get('/api/check-reminders', async (req, res) => {
  await checkAndSendReminders();
  res.send('Reminders checked');
});
// Конфигурация OpenAI API (ChatGPT)
const openaiConfig = new Configuration({
  apiKey: process.env.OPENAI_API_KEY  // ключ OpenAI из переменных окружения
});
const openai = new OpenAIApi(openaiConfig);

// Конфигурация Google Sheets API
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || '<<< Вставьте ID вашей Google таблицы >>>';
// Авторизация сервиса Google через сервисный аккаунт
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth });

// Маршрут для выдачи статических файлов (Frontend)
// Предполагается, что index.html и другие файлы лежат в папке "public" рядом
app.use(express.static('public')); 

// 1. Получение списка задач для пользователя (например GET /api/tasks?userId=12345)
app.get('/api/tasks', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ error: 'UserId is required' });
    }
    // Читаем все задачи из Google Sheets
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: 'Tasks!A2:E'  // данные начиная со 2-й строки (1-я строка заголовки)
    });
    const rows = readRes.data.values || [];
    // Преобразуем массив строк в объекты задач
    const tasks = rows.filter(row => row[1] == userId).map(row => ({
      id: row[0],
      userId: row[1],
      description: row[2],
      due: row[3] || null,
      status: row[4] || 'Pending'
    }));
    return res.json({ tasks });
  } catch (err) {
    console.error('Ошибка при получении задач:', err);
    return res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// 2. Создание новой задачи (POST /api/tasks)
app.post('/api/tasks', async (req, res) => {
  try {
    const { userId, description, due } = req.body;
    if (!userId || !description) {
      return res.status(400).json({ error: 'userId and description are required' });
    }

    const taskId = Date.now().toString();
    const status = 'Pending';
    const dueDateTime = due || '';

    await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: 'Tasks!A2:E',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [[ taskId, userId, description, dueDateTime, status ]]
      }
    });

    return res.json({ id: taskId, status: 'ok' });

  } catch (err) {
    console.error('Ошибка при добавлении задачи:', err);
    return res.status(500).json({ error: 'Failed to add task' });
  }
});

// 3. Обновление задачи (например, изменение описания или дедлайна) – опционально
app.post('/api/tasks/update', async (req, res) => {
  try {
    const { id, description, due } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Task id is required for update' });
    }
    // Считываем все строки, чтобы найти нужную задачу
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: 'Tasks!A2:E'
    });
    const rows = readRes.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === id);
    if (rowIndex === -1) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const rowNumber = rowIndex + 2; // индекс +2 = номер строки в таблице (учитывая заголовок)
    // Подготовка новых значений (если пусто, оставляем старое)
    const updatedDescription = description || rows[rowIndex][2];
    const updatedDue = (due !== undefined) ? due : (rows[rowIndex][3] || '');
    // Обновляем ячейки описания и дедлайна в Google Sheets
    const updateRange = `Tasks!C${rowNumber}:D${rowNumber}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: updateRange,
      valueInputOption: 'RAW',
      resource: { values: [[ updatedDescription, updatedDue ]] }
    });
    return res.json({ status: 'updated' });
  } catch (err) {
    console.error('Ошибка при обновлении задачи:', err);
    return res.status(500).json({ error: 'Failed to update task' });
  }
});

// 4. Отметка задачи выполненной/невыполненной (POST /api/tasks/complete)
app.post('/api/tasks/complete', async (req, res) => {
  try {
    const { id, status } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Task id is required' });
    }
    // Считываем задачи и находим нужную строку
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: 'Tasks!A2:E'
    });
    const rows = readRes.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === id);
    if (rowIndex === -1) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const rowNumber = rowIndex + 2;
    const newStatus = status === 'Done' ? 'Done' : 'Pending';
    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `Tasks!E${rowNumber}`,
      valueInputOption: 'RAW',
      resource: { values: [[ newStatus ]] }
    });
    return res.json({ status: 'ok', newStatus });
  } catch (err) {
    console.error('Ошибка при изменении статуса задачи:', err);
    return res.status(500).json({ error: 'Failed to update status' });
  }
});

// 5. Генерация задачи/совета с помощью ChatGPT (POST /api/ai-suggest)
app.post('/api/ai-suggest', async (req, res) => {
  try {
    const { prompt } = req.body;
    // Если пользователь не задал конкретный запрос, используем дефолтный
    const userPrompt = prompt || 'Предложи идею полезной задачи для меня на сегодня';
    const completion = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo', 
      messages: [
        { role: 'system', content: 'You are an assistant that suggests useful personal tasks or goals to users.' },
        { role: 'user', content: userPrompt }
      ]
    });
    const answer = completion.data.choices[0].message.content.trim();
    return res.json({ suggestion: answer });
  } catch (err) {
    console.error('Ошибка при запросе к OpenAI:', err);
    return res.status(500).json({ error: 'AI service failed' });
  }
});

// (Опционально) 6. Endpoint для получения мотивирующей цитаты 
app.get('/api/motivation', async (req, res) => {
  try {
    // Простые статические цитаты для примера
    const quotes = [
      'Не откладывай на завтра то, что можешь сделать сегодня.',
      'Путь в тысячу миль начинается с первого шага.',
      'Цель без плана — просто мечта.'
    ];
    // Выбираем случайную
    const quote = quotes[Math.floor(Math.random() * quotes.length)];
    return res.json({ quote });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get quote' });
  }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
