'use strict';

// app-config.js — public settings the browser needs, read from Netlify environment variables
// so nothing is hard-coded. Only public values are returned (never secrets).
//   BUFFER_CLIENT_ID  → enables "Sign in with Buffer"
//   ANTHROPIC_API_KEY / GEMINI_API_KEY → only reported as available / not available

exports.handler = async function handler() {
  const provider = process.env.ANTHROPIC_API_KEY ? 'claude' : process.env.GEMINI_API_KEY ? 'gemini' : null;
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
    body: JSON.stringify({
      bufferClientId: (process.env.BUFFER_CLIENT_ID || '').trim(),
      ai: { available: !!provider, provider },
    }),
  };
};
