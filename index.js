require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');

// راه‌اندازی سرور وب برای Render (تا رندر فکر نکند ربات خاموش شده)
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(process.env.PORT || 3000, () => console.log('Web server is up!'));

// راه‌اندازی ربات تلگرام
const tgBot = new Telegraf(process.env.TELEGRAM_TOKEN);
tgBot.start((ctx) => ctx.reply('سلام! به ربات چت ناشناس در تلگرام خوش آمدید. لطفا جنسیت خود را انتخاب کنید:'));
tgBot.launch().then(() => console.log('Telegram Bot Started!'));

// راه‌اندازی ربات بله (با تغییر آدرس API به سرور بله)
const baleBot = new Telegraf(process.env.BALE_TOKEN, {
    telegram: { apiRoot: 'https://tapi.bale.ai' }
});
baleBot.start((ctx) => ctx.reply('سلام! به ربات چت ناشناس در بله خوش آمدید. لطفا جنسیت خود را انتخاب کنید:'));
baleBot.launch().then(() => console.log('Bale Bot Started!'));

// مدیریت خاموش شدن سرور
process.once('SIGINT', () => {
    tgBot.stop('SIGINT');
    baleBot.stop('SIGINT');
});
process.once('SIGTERM', () => {
    tgBot.stop('SIGTERM');
    baleBot.stop('SIGTERM');
});
