import Stripe from 'stripe';

// Initialize Stripe. Uses STRIPE_SECRET_KEY environment variable.
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// NOTE: All CORS headers and OPTIONS handling are now managed externally by vercel.json.

export default async function (req, res) {
    // Vercel's vercel.json handles the OPTIONS preflight request (returns 204).
    
    // We only need to check for POST now, as Vercel handles OPTIONS/GET in vercel.json
    if (req.method !== 'POST') {
        // Vercel handles the 405 Method Not Allowed response with the required CORS headers.
        return res.status(405).send('Method not allowed. Use POST.');
    }

    // Since Vercel automatically parses the request body, we can proceed.
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
            // Vercel's vercel.json ensures CORS headers are attached to this 400 response.
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
            
            success_url: `https://stripe-serverless-phi.vercel.app/success-page.html?tenant_id=${tenant_id}&booking_ref=${booking_ref}&session_id={CHECKOUT_SESSION_ID}`,
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

        // Vercel's vercel.json ensures CORS headers are attached to this 200 response.
        return res.status(200).json({ sessionId: session.id, url: session.url });
    } catch (error) {
        console.error('Stripe checkout error:', error);
        // Vercel's vercel.json ensures CORS headers are attached to this 500 response.
        return res.status(500).json({ error: error.message });
    }
}
