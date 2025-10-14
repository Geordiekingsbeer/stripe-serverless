// File: /api/create-checkout.js

import Stripe from 'stripe';
// NOTE: We remove the 'cors' import since we are using manual headers now.

// --- CRITICAL ENVIRONMENT VARIABLES (Must be set in Vercel Dashboard) ---
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
    // 1. MANUALLY SET CORS HEADERS (The brute-force fix)
    const allowedOrigin = 'https://geordiekingsbeer.github.io';
    
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );
    
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
            email,
            customer_name,
            party_size,
            total_pence,
            tenant_id,
            booking_ref
        } = req.body;

        if (!table_ids || total_pence === undefined || !tenant_id || !booking_ref) {
              console.error("Fulfillment Error: Critical Metadata missing in request body.");
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
                            description: `Reservation for ${customer_name} (Party of ${party_size}) on ${booking_date} at ${booking_time}. Total tables: ${table_ids.length}.`,
                        },
                        unit_amount: total_pence,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            
            // CRITICAL: Success/Cancel URLs must point to your GitHub Pages domain
            success_url: `https://geordiekingsbeer.github.io/table-picker/success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `https://geordiekingsbeer.github.io/table-picker/pick-seat.html`,
            
            metadata: {
                table_ids_list: JSON.stringify(table_ids),
                booking_date: String(booking_date),
                booking_time: String(booking_time),
                customer_email: String(email),
                customer_name: String(customer_name),
                party_size: String(party_size),
                tenant_id: String(tenant_id),
                booking_ref: String(booking_ref),
            },
            customer_email: email,
        });

        return res.status(200).json({ sessionId: session.id, url: session.url });
    } catch (error) {
        console.error('Stripe checkout error:', error);
        return res.status(500).json({ error: error.message });
    }
}
