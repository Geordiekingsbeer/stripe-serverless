// api/send-staff-email.js (or .ts)

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 1. Get the booking data from the Supabase trigger payload
    const { tenant_id, table_id, date, start_time, end_time, notes } = req.body;

    // Optional: Add a simple security check if needed (e.g., a secret header)
    // if (req.headers['x-supabase-secret'] !== process.env.SUPABASE_TRIGGER_SECRET) {
    //     return res.status(403).json({ error: 'Forbidden' });
    // }

    // 2. Fetch the restaurant's email (where the notification should go)
    //    You might need to query Supabase again here if you don't store it in Vercel.
    //    For this example, we'll use a hardcoded email, but you should fetch it based on tenant_id.
    const staffEmail = 'staff@yourrestaurant.com'; // **CRITICAL: Replace with logic to get the correct staff email**

    try {
        // 3. Construct the email content
        const subject = `NEW PREMIUM BOOKING: Table ${table_id} on ${date}`;
        const body = `
            A new premium table has been booked.

            Restaurant ID: ${tenant_id}
            Table(s) ID: ${table_id}
            Date: ${date}
            Time: ${start_time} - ${end_time}
            Customer/Admin Notes: ${notes || 'N/A'}

            Please check the Admin Panel for details.
        `;

        // 4. Send the email using your chosen provider (e.g., Nodemailer, SendGrid, Resend)
        //    (This is pseudo-code for the email sending process)
        await sendEmail({
            to: staffEmail,
            from: 'system@yourdomain.com',
            subject: subject,
            text: body,
        });

        console.log(`Notification email sent for tenant ${tenant_id}, Table ${table_id}`);
        return res.status(200).json({ message: 'Email queued successfully.' });
    } catch (error) {
        console.error('Failed to send staff email:', error);
        // It's important to return a success status (2xx) to the Supabase trigger function
        // so it doesn't try to re-run the trigger (unless you want that behavior).
        return res.status(200).json({ error: 'Email sending failed, but logged.' });
    }
}
