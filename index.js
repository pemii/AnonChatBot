require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const { Pool } = require('pg');

// اتصال به دیتابیس
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ساخت جدول کاربران (اگر وجود نداشته باشد) با فیلد جدید برای عکس
pool.query(`
    CREATE TABLE IF NOT EXISTS users (
        user_id BIGINT PRIMARY KEY,
        platform VARCHAR(10),
        gender VARCHAR(10),
        username VARCHAR(50),
        age INT,
        province VARCHAR(50),
        city VARCHAR(50),
        profile_photo_id VARCHAR(255),
        coins INT DEFAULT 20,
        tokens INT DEFAULT 1000,
        step VARCHAR(20)
    );
`).then(() => console.log('Database connected and table ready!'));

const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(process.env.PORT || 3000, () => console.log('Web server is up!'));

// --- تعریف منوی اصلی ---
// بر اساس فایل 2202.png
const mainMenu = Markup.keyboard([
    ['🔎 جستجوی سریع'], // ردیف اول
    ['❤️ پروفایل من', '샵 فروشگاه'], // ردیف دوم
    ['📨 پیام‌های من', '⚙️ تنظیمات'], // ردیف سوم
    ['🔗 راهنما'] // ردیف چهارم
]).resize();

const showMainMenu = (ctx) => {
    ctx.reply('به منوی اصلی خوش آمدید. چه کاری می‌خواهید انجام دهید؟', mainMenu);
};


const tgBot = new Telegraf(process.env.TELEGRAM_TOKEN);
const baleBot = new Telegraf(process.env.BALE_BOT_TOKEN, {
  telegram: {
    apiRoot: 'https://tapi.bale.ai'
  }
});

// تابع شروع و ثبت‌نام اولیه
const startHandler = async (ctx, platform) => {
    const userId = ctx.from.id;
    const res = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    
    if (res.rows.length === 0) {
        // ثبت کاربر جدید
        await pool.query('INSERT INTO users (user_id, platform, step) VALUES ($1, $2, $3)', [userId, platform, 'ask_gender']);
        ctx.reply('به ربات چت ناشناس خوش آمدید!\nبرای شروع، لطفاً جنسیت خود را انتخاب کنید:',
            Markup.inlineKeyboard([
                [Markup.button.callback('👩 دختر', 'gender_female'), Markup.button.callback('👨 پسر', 'gender_male')]
            ])
        );
    } else {
        // اگر کاربر قبلا ثبت‌نام کرده، منوی اصلی را نمایش بده
        showMainMenu(ctx);
    }
};

tgBot.start((ctx) => startHandler(ctx, 'telegram'));
baleBot.start((ctx) => startHandler(ctx, 'bale'));

// مدیریت کلیک روی دکمه‌های جنسیت
const genderActionHandler = async (ctx) => {
    const userId = ctx.from.id;
    const gender = ctx.match[0] === 'gender_female' ? 'دختر' : 'پسر';
    
    await pool.query('UPDATE users SET gender = $1, step = $2 WHERE user_id = $3', [gender, 'ask_username', userId]);
    
    ctx.editMessageText(`جنسیت شما (${gender}) ثبت شد.\nحالا لطفاً یک نام کاربری فارسی (بدون عدد و کاراکتر خاص) برای خود ارسال کنید:`);
};

tgBot.action(/gender_(female|male)/, genderActionHandler);
baleBot.action(/gender_(female|male)/, genderActionHandler);

// مدیریت پیام‌های متنی کاربران
const textHandler = async (ctx) => {
    if (!ctx.message || !ctx.message.text) return;
    const userId = ctx.from.id;
    const text = ctx.message.text;

    try {
        const res = await pool.query('SELECT step FROM users WHERE user_id = $1', [userId]);
        if (res.rows.length === 0) return;
        
        const step = res.rows[0].step;

        // --- مراحل ثبت‌نام ---
        if (step === 'ask_username') {
            const persianRegex = /^[\u0600-\u06FF\s]{3,20}$/;
            if (!persianRegex.test(text)) {
                return ctx.reply('❌ نام کاربری باید بین 3 تا 20 حرف و فقط شامل حروف فارسی باشد.');
            }
            await pool.query('UPDATE users SET username = $1, step = $2 WHERE user_id = $3', [text, 'ask_age', userId]);
            ctx.reply(`✅ نام کاربری "${text}" ثبت شد!\n\nحالا لطفاً سن خود را به صورت عدد وارد کنید (مثلاً: 25):`);
        } 
        else if (step === 'ask_age') {
            const age = parseInt(text);
            if (isNaN(age) || age < 10 || age > 99) {
                return ctx.reply('❌ لطفاً یک عدد معتبر برای سن وارد کنید (بین 10 تا 99).');
            }
            await pool.query('UPDATE users SET age = $1, step = $2 WHERE user_id = $3', [age, 'ask_province', userId]);
            ctx.reply('✅ سن شما ثبت شد.\n\nحالا لطفاً استان محل سکونت خود را وارد کنید:');
        }
        else if (step === 'ask_province') {
             if (text.length < 2 || text.length > 30) {
                return ctx.reply('❌ نام استان معتبر نیست. لطفاً دوباره تلاش کنید.');
            }
            await pool.query('UPDATE users SET province = $1, step = $2 WHERE user_id = $3', [text, 'ask_city', userId]);
            ctx.reply(`✅ استان "${text}" ثبت شد.\n\nحالا شهر محل سکونت خود را وارد کنید:`);
        }
        else if (step === 'ask_city') {
             if (text.length < 2 || text.length > 30) {
                return ctx.reply('❌ نام شهر معتبر نیست. لطفاً دوباره تلاش کنید.');
            }
            await pool.query('UPDATE users SET city = $1, step = $2 WHERE user_id = $3', [text, 'ask_photo', userId]);
            ctx.reply(`✅ شهر "${text}" ثبت شد.\n\nو در آخر، یک عکس برای پروفایل خود ارسال کنید (این عکس به دیگران نمایش داده می‌شود):`);
        }

        // --- مدیریت منوی اصلی برای کاربران ثبت‌شده ---
        else if (step === 'registered') {
            switch (text) {
                case '🔎 جستجوی سریع':
                    ctx.reply('درحال جستجوی یک هم‌صحبت برای شما...');
                    break;
                case '❤️ پروفایل من':
                    ctx.reply('شما دکمه "پروفایل من" را انتخاب کردید. به زودی اطلاعات پروفایل شما اینجا نمایش داده می‌شود.');
                    break;
                case '샵 فروشگاه':
                    ctx.reply('به فروشگاه خوش آمدید! آیتم‌های موجود به زودی نمایش داده می‌شوند.');
                    break;
                case '📨 پیام‌های من':
                    ctx.reply('صندوق پیام شما خالی است.');
                    break;
                case '⚙️ تنظیمات':
                    ctx.reply('وارد بخش تنظیمات شدید.');
                    break;
                case '🔗 راهنما':
                    ctx.reply('اینجا راهنمای استفاده از ربات قرار خواهد گرفت.');
                    break;
                default:
                    ctx.reply('لطفاً از دکمه‌های منو استفاده کنید.');
            }
        }

    } catch (error) {
        console.error('Database Error in textHandler:', error);
        ctx.reply('متاسفانه خطایی رخ داد. لطفاً دوباره تلاش کنید.');
    }
};

// هندلر جدید برای دریافت عکس پروفایل
const photoHandler = async (ctx) => {
    if (!ctx.message || !ctx.message.photo) return;
    const userId = ctx.from.id;

    try {
        const res = await pool.query('SELECT step FROM users WHERE user_id = $1', [userId]);
        if (res.rows.length > 0 && res.rows[0].step === 'ask_photo') {
            // ذخیره فایل آیدی بهترین کیفیت عکس
            const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
            
            await pool.query('UPDATE users SET profile_photo_id = $1, step = $2 WHERE user_id = $3', [fileId, 'registered', userId]);
            
            ctx.reply('🎉 عالی! عکس پروفایل شما ثبت شد و ثبت‌نام شما تکمیل گردید.');
            showMainMenu(ctx); // نمایش منوی اصلی
        }
    } catch (error) {
        console.error('Database Error in photoHandler:', error);
        ctx.reply('خطایی در ذخیره عکس رخ داد. لطفاً دوباره تلاش کنید.');
    }
};

// اتصال هندلرها به هر دو ربات
tgBot.on('text', textHandler);
baleBot.on('text', textHandler);
tgBot.on('photo', photoHandler);
baleBot.on('photo', photoHandler);

tgBot.catch((err, ctx) => console.error(`[Telegram Error]`, err));
baleBot.catch((err, ctx) => console.error(`[Bale Error]`, err));

tgBot.launch();
baleBot.launch();

process.once('SIGINT', () => { tgBot.stop('SIGINT'); baleBot.stop('SIGINT'); });
process.once('SIGTERM', () => { tgBot.stop('SIGTERM'); baleBot.stop('SIGTERM'); });
