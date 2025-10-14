// File: /api/admin-create-booking.js

import { createClient } from '@supabase/supabase-js';
import Cors from 'cors'; // ADDED: Import Cors library

// --- CRITICAL ENVIRONMENT VARIABLES ---
const SUPABASE_URL = 'https://Rrjvdabtqzkaomjuiref.supabase.co';
// This key must be set in your Vercel Environment Variables!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; 

const _supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// --- CORS Configuration ---
// CRITICAL: This allows requests ONLY from your GitHub Pages URL.
const cors = Cors({
  methods: ['POST', 'OPTIONS'],
  origin: 'https://geordiekingsbeer.github.io', // <--- YOUR FRONTEND DOMAIN
  optionsSuccessStatus: 200, 
});

// Middleware runner helper
function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
}
// ----------------------------


export default async function handler(req, res) {
    // 1. Run CORS middleware (Replaces the manual res.setHeader lines)
    await runMiddleware(req, res, cors); 

    // Handle the preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    // 2. Extract data sent from the Admin page
    const { tableId, date, startTime, endTime, notes, tenantId } = req.body;

    if (!tableId || !date || !startTime || !endTime || !tenantId) {
        return res.status(400).json({ error: 'Missing required booking data.' });
    }

    const newBooking = {
        table_id: tableId,
        date: date,
        start_time: startTime,
        end_time: endTime,
        host_notes: notes,
        tenant_id: tenantId,
    };

    // 3. Perform the secure insertion using the Service Role Key
    try {
        // This insertion uses the highly privileged key, bypassing the RLS that caused the 401
        const { data, error } = await _supaAdmin.from('premium_slots').insert([newBooking]);

        if (error) {
            console.error('Admin booking failed:', error);
            // Return a clean error message, not the full Supabase error
            return res.status(500).json({ error: 'Database insert failed. Check Vercel logs.' });
        }
        return res.status(200).json({ message: 'Booking created successfully!', data });
    } catch (err) {
        console.error('Server error during admin booking:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
}
