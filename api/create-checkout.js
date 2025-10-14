// File: /api/create-checkout.js

import Stripe from 'stripe';
import Cors from 'cors'; // ADDED: CORS import for external domains
// NOTE: Supabase imports are not strictly necessary here, but good practice if you use them later.

// --- CRITICAL ENVIRONMENT VARIABLES (Must be set in Vercel Dashboard) ---
// Initialize Stripe. Uses STRIPE_SECRET_KEY environment variable.
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// --- CORS Configuration ---
// CRITICAL: This allows requests ONLY from your GitHub Pages URL.
const cors = Cors({
  methods: ['POST', 'OPTIONS'],
  origin: 'https://geordiekingsbeer.github.io', // <--- YOUR FRONTEND DOMAIN
  optionsSuccessStatus: 200, 
});

// Middleware runner helper (needed to use the 'cors' library in Vercel/Next.js API)
function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
}
// ----------------------------


export default async function handler(req, res) {
    // 1. Run CORS middleware
    await runMiddleware(req, res, cors); 

    // Handle the preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).send('Method not allowed.');
    }

    try {
        // NOTE: Destructuring variable names match client-side request
        const { 
            table_ids, 
            booking_date, 
            booking_time, 
            email, // Changed from customer_email to match client-side var
            customer_name, 
            party_size, 
            total_pence, 
            tenant_id, 
            booking_ref
        } = req.body;

        // Basic input validation 
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
            
            // CRITICAL FIX: Ensure Success/Cancel URLs point to your GitHub Pages domain
            success_url: `https://geordiekingsbeer.github.io/table-picker/success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `https://geordiekingsbeer.github.io/table-picker/pick-seat.html`,
            
            // Pass ALL necessary data for the webhook and database insert
            metadata: {
                // Stripe requires metadata values to be strings
                table_ids_list: JSON.stringify(table_ids), // Use JSON.stringify for array
                booking_date: String(booking_date),
                booking_time: String(booking_time),
                customer_email: String(email),
                customer_name: String(customer_name),
                party_size: String(party_size),
                tenant_id: String(tenant_id),      
                booking_ref: String(booking_ref),    
            },
            customer_email: email, // Set primary Stripe email
        });

        return res.status(200).json({ sessionId: session.id, url: session.url });
    } catch (error) {
        console.error('Stripe checkout error:', error);
        return res.status(500).json({ error: error.message });
    }
}
