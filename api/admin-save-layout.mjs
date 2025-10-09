import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://Rrjvdabtqzkaomjuiref.supabase.co';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // DO NOT HARDCODE

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export default async function handler(req, res) {
    // --- Handle CORS preflight ---
    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        });
        return res.end();
    }

    // Only allow POST
    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Method not allowed' }));
    }

    // Set CORS headers for actual POST
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
        // Read JSON body
        const data = await new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => resolve(JSON.parse(body)));
            req.on('error', err => reject(err));
        });

        if (!data.updates || !Array.isArray(data.updates)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Invalid payload, expected updates array' }));
        }

        // Save each table layout update
        const updates = data.updates.map(t => ({
            id: t.id,
            x: t.x,
            y: t.y,
            rotation: t.rotation,
            tenant_id: t.tenant_id
        }));

        const { data: result, error } = await supabase.from('tables').upsert(updates);

        if (error) {
            console.error('Supabase upsert error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: error.message }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, data: result }));

    } catch (err) {
        console.error('Handler error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
}
