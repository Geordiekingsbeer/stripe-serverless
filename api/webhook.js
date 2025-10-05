// File: /api/webhook.js
// FIX: Using modern ES Module imports and export default
// CRITICAL: Includes deep logging of the Supabase error on failure.

import Stripe from 'stripe'; 
import { createClient } from '@supabase/supabase-js'; 

// --- Helper Function ---
// This function calculates the estimated end time based on a standard duration (e.g., 2 hours)
function calculateEndTime(startTime) {
    // Expects "HH:MM" format, e.g., "19:00"
    const [hours, minutes] = startTime.split(':').map(Number);
    const durationHours = 2; // Assume a standard 2-hour booking slot
    
    let endHour = hours + durationHours;
    let endMinute = minutes;

    // Handle wrap-around midnight (though rare for a restaurant booking)
    if (endHour >= 24) {
        endHour -= 24; 
    }

    const endHourStr = String(endHour).padStart(2, '0');
    const endMinuteStr = String(endMinute).padStart(2, '0');

    return `${endHourStr}:${endMinuteStr}`; // Returns "HH:MM"
}


// --- CRITICAL ENVIRONMENT VARIABLES (Loaded from Vercel settings) ---
const SUPABASE_URL = 'https://Rrjvdabtqzkaomjuiref.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET; 
// ------------------------------------

// Initialize clients
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const _supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);


export default async function (req, res) {
    // 1. Set CORS headers (Required for Vercel functions, even webhooks)
    res.setHeader('Access-Control-Allow-Origin', '*');

    let event;
    
    if (req.method !== 'POST') {
        return res.status(405).send('Method not allowed.');
    }

    // 2. Verify the Stripe signature (Security)
    const sig = req.headers['stripe-signature'];
    
    try {
        event = stripe.webhooks.constructEvent(
            req.body, sig, WEBHOOK_SECRET
        );
    } catch (err) {
        console.error(`⚠️ Webhook signature verification failed.`, err.message);
        return res.status(400).send(`Webhook Error: Signature verification failed.`);
    }

    // 3. Handle the specific event: Payment Succeeded
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        
        // Retrieve data from metadata
        const tableIdsString = session.metadata.table_ids_list;
        const customerEmail = session.metadata.customer_email;
        const bookingDate = session.metadata.booking_date;
        const startTime = session.metadata.booking_time;
        const checkoutSessionId = session.id;

        if (!tableIdsString || !bookingDate || !startTime) {
            console.error('Metadata missing booking details. Cannot fulfill booking.');
            return res.status(500).json({ received: true, status: 'Metadata Missing' });
        }

        // Calculate end time
        const endTime = calculateEndTime(startTime);

        // 4. Prepare for BULK INSERT
        const tableIdsArray = tableIdsString.split(',').map(id => Number(id));

        const bookingsToInsert = tableIdsArray.map(tableId => ({
            table_id: tableId,
            date: bookingDate, 
            start_time: startTime, 
            end_time: endTime, 
            host_notes: `Order: ${checkoutSessionId}. Email: ${customerEmail}`,
        }));

        // 5. BULK INSERT into Supabase using the Service Role Key
        const { data: insertData, error: insertError } = await _supaAdmin
            .from('premium_slots')
            .insert(bookingsToInsert);

        if (insertError) {
            // *** CRITICAL: LOG THE SPECIFIC SUPABASE ERROR ***
            console.error('--- SUPABASE BULK INSERT FAILED ---');
            console.error('Supabase Error Code:', insertError.code);
            console.error('Supabase Error Message:', insertError.message);
            console.error('Data Attempted:', bookingsToInsert);
            console.error('-----------------------------------');
            
            // Log the error but return 200 to Stripe to prevent retries
            return res.status(200).json({ received: true, status: 'Supabase Insert Error' });
        }
        
        console.log(`Successfully booked ${tableIdsArray.length} tables for ${customerEmail}.`);
    } 

    // 6. Return a 200 response to Stripe for all successful event handling
    res.status(200).json({ received: true });
}
