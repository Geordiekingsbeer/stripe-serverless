// File: /api/webhook.js
// FINAL DEFINITIVE VERSION: Includes deduplication, fulfillment, and external notification trigger.

import Stripe from 'stripe'; 
import { createClient } from '@supabase/supabase-js'; 
import { Readable } from 'stream'; 

// NOTE: YOU MUST REPLACE THIS PLACEHOLDER WITH THE ACTUAL WEBHOOK URL GIVEN BY MAKE/ZAPIER
const MAKE_NOTIFICATION_URL = 'YOUR_MAKE_WEBHOOK_URL_HERE'; 

// Helper function to convert the raw request stream into a buffer (CRITICAL for Stripe verification)
async function buffer(readable) {
    const chunks = [];
    for await (const chunk of readable) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

// This function calculates the estimated end time based on a standard duration (e.g., 2 hours)
function calculateEndTime(startTime) {
    const [hours, minutes] = startTime.split(':').map(Number);
    const durationHours = 2; 
    let endHour = hours + durationHours;
    
    if (endHour >= 24) { endHour -= 24; } 

    const endHourStr = String(endHour).padStart(2, '0');
    const endMinuteStr = String(minutes).padStart(2, '0'); 

    return `${endHourStr}:${endMinuteStr}`;
}

// --- CRITICAL ENVIRONMENT VARIABLES ---
const SUPABASE_URL = 'https://Rrjvdabtqzkaomjuiref.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET; 
// ------------------------------------

// Initialize clients
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const _supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);


export default async function (req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');

    let event;
    
    if (req.method !== 'POST') {
        return res.status(405).send('Method not allowed.');
    }

    const buf = await buffer(req); 
    const sig = req.headers['stripe-signature'];
    
    try {
        event = stripe.webhooks.constructEvent(
            buf, sig, WEBHOOK_SECRET
        );
    } catch (err) {
        console.error('--- STRIPE SIGNATURE FAILURE ---');
        return res.status(400).send(`Webhook Error: Signature verification failed.`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        
        // Tracking Metadata
        const tableIdsString = session.metadata.table_ids_list;
        const customerEmail = session.metadata.customer_email;
        const bookingDate = session.metadata.booking_date;
        const startTime = session.metadata.booking_time;
        const customerName = session.metadata.customer_name;
        const partySize = session.metadata.party_size;
        const tenantId = session.metadata.tenant_id;
        const bookingRef = session.metadata.booking_ref;
        const totalPence = session.amount_total; // Get total amount from session object

        if (!tenantId || !bookingRef) {
            return res.status(500).json({ received: true, status: 'Metadata Missing' });
        }
        
        // 1. IDEMPOTENCY CHECK (Prevents double processing)
        const { data: existingProcessedBookings } = await _supaAdmin
            .from('premium_slots')
            .select('booking_ref')
            .eq('booking_ref', bookingRef)
            .limit(1);

        if (existingProcessedBookings && existingProcessedBookings.length > 0) {
            console.warn(`Idempotency Check: Booking reference ${bookingRef} already processed. Skipping fulfillment.`);
            await logConversionStatusUpdate(tenantId, bookingRef); 
            return res.status(200).json({ received: true, status: 'Already Processed' });
        }


        // 2. PREPARE DATA AND FULFILL BOOKING
        const endTime = calculateEndTime(startTime);
        const tableIdsArray = tableIdsString.split(',').map(id => Number(id));

        const bookingsToInsert = tableIdsArray.map(tableId => ({
            table_id: tableId,
            date: bookingDate, 
            start_time: startTime, 
            end_time: endTime, 
            // MINIMALIST PAYLOAD for fulfillment
            tenant_id: tenantId, 
            booking_ref: bookingRef,
        }));

        // 3. BULK INSERT into premium_slots (The Fulfillment Step)
        const { error: insertError } = await _supaAdmin
            .from('premium_slots')
            .insert(bookingsToInsert);

        if (insertError) {
            console.error('--- SUPABASE BULK INSERT FAILED (BOOKING FULFILLMENT) ---');
            console.error('Code:', insertError.code, 'Message:', insertError.message);
            return res.status(500).json({ received: false, status: 'Fulfillment Insert Failed' });
        }
        
        // 4. EXTERNAL NOTIFICATION & TRACKING UPDATE
        
        // Log conversion success (analytic tracking)
        await logConversionStatusUpdate(tenantId, bookingRef);

        // Build notification payload
        const notificationPayload = {
            tenantId: tenantId,
            bookingRef: bookingRef,
            customerName: customerName,
            tableIds: tableIdsString,
            bookingDate: bookingDate,
            startTime: startTime,
            totalValue: (totalPence / 100).toFixed(2), // Convert pence to £/EUR
        };

        // Trigger Make/Zapier notification
        if (MAKE_NOTIFICATION_URL !== 'YOUR_MAKE_WEBHOOK_URL_HERE') {
            fetch(MAKE_NOTIFICATION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(notificationPayload),
            }).catch(e => console.error("Make/Zapier Notification Failed:", e.message));
        } else {
             console.warn("Notification skipped: MAKE_NOTIFICATION_URL not set.");
        }
        
        console.log(`Successfully fulfilled booking ${bookingRef}.`);
    } 

    // Helper function to update tracking status
    async function logConversionStatusUpdate(tenantId, bookingRef) {
        const { error: trackingError } = await _supaAdmin
            .from('engagement_tracking')
            .update({ 
                payment_successful: true 
            })
            .eq('tenant_id', tenantId)
            .eq('booking_ref', bookingRef);

        if (trackingError) {
            console.error('--- TRACKING STATUS UPDATE FAILED ---');
        }
    }

    // 5. Return 200 response to Stripe to acknowledge success (FINAL STEP)
    return res.status(200).json({ received: true });
}
