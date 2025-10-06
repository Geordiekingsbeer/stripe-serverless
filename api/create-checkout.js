// File: /api/create-checkout.js
// FIX: Charges the exact 'total_pence' value sent from the client based on variable table pricing.

import Stripe from 'stripe'; 

// NOTE: BASE_PRICE_IN_PENCE is removed. The client calculates the total.

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

    // 4. Get ALL data sent from the customer's browser, including the new customer name/party size
    const { 
        table_ids, email, booking_date, booking_time, total_pence, 
        customer_name, party_size 
    } = req.body; 

    // --- Validation ---
    if (!Array.isArray(table_ids) || table_ids.length === 0) {
        return res.status(400).json({ error: 'No tables selected.' });
    }
    if (!email || !booking_date || !booking_time) {
        return res.status(400).json({ error: 'Missing required booking details.' });
    }
    // New validation for customer details
    if (!customer_name || !party_size) {
        return res.status(400).json({ error: 'Missing customer name or party size.' });
    }
    if (typeof total_pence !== 'number' || total_pence <= 0) {
        return res.status(400).json({ error: 'Invalid or zero total price received.' });
    }
    
    const tableCount = table_ids.length;
    const totalDollars = (total_pence / 100).toFixed(2);

    try {
        // 5. Create the Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            
            line_items: [
                {
                    price_data: {
                        currency: 'gbp',
                        product_data: {
                            // Updated description to show name and party size
                            name: 'Premium Table Slot Booking',
                            description: `Reservation for ${customer_name} (Party of ${party_size}) on ${booking_date} at ${booking_time}. Total: £${totalDollars}.`,
                        },
                        // CRITICAL: Use the total pence calculated by the client as the unit_amount
                        unit_amount: total_pence, 
                    },
                    // We charge the unit_amount (the total) only once
                    quantity: 1, 
                },
            ],
            
            mode: 'payment',
            
            // 6. CRITICAL: Pass ALL booking data via metadata for the webhook
            metadata: {
                table_ids_list: table_ids.join(','), 
                customer_email: email,
                booking_date: booking_date,
                booking_time: booking_time,
                customer_name: customer_name, // NEW
                party_size: party_size.toString() // NEW (must be string for metadata)
            },

            success_url: `https://stripe-serverless-phi.vercel.app/success-page.html`,

            cancel_url: `${req.headers.origin}/cancel`,
        });

        // 7. Send the Stripe Checkout URL back to the customer's browser
        res.json({ url: session.url });

    } catch (error) {
        console.error('Stripe Session Creation Error:', error);
        res.status(500).json({ error: 'Failed to create Stripe Checkout session.' });
    }
}
