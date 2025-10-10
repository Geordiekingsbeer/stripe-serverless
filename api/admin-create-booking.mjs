// admin-create-booking.js (FIXED: Added explicit CORS handler)

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Client (Uses Service Role Key from Vercel ENV)
const supabaseUrl = 'https://Rrjvdabtqzkaomjuiref.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; 

if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('CRITICAL: SUPABASE_SERVICE_ROLE_KEY is missing in Vercel environment.');
}
const supabase = createClient(supabaseUrl, SUPABASE_SERVICE_ROLE_KEY);

export default async function (req, res) {
    // --- CORS Headers FIX (Must be applied first) ---
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // --- CRITICAL FIX: Handle the OPTIONS request explicitly ---
    if (req.method === 'OPTIONS') {
        return res.status(200).end(); // Returns 200 OK for preflight check immediately
    }
    // --- END CORS FIX ---

    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const { tableId, date, startTime, endTime, notes, tenantId } = req.body;

        if (!tableId || !date || !startTime || !endTime || !tenantId) {
            return res.status(400).json({ error: 'Missing required fields for booking.' });
        }

        // Check for existing bookings to prevent overlap (simple check)
        const { data: existingBookings, error: selectError } = await supabase
            .from('premium_slots')
            .select('id')
            .eq('table_id', tableId)
            .eq('date', date)
            .lt('start_time', endTime)
            .gt('end_time', startTime);

        if (selectError) {
            console.error('Booking conflict check failed:', selectError.message);
            throw new Error('Database check failed.');
        }

        if (existingBookings && existingBookings.length > 0) {
            return res.status(409).json({ error: 'Conflict: Table is already booked during this time slot.' });
        }

        // Insert the new booking using the privileged Service Role Key
        const { data: newBooking, error: insertError } = await supabase
            .from('premium_slots')
            .insert({
                tenant_id: tenantId,
                table_id: tableId,
                date: date,
                start_time: startTime + ':00',
                end_time: endTime + ':00',
                host_notes: notes || 'Admin Booking',
                is_premium: true
            })
            .select();

        if (insertError) {
            console.error('Supabase Insert Error:', insertError.message);
            throw new Error(`Insert failed: ${insertError.message}`);
        }

        // NOTE: The database trigger should fire here to send the staff email.

        return res.status(200).json({ 
            message: 'Booking successful.', 
            data: newBooking 
        });

    } catch (error) {
        console.error('Admin Booking API Crash:', error.message);
        return res.status(500).json({ error: `Server error during booking: ${error.message}` });
    }
}
