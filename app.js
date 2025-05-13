
const express = require('express');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const cron = require('node-cron');
const fetch = require('node-fetch');
const path = require('path');
const { OpenAI } = require('openai');

require('dotenv').config();

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 10000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\n/g, '
'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// 📅 Чтение задач из Google Sheets
app.get('/api/tasks', async (req, res) => {
  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: 'Tasks!A2:E',
    });
    const rows = result.data.values || [];
    const tasks = rows.map(([id, userId, description, due, status]) => ({
      id, userId, description, due, status
    }));
    res.json(tasks);
  } catch (err) {
    console.error('Ошибка загрузки задач:', err.message);
    res.status(500).send('Ошибка сервера');
  }
});

// ➕ Добавление задачи
app.post('/api/add-task', async (req, res) => {
  const { id, userId, description, due } = req.body;
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: 'Tasks!A2:F',
      valueInputOption: 'RAW',
      resource: {
        values: [[id, userId, description, due, 'Pending', '']]
      }
    });
    res.sendStatus(200);
  } catch (err) {
    console.error('Ошибка при добавлении задачи:', err.message);
    res.status(500).send('Ошибка добавления');
  }
});

// ☑️ Завершение задачи
app.post('/api/complete-task', async (req, res) => {
  const { id } = req.body;
  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: 'Tasks!A2:E',
    });
    const rows = result.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === id);
    if (rowIndex === -1) return res.status(404).send('Задача не найдена');

    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `Tasks!E${rowIndex + 2}`,
      valueInputOption: 'RAW',
      resource: { values: [['Done']] },
    });
    res.sendStatus(200);
  } catch (err) {
    console.error('Ошибка при завершении задачи:', err.message);
    res.status(500).send('Ошибка');
  }
});

// ✏️ Обновление задачи
app.post('/api/update-task', async (req, res) => {
  const { id, description, due } = req.body;
  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: 'Tasks!A2:E',
    });
    const rows = result.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === id);
    if (rowIndex === -1) return res.status(404).send('Задача не найдена');

    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `Tasks!C${rowIndex + 2}:D${rowIndex + 2}`,
      valueInputOption: 'RAW',
      resource: { values: [[description, due]] },
    });
    res.sendStatus(200);
  } catch (err) {
    console.error('Ошибка при обновлении задачи:', err.message);
    res.status(500).send('Ошибка');
  }
});

// 🔔 Проверка задач с уведомлением
app.get('/api/check-reminders', async (req, res) => {
  try {
    console.log('🛎 Проверка напоминаний...');
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: 'Tasks!A2:F',
    });
    const rows = result.data.values || [];
    const now = new Date();
    const soon = new Date(now.getTime() + 15 * 60000);

    for (let i = 0; i < rows.length; i++) {
      const [id, userId, description, due, status, notified] = rows[i];
      if (!due || status === 'Done' || notified === 'yes') continue;
      const dueTime = new Date(due);
      if (dueTime > now && dueTime <= soon) {
        console.log(`📡 Готовим мотивацию для задачи: "${description}"`);
        let message = '';
        try {
          const gpt = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
              { role: "system", content: "Ты — позитивный и дружелюбный коуч, который помогает людям не откладывать дела и поддерживает их." },
              { role: "user", content: `Напомни о задаче: "${description}". Подскажи, с чего начать, как её лучше выполнить, дай короткую мотивацию и пару лайфхаков.` }
            ],
            max_tokens: 200,
          });
          message = gpt.choices[0]?.message?.content || '';
        } catch (err) {
          console.error("❌ GPT ошибка:", err.message);
          message = `🔔 Через 15 минут задача: "${description}"`;
        }

        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: userId, text: message })
        });

        await sheets.spreadsheets.values.update({
          spreadsheetId: GOOGLE_SHEET_ID,
          range: `Tasks!F${i + 2}`,
          valueInputOption: 'RAW',
          resource: { values: [['yes']] }
        });
      }
    }

    res.send('✅ Reminders checked');
  } catch (err) {
    console.error('Ошибка в check-reminders:', err.message);
    res.status(500).send('Ошибка напоминаний');
  }
});

// 🎯 Запуск
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
});
