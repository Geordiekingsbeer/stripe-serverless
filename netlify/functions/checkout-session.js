import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js'; // Import Supabase Client

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// --- Supabase Client Setup (using environment variables) ---
// IMPORTANT: These environment variables must be set in your Netlify dashboard
// (Settings -> Environment Variables) for the function to work!
const supabaseUrl = process.env.SUPABASE_URL || 'https://Rrjvdabtqzkaomjuiref.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyanZkYWJ0cXprYW9tanVpcmVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNDM3MzQsImV4cCI6MjA3NDcxOTczNH0.wAEeowZ8Yc8K54jAxEbY-8-mM0OGciMmyz6fJb9Z1Qg'; // Use ANON key as fallback
const _supa = createClient(supabaseUrl, supabaseKey);
// -------------------------------------------------------------

export default async function (req, res) {
    // --- Manual CORS Handling ---
    res.setHeader('Access-Control-Allow-Origin', 'https://geordiekingsbeer.github.io');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end(); 
    }

    if (req.method !== 'POST') {
        return res.status(405).send('Method not allowed. Use POST.');
    }

    try {
        const data = JSON.parse(req.body);

        const { 
            table_ids, booking_date, booking_time, customer_email, customer_name,
            party_size, total_pence, tenant_id, booking_ref
        } = data;

        if (!table_ids || total_pence === undefined || !tenant_id || !booking_ref) {
            console.error("Fulfillment Error: Critical Metadata missing in request body.");
            return res.status(400).json({ error: 'Missing critical booking or tracking metadata.' });
        }
        
        // --- 1. ADMIN EMAIL LOGIC INTEGRATION (The Fix) ---
        // We compile the data into a 'record' structure, mimicking the Admin site's output.
        // This MUST happen BEFORE the user is redirected to Stripe, but after validation.
        const emailRecord = {
            tenant_id,
            table_id: table_ids.join(', '), // Join array for email text clarity
            date: booking_date,
            start_time: booking_time + ':00', // Time must be in HH:MM:SS format
            end_time: "N/A", // This customer booking doesn't define end_time, using N/A
            host_notes: `Customer Booking Ref: ${booking_ref} | Name: ${customer_name}`,
            staff_email: 'customer_service_email@yourdomain.com', // Replace with a real staff email
            customer_email: customer_email // For receipt/internal logs
        };

        try {
            await _supa.functions.invoke('send-confirmation', {
                body: { record: emailRecord }
            });
            console.log("Customer: Confirmation email successfully triggered.");
        } catch (e) {
            console.warn('Customer: Email send failed after payment setup:', e);
            // DO NOT block Stripe checkout even if email fails
        }
        // -----------------------------------------------------------------

        // --- 2. CREATE STRIPE SESSION ---
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'gbp',
                        product_data: {
                            name: `Premium Table Slot Booking`,
                            description: `Reservation for ${customer_name} (Party of ${party_size}) on ${booking_date} at ${booking_time}. Total tables: ${table_ids.length}.`,
                        },
                        unit_amount: total_pence,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            
            // Success URL uses the new, clean Netlify project URL
            success_url: `https://dine-select-api.netlify.app/success-page.html?tenant_id=${tenant_id}&booking_ref=${booking_ref}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: 'https://geordiekingsbeer.github.io/table-picker/customer.html',
            
            metadata: {
                table_ids: JSON.stringify(table_ids),
                booking_date: booking_date,
                booking_time: booking_time,
                customer_email: customer_email,
                customer_name: customer_name,
                party_size: party_size.toString(),
                tenant_id: tenant_id,
                booking_ref: booking_ref,
            },
            customer_email: customer_email,
        });

        return res.status(200).json({ sessionId: session.id, url: session.url });
    } catch (error) {
        console.error('Stripe checkout error:', error);
        return res.status(500).json({ error: error.message });
    }
}
