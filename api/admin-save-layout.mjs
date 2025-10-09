import { createClient } from '@supabase/supabase-js';
import micro from 'micro';

const supabase = createClient(
  'https://Rrjvdabtqzkaomjuiref.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyanZkYWJ0cXprYW9tanVpcmVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNDM3MzQsImV4cCI6MjA3NDcxOTczNH0.wAEeowZ8Yc8K54jAxEbY-8-mM0OGciMmyz6fJb9Z1Qg'
);

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  // Only allow POST for this endpoint
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  // Set CORS headers for actual request
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const data = await micro.json(req);

    // Example Supabase insert (replace with your actual logic)
    const { error } = await supabase.from('layouts').insert([{ layout: data.layout }]);
    if (error) throw error;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal Server Error' }));
  }
}
