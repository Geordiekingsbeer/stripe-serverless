// File: /api/webhook.js

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


const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js'); 

// --- CRITICAL ENVIRONMENT VARIABLES ---
const SUPABASE_URL = 'https://Rrjvdabtqzkaomjuiref.supabase.co';
// WARNING: This key MUST be retrieved from Vercel's environment settings.
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET; 
// ------------------------------------

const _supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

module.exports = async (req, res) => {
    let event;
    
    // Vercel/Node.js way to handle different request types
    if (req.method !== 'POST') {
        return res.status(405).send('Method not allowed.');
    }

    // 1. Verify the Stripe signature (Security)
    const sig = req.headers['stripe-signature'];
    
    try {
        // req.body must be the raw body for signature verification to work
        event = stripe.webhooks.constructEvent(
            req.body, sig, WEBHOOK_SECRET
        );
    } catch (err) {
        console.error(`⚠️ Webhook signature verification failed.`, err.message);
        return res.status(400).send(`Webhook Error: Signature verification failed.`);
    }

    // 2. Handle the specific event: Payment Succeeded
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        
        // 3. Retrieve ALL CRITICAL data from metadata
        const tableIdsString = session.metadata.table_ids_list;
        const customerEmail = session.metadata.customer_email;
        const bookingDate = session.metadata.booking_date;
        const startTime = session.metadata.booking_time;
        const checkoutSessionId = session.id;

        if (!tableIdsString || !bookingDate || !startTime) {
            console.error('Metadata missing booking details. Cannot fulfill booking.');
            return res.status(500).json({ received: true, status: 'Metadata Missing' });
        }

        // Calculate end time based on assumed duration (2 hours)
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
        const { error: insertError } = await _supaAdmin
            .from('premium_slots')
            .insert(bookingsToInsert);

        if (insertError) {
            console.error('SUPABASE BULK INSERT FAILED:', insertError);
            return res.status(200).json({ received: true, status: 'Supabase Insert Error' });
        }
        
        console.log(`Successfully booked ${tableIdsArray.length} tables for ${customerEmail}.`);
    } 

    // 6. Return a 200 response to Stripe for all successful event handling
    res.status(200).json({ received: true });
};
