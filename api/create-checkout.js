import Stripe from 'stripe';

// Initialize Stripe once, using the secret key set in Vercel dashboard.
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  // ----------  C O R S  ----------
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  // --------------------------------

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const {
      tableId,
      date,
      startTime,
      endTime,
      notes,
      tenantId
    } = req.body;

    // Basic guard-rails
    if (!tableId || !date || !startTime || !endTime || !tenantId) {
      console.warn('Admin booking rejected: missing required fields');
      return res.status(400).json({ error: 'Missing required booking data.' });
    }

    // Create the booking row in Supabase via the service-role key
    const { data, error } = await supabaseAdmin
      .from('premium_slots')
      .insert([{
        table_id: Number(tableId),
        date,
        start_time: startTime,
        end_time: endTime,
        host_notes: notes || '',
        tenant_id: tenantId
      }])
      .select()
      .single();

    if (error) {
      console.error('Supabase insert failed:', error);
      return res.status(500).json({ error: 'Database insert failed.' });
    }

    return res.status(200).json({ message: 'Booking created.', booking: data });
  } catch (err) {
    console.error('Admin booking error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
}
