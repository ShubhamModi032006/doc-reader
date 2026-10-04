import { NextResponse } from 'next/server';
import { callGroqAPI } from '@/lib/llm/groqClient';

let cachedStatus: { configured: boolean; provider: string; reachable: boolean } | null = null;
let lastCheckTime = 0;

export async function GET() {
  const now = Date.now();
  if (cachedStatus && now - lastCheckTime < 60000) {
    return NextResponse.json(cachedStatus);
  }

  const provider = (process.env.LLM_PROVIDER || 'manual').toLowerCase();
  const apiKey = process.env.LLM_API_KEY;

  if (provider === 'manual') {
    cachedStatus = { configured: true, provider: 'manual', reachable: true };
    lastCheckTime = now;
    return NextResponse.json(cachedStatus);
  }

  const configured = !!apiKey;
  let reachable = false;

  if (configured) {
    try {
      await callGroqAPI({
        messages: [{ role: 'user', content: 'Ping' }],
        temperature: 0.1,
      });
      reachable = true;
    } catch (err) {
      reachable = false;
    }
  }

  cachedStatus = { configured, provider, reachable };
  lastCheckTime = now;

  return NextResponse.json(cachedStatus);
}
