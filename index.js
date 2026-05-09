require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const { Pool } = require('pg');

// اتصال به دیتابیس
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ساخت جدول کاربران (اگر وجود نداشته باشد)
pool.query(`
    CREATE TABLE IF NOT EXISTS users (
        user_id BIGINT PRIMARY KEY,
        platform VARCHAR(10),
        gender VARCHAR(10),
        username VARCHAR(50),
        age INT,
        province VARCHAR(50),
        city VARCHAR(50),
        coins INT DEFAULT 20,
        tokens INT DEFAULT 1000,
        step VARCHAR(20)
    );
`).then(() => console.log('Database connected and table ready!'));

const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(process.env.PORT || 3000, () => console.log('Web server is up!'));

const tgBot = new Telegraf(process.env.TELEGRAM_TOKEN);
// ربات بله
const baleBot = new Telegraf(process.env.BALE_BOT_TOKEN, {
  telegram: {
    apiRoot: 'https://tapi.bale.ai'
  }
});


// تابع شروع و ثبت‌نام اولیه
const startHandler = async (ctx, platform) => {
    const userId = ctx.from.id;
    
    // بررسی وجود کاربر در دیتابیس
    const res = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    
    if (res.rows.length === 0) {
        // ثبت کاربر جدید با وضعیت انتخاب جنسیت
        await pool.query('INSERT INTO users (user_id, platform, step) VALUES ($1, $2, $3)', [userId, platform, 'ask_gender']);
        
        ctx.reply('به ربات چت ناشناس خوش آمدید!\nبرای شروع، لطفاً جنسیت خود را انتخاب کنید (فقط یک‌بار قابل تغییر است):',
            Markup.inlineKeyboard([
                [Markup.button.callback('👩 دختر', 'gender_female'), Markup.button.callback('👨 پسر', 'gender_male')]
            ])
        );
    } else {
        ctx.reply('شما قبلاً ثبت‌نام کرده‌اید!');
    }
};

tgBot.start((ctx) => startHandler(ctx, 'telegram'));
baleBot.start((ctx) => startHandler(ctx, 'bale'));

// مدیریت کلیک روی دکمه‌های جنسیت
const genderActionHandler = async (ctx) => {
    const userId = ctx.from.id;
    const gender = ctx.match[0] === 'gender_female' ? 'دختر' : 'پسر';
    
    await pool.query('UPDATE users SET gender = $1, step = $2 WHERE user_id = $3', [gender, 'ask_username', userId]);
    
    ctx.editMessageText(`جنسیت شما (${gender}) ثبت شد.\nحالا لطفاً یک نام کاربری فارسی (بدون عدد و حروف انگلیسی) برای خود ارسال کنید:`);
};

tgBot.action(/gender_(female|male)/, genderActionHandler);
baleBot.action(/gender_(female|male)/, genderActionHandler);

// مدیریت پیام‌های متنی کاربران
const textHandler = async (ctx) => {
    // اگر پیام متنی نبود، کاری نکن
    if (!ctx.message || !ctx.message.text) return;

    const userId = ctx.from.id;
    const text = ctx.message.text;

    try {
        // دریافت وضعیت فعلی کاربر از دیتابیس
        const res = await pool.query('SELECT step FROM users WHERE user_id = $1', [userId]);
        
        if (res.rows.length === 0) return; // کاربر ثبت‌نام نکرده است
        
        const step = res.rows[0].step;

        // اگر کاربر در مرحله ثبت نام کاربری است
        if (step === 'ask_username') {
            // اعتبارسنجی: فقط حروف فارسی و فاصله مجاز است
            const persianRegex = /^[\u0600-\u06FF\s]+$/;
            
            if (!persianRegex.test(text)) {
                return ctx.reply('❌ لطفاً فقط از حروف فارسی استفاده کنید و عدد یا حروف انگلیسی وارد نکنید.');
            }

            if (text.length < 3 || text.length > 20) {
                return ctx.reply('❌ نام کاربری باید بین 3 تا 20 حرف باشد.');
            }

            // ذخیره نام کاربری و رفتن به مرحله بعد (مثلا سن)
            await pool.query('UPDATE users SET username = $1, step = $2 WHERE user_id = $3', [text, 'ask_age', userId]);
            
            ctx.reply(`✅ نام کاربری "${text}" با موفقیت ثبت شد!\n\nحالا لطفاً سن خود را به صورت عدد وارد کنید (مثلاً: 25):`);
        } 
        // اگر در مرحله وارد کردن سن بود
        else if (step === 'ask_age') {
            const age = parseInt(text);

            if (isNaN(age) || age < 10 || age > 99) {
                return ctx.reply('❌ لطفاً یک عدد معتبر برای سن وارد کنید (بین 10 تا 99).');
            }

            // ذخیره سن و اتمام ثبت‌نام اولیه
            await pool.query('UPDATE users SET age = $1, step = $2 WHERE user_id = $3', [age, 'registered', userId]);
            
            ctx.reply('🎉 ثبت‌نام شما با موفقیت تکمیل شد! به زودی امکانات بیشتری به ربات اضافه می‌شود.');
        }

    } catch (error) {
        console.error('Database Error in textHandler:', error);
        ctx.reply('متاسفانه خطایی رخ داد. لطفاً دوباره تلاش کنید.');
    }
};

// متصل کردن هندلر به هر دو ربات تلگرام و بله
tgBot.on('text', textHandler);
baleBot.on('text', textHandler);


// ثبت خطاهای تلگرام
tgBot.catch((err, ctx) => {
    console.error(`[Telegram Error]`, err);
});

// ثبت خطاهای بله
baleBot.catch((err, ctx) => {
    console.error(`[Bale Error]`, err);
});

tgBot.launch();
baleBot.launch();

process.once('SIGINT', () => { tgBot.stop('SIGINT'); baleBot.stop('SIGINT'); });
process.once('SIGTERM', () => { tgBot.stop('SIGTERM'); baleBot.stop('SIGTERM'); });
