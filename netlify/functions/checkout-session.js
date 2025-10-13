import Stripe from 'stripe';

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

export default async function (req, res) {
    // --- Define Headers Locally (Final, Aggressive Headers) ---
    // These headers are defined here, but the successful OPTIONS response
    // relies on the dedicated _redirects file for the fastest performance.
    const corsHeaders = {
        'Access-Control-Allow-Origin': 'https://geordiekingsbeer.github.io',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Apply headers to the response object for POST failures/successes
    Object.keys(corsHeaders).forEach(key => {
        res.setHeader(key, corsHeaders[key]);
    });

    // Handle OPTIONS Preflight Request (MUST return 200/204 to proceed)
    if (req.method === 'OPTIONS') {
        // We rely on the raw Node response method for Netlify/Vercel bypass.
        // This is the last line of defense if the _redirects file fails.
        res.writeHead(204, corsHeaders);
        return res.end(); 
    }
    // -------------------------------------------------------------------------

    if (req.method !== 'POST') {
        return res.status(405).send('Method not allowed. Use POST.');
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
            
            // Success URL updated to the new Netlify project URL
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

        // The final 200 response will carry the headers set at the top.
        return res.status(200).json({ sessionId: session.id, url: session.url });
    } catch (error) {
        console.error('Stripe checkout error:', error);
        return res.status(500).json({ error: error.message });
    }
}
