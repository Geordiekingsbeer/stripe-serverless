// File: /api/create-checkout.js
// FIX: Using modern ES Module imports and export default

import Stripe from 'stripe'; 

// Base price per single table slot (in the lowest currency unit: pence)
const BASE_PRICE_IN_PENCE = 499; // £4.99

// Initialize Stripe client
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

export default async function (req, res) {
    // 1. --- HANDLE CORS PREFLIGHT (OPTIONS request) ---
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(200).end();
    }
    
    // 2. --- SET CORS HEADER FOR MAIN RESPONSE ---
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // 3. --- METHOD CHECK ---
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 4. Get ALL data sent from the customer's browser
    const { table_ids, email, booking_date, booking_time } = req.body; 

    // --- Validation ---
    if (!Array.isArray(table_ids) || table_ids.length === 0) {
        return res.status(400).json({ error: 'No tables selected.' });
    }
    if (!email || !booking_date || !booking_time) {
        return res.status(400).json({ error: 'Missing required booking details (email, date, or time).' });
    }
    
    const tableCount = table_ids.length;

    try {
        // 5. Create the Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            
            line_items: [
                {
                    price_data: {
                        currency: 'gbp',
                        product_data: {
                            name: 'Premium Table Slot Booking',
                            description: `Reservation for ${tableCount} table(s) on ${booking_date} at ${booking_time}.`,
                        },
                        unit_amount: BASE_PRICE_IN_PENCE, 
                    },
                    quantity: tableCount, 
                },
            ],
            
            mode: 'payment',
            
            // 6. CRITICAL: Pass ALL necessary booking data via metadata. 
            metadata: {
                table_ids_list: table_ids.join(','), 
                customer_email: email,
                booking_date: booking_date,
                booking_time: booking_time
            },

            success_url: `${req.headers.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.origin}/cancel`,
        });

        // 7. Send the Stripe Checkout URL back to the customer's browser
        res.json({ url: session.url });

    } catch (error) {
        console.error('Stripe Session Creation Error:', error);
        res.status(500).json({ error: 'Failed to create Stripe Checkout session.' });
    }
}
