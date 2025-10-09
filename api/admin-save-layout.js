// api/admin-save-layout.js

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://Rrjvdabtqzkaomjuiref.supabase.co';
// NOTE: This MUST be the SUPABASE_SERVICE_ROLE_KEY from Vercel ENV
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; 

if (!SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server configuration error: Missing service role key.' });
}
const supabase = createClient(supabaseUrl, SUPABASE_SERVICE_ROLE_KEY);

export default async function (req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const { updates } = req.body;

        if (!updates || updates.length === 0) {
            return res.status(400).json({ error: 'No updates provided.' });
        }
        
        // Use Service Role to securely upsert the data, bypassing RLS
        const { data, error } = await supabase
            .from('tables')
            .upsert(updates)
            .select('id, x, y, rotation, tenant_id');

        if (error) {
            console.error('Supabase Save Error:', error.message);
            return res.status(500).json({ error: `Database Save Failed: ${error.message}` });
        }

        return res.status(200).json({ 
            message: 'Layout saved successfully.', 
            data: data 
        });

    } catch (error) {
        console.error('Admin Save API Crash:', error);
        return res.status(500).json({ error: 'Internal server error during save.' });
    }
}
