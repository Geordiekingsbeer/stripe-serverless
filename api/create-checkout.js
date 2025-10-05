// File: /api/create-checkout.js

// NOTE: This file assumes you have 'stripe' installed (npm install stripe)
// and that STRIPE_SECRET_KEY is set as an environment variable in Vercel.

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Base price per single table slot (in the lowest currency unit: pence)
const BASE_PRICE_IN_PENCE = 499; // £4.99

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 1. Get ALL data sent from the customer's browser
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
        // 2. Create the Stripe Checkout Session
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
            
            // 3. CRITICAL: Pass ALL necessary booking data via metadata. 
            metadata: {
                // We pass the table IDs, date, and time for the Webhook (next file) to use later.
                table_ids_list: table_ids.join(','), 
                customer_email: email,
                booking_date: booking_date,
                booking_time: booking_time
            },

            success_url: `${req.headers.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.origin}/cancel`,
        });

        // 4. Send the Stripe Checkout URL back to the customer's browser
        res.json({ url: session.url });

    } catch (error) {
        console.error('Stripe Session Creation Error:', error);
        res.status(500).json({ error: 'Failed to create Stripe Checkout session.' });
    }
};
