// File: /api/create-checkout.js

import Stripe from 'stripe';

// --- CRITICAL ENVIRONMENT VARIABLES (Must be set in Vercel Dashboard) ---
// NOTE: Vercel automatically exposes the variables you set in the dashboard.

// Initialize Stripe. Uses STRIPE_SECRET_KEY environment variable.
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

export default async function (req, res) {
    // Set CORS headers for security and browser compatibility
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle the preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).send('Method not allowed.');
    }

    try {
        const { 
            table_ids, 
            booking_date, 
            booking_time, 
            customer_email, 
            customer_name, 
            party_size, 
            total_pence, 
            tenant_id, 
            booking_ref // CRITICAL: Your unique tracking/booking ID
        } = req.body;

        // Basic input validation (optional but recommended)
        if (!table_ids || total_pence === undefined || !tenant_id || !booking_ref) {
            return res.status(400).json({ error: 'Missing critical booking or tracking metadata.' });
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'gbp',
                        product_data: {
                            name: `Premium Table Slot Booking`,
                            description: `Reservation for ${customerName} (Party of ${party_size}) on ${booking_date} at ${booking_time}. Total tables: ${table_ids.length}.`,
                        },
                        unit_amount: total_pence,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            
            // CRITICAL FIX: Pass tracking IDs back to the success page URL
            success_url: `https://stripe-serverless-phi.vercel.app/success-page.html?tenant_id=${tenant_id}&booking_ref=${booking_ref}`,
            cancel_url: 'https://geordiekingsbeer.github.io/table-picker/customer.html',
            
            // Pass ALL necessary data for the webhook and database insert
            metadata: {
                table_ids_list: table_ids.join(','),
                booking_date,
                booking_time,
                customer_email,
                customer_name,
                party_size,
                tenant_id,      // Passed to metadata for webhook database insert
                booking_ref,    // Passed to metadata for webhook tracking insert
            },
            customer_email: customer_email,
        });

        return res.status(200).json({ sessionId: session.id, url: session.url });
    } catch (error) {
        console.error('Stripe checkout error:', error);
        return res.status(500).json({ error: error.message });
    }
}
