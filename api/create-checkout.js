import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });

// This is your function that Vercel runs whenever someone calls this URL
export default async function handler(req, res) {
  // --------------------------
  // 1. CORS: allow requests from your GitHub Pages site
  // --------------------------
  res.setHeader('Access-Control-Allow-Origin', 'https://geordiekingsbeer.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests (sent automatically by the browser)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { table_id, email } = req.body;

    // Create a Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      success_url: 'https://geordiekingsbeer.github.io/table-picker/success.html',
      cancel_url: 'https://geordiekingsbeer.github.io/table-picker/cancel.html',
      line_items: [
        { price: 'price_1SDhLmITnh5jyqHABU67zgeW', quantity: 1 }
      ],
      metadata: { table_id, email },
    });

    // Send the Stripe URL back to the browser
    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
