
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require("openai");
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });


const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Контекст общения для каждого пользователя
const userContexts = {};

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userInput = msg.text;

  if (!userContexts[chatId]) {
    userContexts[chatId] = [
      { role: 'system', content: 'Ты — дружелюбный помощник, помогающий выполнять задачи, мотивировать и подсказывать.' }
    ];
  }

  userContexts[chatId].push({ role: 'user', content: userInput });

  try {
    const chatResponse = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: userContexts[chatId]
    });

    const reply = chatResponse.data.choices[0].message.content.trim();
    userContexts[chatId].push({ role: 'assistant', content: reply });
    bot.sendMessage(chatId, reply);
  } catch (err) {
    console.error('❌ GPT-ошибка:', err.message);
    bot.sendMessage(chatId, '⚠️ Не удалось обратиться к GPT. Попробуй позже.');
  }
});
