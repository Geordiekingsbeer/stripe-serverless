// api/webhook.js (Stripe Webhook Handler - FINAL HARDENING)

import { buffer } from 'micro';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// --- Configuration Checks ---
const supabaseUrl = 'https://Rrjvdabtqzkaomjuiref.supabase.co';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// 1. Force crash on Vercel if any key is missing
if (!STRIPE_SECRET_KEY) throw new Error("CRITICAL: STRIPE_SECRET_KEY is missing from Vercel ENV.");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("CRITICAL: SUPABASE_SERVICE_ROLE_KEY is missing from Vercel ENV.");
if (!STRIPE_WEBHOOK_SECRET) throw new Error("CRITICAL: STRIPE_WEBHOOK_SECRET is missing from Vercel ENV.");


// 2. Initialize Supabase Client
const supabase = createClient(supabaseUrl, SUPABASE_SERVICE_ROLE_KEY);


// 3. Initialize Stripe Client
const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2022-11-15',
});


// Vercel-specific config to handle the raw request body
export const config = {
    api: {
        bodyParser: false,
    },
};

// Helper function to handle time duration (assuming 1-hour booking)
function calculateEndTime(startTime) {
    const parts = startTime.split(':').map(Number);
    const date = new Date(0, 0, 0, parts[0], parts[1]);
    
    date.setHours(date.getHours() + 1);
    
    const endH = String(date.getHours()).padStart(2, '0');
    const endM = String(date.getMinutes()).padStart(2, '0');
    
    return `${endH}:${endM}:00`; // Format HH:MM:SS
}


export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const buf = await buffer(req);
    const signature = req.headers['stripe-signature'];

    let event;

    try {
        // 4. Verify the Stripe signature for security
        event = stripe.webhooks.constructEvent(buf, signature, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        // This log is for manual test errors or actual failures
        console.error(`⚠️ Webhook signature verification failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // 5. Handle the 'checkout.session.completed' event
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const metadata = session.metadata;

        if (!metadata || !metadata.table_ids) {
            console.error('Missing required metadata (table_ids) for booking insertion. Check create-checkout.js.');
            return res.status(400).json({ received: true, message: 'Missing metadata.' });
        }

        // --- Prepare Data ---
        try {
            const tableIds = JSON.parse(metadata.table_ids);
            
            // Validate parsed tableIds
            if (!Array.isArray(tableIds) || tableIds.length === 0) {
                 throw new Error("Parsed table_ids is empty or not an array.");
            }

            const bookingDate = metadata.booking_date;
            const bookingTime = metadata.booking_time;
            const tenantId = metadata.tenant_id;
            const endTime = calculateEndTime(bookingTime);

            const customerInfo = {
                name: metadata.customer_name,
                party: metadata.party_size,
                ref: metadata.booking_ref || 'N/A'
            };

            const insertions = tableIds.map(id => ({
                tenant_id: tenantId,
                table_id: Number(id),
                date: bookingDate,
                start_time: bookingTime + ':00',
                end_time: endTime,
                host_notes: `Customer: ${customerInfo.name}, Party: ${customerInfo.party}, Ref: ${customerInfo.ref}, Stripe ID: ${session.id}`,
                customer_email: session.customer_details?.email || metadata.customer_email || 'N/A',
                is_premium: true,
            }));

            // 6. Insert the records into Supabase, with RLS hardening
            const { error: insertError } = await supabase
                .from('premium_slots')
                .insert(insertions, { 
                    // CRITICAL RLS BYPASS: Use returning: 'minimal' and defaultToNull to force server mode
                    returning: 'minimal',
                    defaultToNull: true
                });

            if (insertError) {
                // Log the precise database error for debugging
                console.error('Supabase RLS/Insert CRITICAL Failure:', insertError.message, 'Payload:', JSON.stringify(insertions));
                throw new Error(insertError.message);
            }

            console.log(`Successfully recorded ${insertions.length} premium booking(s) for tenant ${tenantId}.`);
            
            return res.status(200).json({ received: true, message: 'Bookings recorded successfully.' });

        } catch (dbError) {
            console.error('Webhook Runtime/DB Operation Failed:', dbError.message);
            // Return 500 status to Stripe to request a retry
            return res.status(500).json({ received: false, error: 'Database operation failed.', detail: dbError.message });
        }
    }

    // 7. Respond to all other Stripe events with 200 OK
    return res.status(200).json({ received: true, message: `Handled event: ${event.type}` });
}
