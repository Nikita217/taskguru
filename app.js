
// 📦 Единый сервер: TaskGuru backend + Telegram бот + AI обработка

const express = require('express');
const cron = require('node-cron');
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\n/g, '\n')
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth });

app.use(express.json());
app.use(express.static('public'));

const userContexts = {};

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userInput = msg.text;

  if (!userContexts[chatId]) {
    userContexts[chatId] = [
      { role: 'system', content: 'Ты — коуч, мотивируешь и подсказываешь пользователю как выполнить задачу.' }
    ];
  }

  userContexts[chatId].push({ role: 'user', content: userInput });

  try {
    const chatResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: userContexts[chatId]
    });

    const reply = chatResponse.choices[0].message.content;
    userContexts[chatId].push({ role: 'assistant', content: reply });
    bot.sendMessage(chatId, reply);
  } catch (err) {
    console.error('❌ GPT ошибка:', err.message);
    bot.sendMessage(chatId, '⚠️ Ошибка при ответе GPT. Попробуй ещё раз позже.');
  }
});

async function checkAndSendReminders() {
  try {
    console.log('🛎 Запуск напоминаний...');
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: 'Tasks!A2:F'
    });
    const rows = res.data.values || [];
    const now = new Date();
    const soon = new Date(now.getTime() + 15 * 60 * 1000);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const [id, userId, description, due, status, notified] = row;
      if (!due || status === 'Done' || notified === 'Yes') continue;

      const taskTime = new Date(due);
      if (taskTime > now && taskTime <= soon) {
        let motivation = `🔔 Через 15 минут задача: "${description}"`;
        try {
          const prompt = `Напомни о задаче: "${description}". Поддержи морально и предложи советы или лайфхаки по выполнению. До 250 символов.`;
          const chatResponse = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: 'Ты — позитивный коуч и помощник. Дай мотивацию и советы по выполнению задачи.' },
              { role: 'user', content: prompt }
            ]
          });
          motivation = chatResponse.choices[0].message.content.trim();
        } catch (err) {
          console.error('⚠️ Ошибка при генерации мотивации:', err.message);
        }

        try {
          const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
          const body = { chat_id: userId, text: motivation };

          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });

          const result = await response.text();
          console.log('📬 Ответ Telegram:', result);

          await sheets.spreadsheets.values.update({
            spreadsheetId: GOOGLE_SHEET_ID,
            range: `Tasks!F${i + 2}`,
            valueInputOption: 'RAW',
            resource: { values: [['Yes']] }
          });
        } catch (err) {
          console.error('❌ Ошибка отправки уведомления:', err.message);
        }
      }
    }
  } catch (err) {
    console.error('❌ Ошибка в checkAndSendReminders:', err.message);
  }
}

app.get('/api/check-reminders', async (req, res) => {
  await checkAndSendReminders();
  res.send('✅ Напоминания проверены');
});

cron.schedule('*/5 * * * *', async () => {
  console.log('⏰ Cron: запуск напоминаний...');
  await checkAndSendReminders();
});

app.get('/', (req, res) => res.send('TaskGuru работает'));

app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
});
