const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

const openai = new OpenAI({ apiKey: OPENAI_API_KEY }); // <--- только один раз

const userContexts = {};

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
