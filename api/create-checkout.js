import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  /* ----------  C O R S  ---------- */
  res.setHeader('Access-Control-Allow-Origin', 'https://geordiekingsbeer.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  /* ------------------------------- */

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
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
      console.warn('Missing critical metadata');
      return res.status(400).json({ error: 'Missing critical booking metadata.' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: 'Premium Table Slot Booking',
              description: `Reservation for ${customer_name} (Party of ${party_size}) on ${booking_date} at ${booking_time}. Total tables: ${table_ids.length}.`
            },
            unit_amount: total_pence
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      success_url: `https://dine-checkout-live.vercel.app/success-page.html?tenant_id=${tenant_id}&booking_ref=${booking_ref}`,
      cancel_url: 'https://geordiekingsbeer.github.io/table-picker/pick-seat.html',
      metadata: {
        table_ids_list: table_ids.join(','),
        booking_date,
        booking_time,
        customer_email,
        customer_name,
        party_size,
        tenant_id,
        booking_ref
      },
      customer_email
    });

    return res.status(200).json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: err.message });
  }
}
```
