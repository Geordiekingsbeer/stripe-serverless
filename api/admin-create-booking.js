// /api/admin-create-booking.mjs
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const body = await req.json ? await req.json() : req.body;

    const hasSingle = body.table_id !== undefined && body.table_id !== null;
    const hasBulk = Array.isArray(body.table_ids) && body.table_ids.length > 0;
    if (!hasSingle && !hasBulk) {
      return res.status(400).json({ success: false, error: "No table_id or table_ids provided." });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const EMAIL_FROM = process.env.EMAIL_FROM || "Bookings <bookings@yourdomain.com>";
    const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || "";
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ success: false, error: "Server missing Supabase env vars." });
    }

    // Build rows
    const buildRow = (tableId) => ({
      tenant_id: body.tenant_id || DEFAULT_TENANT_ID,
      table_id: Number(tableId),
      date: body.date,
      start_time: body.start_time ? (body.start_time.length === 5 ? body.start_time + ":00" : body.start_time) : null,
      end_time: body.end_time ? (body.end_time.length === 5 ? body.end_time + ":00" : body.end_time) : null,
      host_notes: body.notes || body.host_notes || "Admin Manual Booking",
    });

    let rows = [];
    if (hasSingle) rows.push(buildRow(body.table_id));
    if (hasBulk) rows = body.table_ids.map(buildRow);

    // Insert into Supabase REST endpoint
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/premium_slots`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Prefer: "return=representation",
      },
      body: JSON.stringify(rows),
    });

    const insertJson = await insertRes.json();
    if (!insertRes.ok) {
      console.error("Supabase insert error:", insertJson);
      throw new Error("Supabase insert failed: " + (insertJson?.message || JSON.stringify(insertJson)));
    }

    // Decide who to email
    const recipient = body.staff_email || ADMIN_EMAIL;
    if (!recipient) {
      return res.status(200).json({
        success: true,
        booking: insertJson,
        emailSent: false,
        message: "No staff email provided or ADMIN_EMAIL set.",
      });
    }

    // Build email HTML
    const subject =
      rows.length > 1
        ? `Premium Booking Confirmed — ${rows.length} tables`
        : `Premium Booking Confirmed — Table ${insertJson[0]?.table_id}`;

    let html = `<h2>Premium Booking Confirmed</h2><p>The following premium booking(s) were created:</p><ul>`;
    insertJson.forEach((r) => {
      const start = r.start_time ? r.start_time.substring(0, 5) : "";
      const end = r.end_time ? r.end_time.substring(0, 5) : "";
      html += `<li><strong>Table ${r.table_id}</strong> — ${r.date} ${start}–${end}</li>`;
    });
    html += `</ul><p><strong>Notes:</strong> ${rows.map((r) => r.host_notes).join(" ; ")}</p>`;

    if (!RESEND_API_KEY) {
      return res.status(200).json({
        success: true,
        booking: insertJson,
        emailSent: false,
        message: "RESEND_API_KEY not configured.",
      });
    }

    // Send email via Resend
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [recipient],
        subject,
        html,
      }),
    });

    const emailJson = await emailRes.json();
    if (!emailRes.ok) {
      console.error("Resend email error:", emailJson);
      return res.status(207).json({
        success: true,
        booking: insertJson,
        emailSent: false,
        emailError: emailJson,
      });
    }

    return res.status(200).json({
      success: true,
      booking: insertJson,
      emailSent: true,
      emailResponse: emailJson,
    });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ success: false, error: err.message || String(err) });
  }
}
