import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { table_id, email } = req.body;

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

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
