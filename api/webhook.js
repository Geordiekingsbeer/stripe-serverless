// File: /api/webhook.js
// FINAL FIX: Relies on vercel.json for raw body access and uses modern syntax.

import Stripe from 'stripe'; 
import { createClient } from '@supabase/supabase-js'; 

// This function calculates the estimated end time based on a standard duration (e.g., 2 hours)
function calculateEndTime(startTime) {
    const [hours, minutes] = startTime.split(':').map(Number);
    const durationHours = 2; // Assume a standard 2-hour booking slot
    let endHour = hours + durationHours;
    let endMinute = minutes;

    if (endHour >= 24) { endHour -= 24; }

    const endHourStr = String(endHour).padStart(2, '0');
    const endMinuteStr = String(minutes).padStart(2, '0');

    return `${endHourStr}:${endMinuteStr}`;
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
    // 1. Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');

    let event;
    
    if (req.method !== 'POST') {
        return res.status(405).send('Method not allowed.');
    }

    // 2. Security Check: Use req.body (which is the raw Buffer due to vercel.json)
    const sig = req.headers['stripe-signature'];
    
    try {
        // Stripe verification requires the raw body buffer
        event = stripe.webhooks.constructEvent(
            req.body, sig, WEBHOOK_SECRET
        );
    } catch (err) {
        console.error('--- STRIPE SIGNATURE FAILURE ---');
        console.error(`Error: ${err.message}`);
        console.error('--------------------------------');
        return res.status(400).send(`Webhook Error: Signature verification failed.`);
    }

    // 3. Handle the event and insert into Supabase
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        
        // Retrieve metadata passed from create-checkout.js
        const tableIdsString = session.metadata.table_ids_list;
        const customerEmail = session.metadata.customer_email;
        const bookingDate = session.metadata.booking_date;
        const startTime = session.metadata.booking_time;
        const checkoutSessionId = session.id;

        if (!tableIdsString || !bookingDate || !startTime) {
            console.error('Fulfillment Error: Metadata missing.');
            return res.status(500).json({ received: true, status: 'Metadata Missing' });
        }

        // Prepare for BULK INSERT
        const endTime = calculateEndTime(startTime);
        const tableIdsArray = tableIdsString.split(',').map(id => Number(id));

        const bookingsToInsert = tableIdsArray.map(tableId => ({
            table_id: tableId,
            date: bookingDate, 
            start_time: startTime, 
            end_time: endTime, 
            host_notes: `Order: ${checkoutSessionId}. Email: ${customerEmail}`,
        }));

        // BULK INSERT into Supabase using the Service Role Key
        const { error: insertError } = await _supaAdmin
            .from('premium_slots')
            .insert(bookingsToInsert);

        if (insertError) {
            console.error('--- SUPABASE BULK INSERT FAILED ---');
            console.error('Code:', insertError.code, 'Message:', insertError.message);
            console.error('-----------------------------------');
            return res.status(200).json({ received: true, status: 'Supabase Insert Error' });
        }
        
        console.log(`Successfully booked ${tableIdsArray.length} tables for ${customerEmail}.`);
    } 

    // Return 200 response to Stripe to acknowledge the webhook
    return res.status(200).json({ received: true });
}
