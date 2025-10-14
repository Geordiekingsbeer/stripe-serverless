// api/webhook.js (Stripe Webhook Handler - Final Schema Alignment)

import { buffer } from 'micro';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// --- Configuration Checks ---
const supabaseUrl = 'https://Rrjvdabtqzkaomjuiref.supabase.co';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

if (!STRIPE_SECRET_KEY) throw new Error("CRITICAL: STRIPE_SECRET_KEY is missing from Vercel ENV.");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("CRITICAL: SUPABASE_SERVICE_ROLE_KEY is missing from Vercel ENV.");
if (!STRIPE_WEBHOOK_SECRET) throw new Error("CRITICAL: STRIPE_WEBHOOK_SECRET is missing from Vercel ENV.");


const supabase = createClient(supabaseUrl, SUPABASE_SERVICE_ROLE_KEY);
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });

export const config = { api: { bodyParser: false } };

function calculateEndTime(startTime) {
    const parts = startTime.split(':').map(Number);
    const date = new Date(0, 0, 0, parts[0], parts[1]);
    date.setHours(date.getHours() + 1);
    const endH = String(date.getHours()).padStart(2, '0');
    const endM = String(date.getMinutes()).padStart(2, '0');
    return `${endH}:${endM}:00`;
}


export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const buf = await buffer(req);
    const signature = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(buf, signature, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error(`⚠️ Webhook signature verification failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const metadata = session.metadata;

        if (!metadata || !metadata.table_ids) {
            console.error('Missing required metadata (table_ids).');
            return res.status(400).json({ received: true, message: 'Missing metadata.' });
        }

        try {
            const tableIds = JSON.parse(metadata.table_ids);
            if (!Array.isArray(tableIds) || tableIds.length === 0) throw new Error("Parsed table_ids is empty or not an array.");

            const bookingTime = metadata.booking_time;
            const endTime = calculateEndTime(bookingTime);
            const customerEmail = metadata.customer_email || session.customer_details?.email || 'N/A';

            const insertions = tableIds.map(id => ({
                tenant_id: metadata.tenant_id,
                table_id: Number(id),
                date: metadata.booking_date,
                start_time: bookingTime + ':00',
                end_time: endTime,
                host_notes: `Customer: ${metadata.customer_name}, Party: ${metadata.party_size}, Ref: ${metadata.booking_ref}, Stripe ID: ${session.id}`,
                
                // --- ALIGNMENT FIXES ---
                stripe_order_id: session.id, // Column exists in your table
                booking_ref: metadata.booking_ref, // Column exists in your table
                customer_email: customerEmail, // NEW Column created in Step 1
                // --- REMOVED: is_premium (Does not exist in your table) ---
                // -----------------------
            }));

            // Insert the records into Supabase, with RLS hardening
            const { error: insertError } = await supabase
                .from('premium_slots')
                .insert(insertions, { returning: 'minimal', defaultToNull: true });

            if (insertError) {
                console.error('Supabase FINAL INSERT FAILURE:', insertError.message, 'Payload:', JSON.stringify(insertions));
                throw new Error(insertError.message);
            }

            console.log(`SUCCESS: Recorded ${insertions.length} premium booking(s) for tenant ${metadata.tenant_id}.`);
            return res.status(200).json({ received: true, message: 'Bookings recorded successfully.' });

        } catch (dbError) {
            console.error('Webhook Runtime/DB Operation Failed:', dbError.message);
            return res.status(500).json({ received: false, error: 'Database operation failed.', detail: dbError.message });
        }
    }

    return res.status(200).json({ received: true, message: `Handled event: ${event.type}` });
}
