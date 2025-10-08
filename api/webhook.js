// api/webhook.js (Stripe Webhook Handler)

// Vercel helpers for reading the raw request body
import { buffer } from 'micro';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// --- Configuration ---
// IMPORTANT: Use the Service Role Key for secure server-side access to Supabase
// These ENV variables MUST be set in your Vercel Dashboard
const supabaseUrl = 'https://Rrjvdabtqzkaomjuiref.supabase.co';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;


// Initialize Supabase Client
if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing in environment variables.");
}
const supabase = createClient(supabaseUrl, SUPABASE_SERVICE_ROLE_KEY);


// Initialize Stripe Client
if (!STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is missing in environment variables.");
}
const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2022-11-15',
});


// Vercel-specific config to handle the raw request body (Stripe requirement)
export const config = {
    api: {
        bodyParser: false,
    },
};

// Helper function to handle time duration
function calculateEndTime(startTime) {
    const [h, m] = startTime.split(':').map(Number);
    const date = new Date();
    date.setHours(h);
    date.setMinutes(m);
    
    // Assuming 1-hour booking duration (standard for premium slots)
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
        // 1. Verify the Stripe signature for security
        event = stripe.webhooks.constructEvent(buf, signature, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error(`⚠️ Webhook signature verification failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // 2. Handle the 'checkout.session.completed' event
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const metadata = session.metadata;

        if (!metadata || !metadata.table_ids) {
            console.error('Missing required metadata (table_ids) for booking insertion.');
            return res.status(400).json({ received: true, message: 'Missing metadata.' });
        }

        // --- Prepare Data ---
        const tableIds = JSON.parse(metadata.table_ids); // Table IDs as an array
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

        try {
            // 3. Insert the records into Supabase
            const { error: insertError } = await supabase
                .from('premium_slots')
                .insert(insertions);

            if (insertError) {
                console.error('Supabase Insert Error:', insertError);
                // Throw error to trigger the 500 response below
                throw new Error(insertError.message);
            }

            console.log(`Successfully recorded ${insertions.length} premium booking(s) for tenant ${tenantId}.`);
            
            // CRITICAL: The Supabase trigger fires immediately after this insert,
            // which calls your working /api/send-staff-email function.

            return res.status(200).json({ received: true, message: 'Bookings recorded successfully.' });

        } catch (dbError) {
            console.error('Database Operation Failed:', dbError.message);
            // Return 500 status to Stripe to request a retry of the webhook
            return res.status(500).json({ received: false, error: 'Database operation failed.', detail: dbError.message });
        }
    }

    // 4. Respond to all other Stripe events with 200 OK
    return res.status(200).json({ received: true, message: `Handled event: ${event.type}` });
}
