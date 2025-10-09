import { createClient } from '@supabase/supabase-js';
import micro from 'micro';

// Use Vercel environment variables for security
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

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

    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Method not allowed' }));
    }

    // Set CORS header for actual request
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
        const data = await micro.json(req);

        // Make sure the payload has "updates"
        if (!data.updates || !Array.isArray(data.updates)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Invalid payload' }));
        }

        // Insert or upsert layout updates into your "tables" table
        const { error } = await supabase
            .from('tables') // Your table is named "tables"
            .upsert(data.updates, { onConflict: ['id'] });

        if (error) throw error;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: data.updates }));

    } catch (err) {
        console.error('Error in admin-save-layout:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
}
