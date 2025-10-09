// admin-save-layout.js (FINAL SECURE FIX - Headers Broadened)

import { createClient } from '@supabase/supabase-js';

// --- Configuration ---
const supabaseUrl = 'https://Rrjvdabtqzkaomjuiref.supabase.co';
// CRITICAL: Pull the key from Vercel's secure Environment Variables
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Fail fast if key is missing (prevents silent crash)
if (!SUPABASE_SERVICE_ROLE_KEY) {
    // This throws an error that Vercel logs as a 500
    throw new Error('CRITICAL: SUPABASE_SERVICE_ROLE_KEY is missing in Vercel environment.');
}

const supabase = createClient(supabaseUrl, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
    // --- CORS Headers FIX (Broadened for maximum compatibility) ---
    // This MUST run before the OPTIONS handler to ensure the header is present on preflight.
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, PUT, PATCH, DELETE'); // Broadened methods list
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // --- Handle preflight request (CRITICAL for fixing the CORS error) ---
    if (req.method === 'OPTIONS') {
        // Must return 200 OK immediately for preflight check
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { updates } = req.body;

        if (!updates || !Array.isArray(updates)) {
            return res.status(400).json({ error: 'Invalid payload' });
        }

        // Use a single upsert call for efficiency and transactional integrity
        const { data, error } = await supabase
            .from('tables')
            .upsert(updates)
            .select('id, x, y, rotation, tenant_id'); 

        if (error) {
            console.error('Supabase Save Error:', error.message, 'Payload:', JSON.stringify(updates));
            // Throw error to trigger 500 status and log the payload
            throw new Error(error.message);
        }

        // Return the full updated data for the client to refresh the map
        return res.status(200).json({ success: true, data: data, message: 'Layout saved successfully.' });
        
    } catch (error) {
        console.error('Error saving layout:', error.message);
        // Ensure a 500 status is returned if the database failed
        return res.status(500).json({ error: `Server Error: ${error.message}` });
    }
}
