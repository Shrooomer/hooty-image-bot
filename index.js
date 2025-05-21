// HOOTY-IMAGE-BOT/index.js

import express from 'express';
import { Telegraf } from 'telegraf';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

console.log("🚀 Starting Hooty Bot...");
console.log("TELEGRAM_BOT_TOKEN:", process.env.TELEGRAM_BOT_TOKEN ? "✅ found" : "❌ missing");
console.log("REPLICATE_API_TOKEN:", process.env.REPLICATE_API_TOKEN ? "✅ found" : "❌ missing");

if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.REPLICATE_API_TOKEN) {
  throw new Error("Missing required environment variables. Check TELEGRAM_BOT_TOKEN and REPLICATE_API_TOKEN.");
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 3000;

const REPLICATE_MODEL_VERSION = 'a9758cb3a5e8d38c1e2e437a2fc59c7d4aaefefb6a0c528d8b09c0c84f7b4c61';
const LORA_VERSION_URL = 'https://replicate.com/cloneofsimo/lora-training/versions/bgtawkktt5rj00cpy9pbtcj7vm';

async function generateImage(prompt) {
  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      version: REPLICATE_MODEL_VERSION,
      input: {
        prompt,
        lora_urls: [LORA_VERSION_URL],
        num_inference_steps: 30,
        guidance_scale: 7.5,
        width: 1024,
        height: 1024
      }
    })
  });

  const json = await response.json();

  if (!json.id) {
    console.error('❌ Error creating prediction:', json);
    throw new Error('Failed to start image generation.');
  }

  const predictionId = json.id;
  let imageUrl = null;
  const maxWaitTime = 540_000;
  const interval = 3000;
  const startTime = Date.now();

  while (!imageUrl) {
    if (Date.now() - startTime > maxWaitTime) {
      throw new Error('Image generation timed out after 9 minutes.');
    }

    const statusRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: {
        'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`
      }
    });

    const statusJson = await statusRes.json();

    if (statusJson.status === 'succeeded') {
      imageUrl = statusJson.output?.[0];
      if (!imageUrl) throw new Error('No image returned.');
    } else if (statusJson.status === 'failed') {
      throw new Error('Image generation failed.');
    } else {
      await new Promise(res => setTimeout(res, interval));
    }
  }

  return imageUrl;
}

const handledMessages = new Set();

bot.command('hooty', async (ctx) => {
  const messageId = ctx.message.message_id;
  const chatId = ctx.chat.id;
  const uniqueKey = `${chatId}-${messageId}`;

  if (handledMessages.has(uniqueKey)) return;
  handledMessages.add(uniqueKey);

  const prompt = ctx.message.text.replace('/hooty', '').trim();
  if (!prompt) return ctx.reply('Please provide a prompt, e.g., /hooty flying over a city');

  await ctx.reply('Generating your Hoooty image... 🦉✨');

  try {
    const imageUrl = await generateImage(`hoooty ${prompt}`);
    await ctx.replyWithPhoto({ url: imageUrl });
  } catch (err) {
    console.error('❌ Image generation error:', err);
    ctx.reply('Something went wrong generating the image.');
  }

  setTimeout(() => handledMessages.delete(uniqueKey), 5 * 60 * 1000);
});

// 🛠️ Handle POST /secret-path from Telegram webhook
app.use('/secret-path', express.json(), bot.webhookCallback('/secret-path'));

// Health check route
app.get('/', (req, res) => {
  res.send('🦉 Hoooty Bot is alive');
});

// 🧠 Set webhook and start server
app.listen(PORT, async () => {
  console.log(`🌐 Express server running on port ${PORT}`);

  const domain = process.env.RAILWAY_PUBLIC_DOMAIN || 'YOUR-SUBDOMAIN.up.railway.app';
  const webhookUrl = `https://${domain}/secret-path`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/setWebhook?url=${webhookUrl}`);
    const data = await res.json();

    if (data.ok) {
      console.log("✅ Telegram webhook set successfully");
    } else {
      console.error("❌ Failed to set Telegram webhook:", data);
    }
  } catch (err) {
    console.error("🚨 Error setting Telegram webhook:", err);
  }
});

// Remove polling mode:
// bot.launch() is removed
