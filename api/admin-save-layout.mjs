import { createClient } from '@supabase/supabase-js';

// --- CONFIG ---
// Supabase project URL and service role key (server-side)
const supabaseUrl = 'https://Rrjvdabtqzkaomjuiref.supabase.co';
const supabaseServiceRoleKey = 'sb_secret_nbGsaU0asg8w3ANN6DNsfg_-7sxSjtp';

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export default async function handler(req, res) {
  // --- CORS Headers ---
  res.setHeader('Access-Control-Allow-Origin', 'https://geordiekingsbeer.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // --- Handle preflight request ---
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { updates } = req.body;

    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    // Update each table position in Supabase
    const promises = updates.map(async (t) => {
      return supabase
        .from('tables')
        .update({
          x: t.x,
          y: t.y,
          rotation: t.rotation
        })
        .eq('id', t.id)
        .eq('tenant_id', t.tenant_id);
    });

    await Promise.all(promises);

    // Return success + optionally the updated data
    res.status(200).json({ success: true, data: updates });
  } catch (error) {
    console.error('Error saving layout:', error);
    res.status(500).json({ error: error.message });
  }
}
