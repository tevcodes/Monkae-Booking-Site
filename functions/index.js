// functions/index.js (FINAL, PERMANENT V2 CODE)

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const logger = require('firebase-functions/logger');
const nodemailer = require('nodemailer'); 
const admin = require('firebase-admin'); 
const PDFDocument = require('pdfkit'); 
const streamToBuffer = require('stream-to-buffer');
const { onSchedule } = require('firebase-functions/v2/scheduler');

admin.initializeApp();

// 1. GLOBAL CONFIGURATION
setGlobalOptions({
    region: 'us-central1',
});

// --- 2. GLOBAL TRANSPORTER DECLARATION ---
let mailTransporter = null; 

// Helper function that ensures the transporter is created only once (Lazy Initialization)
function getMailTransporter() {
    if (!mailTransporter) {
        // This is the CRITICAL CHECK: ensure secrets are loaded before creation
        if (!process.env.SENDGRID_HOST || !process.env.SENDGRID_PASS) {
            throw new Error("SMTP configuration is missing. Secrets not loaded.");
        }
        
        // Create the transporter using process.env secrets
        mailTransporter = nodemailer.createTransport({
            host: process.env.SENDGRID_HOST, 
            port: parseInt(process.env.SENDGRID_PORT),
            secure: process.env.SENDGRID_PORT === '465',
            auth: {
                user: process.env.SENDGRID_USER, 
                pass: process.env.SENDGRID_PASS,
            },
        });
    }
    return mailTransporter;
}


// FUNCTION 1: Automated Booking Confirmation & Admin Notification
exports.sendBookingConfirmationEmail = onDocumentCreated('salons/{salonId}/bookings/{bookingId}', async (event) => {
    
    // 1. Setup Data
    const bookingData = event.data.data();
    const salonId = event.params.salonId;
    
    if (!bookingData || !bookingData.email) {
        logger.warn("Booking missing email field. Skipping.");
        return null;
    }

    const formattedTime = new Date(bookingData.time).toLocaleString('en-US', { 
        dateStyle: 'full', timeStyle: 'short' 
    });

    const transporter = getMailTransporter();

    try {
        // 2. Fetch Salon Owner Details (for the recipient email)
        const salonSnap = await admin.firestore().collection('salons').doc(salonId).get();
        const salonData = salonSnap.data();
        
        // Fallback to company email if specific owner email isn't found
        const ownerEmail = salonData?.ownerEmail || "info@monkae.co.za"; 
        const salonName = salonData?.name || "Monkae Salon";

        // --- SHARED CSS (The Tesla Look) ---
        const emailStyle = `
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Poppins:wght@300;400;600&display=swap');
            body { margin: 0; padding: 0; background-color: #141414; font-family: 'Poppins', sans-serif; color: #ffffff; }
            .container { max-width: 600px; margin: 0 auto; background-color: #1e1e1e; border: 1px solid #333; border-radius: 8px; overflow: hidden; }
            .header { background-color: #000000; padding: 30px 20px; text-align: center; border-bottom: 2px solid #828282; }
            .header h1 { margin: 0; font-family: 'Orbitron', sans-serif; color: #ffffff; font-size: 24px; letter-spacing: 2px; text-transform: uppercase; }
            .header span { color: #828282; } 
            .content { padding: 40px 30px; }
            .greeting { font-size: 18px; margin-bottom: 20px; color: #cccccc; }
            .card { background-color: #252525; padding: 20px; border-radius: 6px; border-left: 4px solid #828282; margin: 20px 0; }
            .detail-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
            .detail-label { color: #888; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
            .detail-value { font-family: 'Orbitron', sans-serif; font-size: 16px; color: #fff; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #555; border-top: 1px solid #333; }
          </style>
        `;

        // 3. PREPARE CUSTOMER EMAIL
        const customerMail = {
            from: 'Monkae Bookings <info@monkae.co.za>',
            to: bookingData.email,
            subject: `✅ Booking Confirmed: ${bookingData.service}`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>${emailStyle}</head>
                <body>
                  <div class="container">
                    <div class="header">
                      <h1>${salonName} <span>Confirmed</span></h1>
                    </div>
                    <div class="content">
                      <p class="greeting">Hello <strong>${bookingData.name}</strong>,</p>
                      <p>Your appointment has been successfully confirmed. We look forward to seeing you.</p>
                      
                      <div class="card">
                        <div class="detail-row">
                          <span class="detail-label">Service</span>
                        </div>
                        <div class="detail-value" style="margin-bottom: 15px;">${bookingData.service}</div>
                        
                        <div class="detail-row">
                          <span class="detail-label">Staff</span>
                        </div>
                        <div class="detail-value" style="margin-bottom: 15px;">${bookingData.staffMember || 'Any Staff'}</div>

                        <div class="detail-row">
                          <span class="detail-label">Date & Time</span>
                        </div>
                        <div class="detail-value">${formattedTime}</div>
                      </div>

                      <p style="font-size: 14px; color: #888; margin-top: 30px;">Please arrive 5 minutes early.</p>
                    </div>
                    <div class="footer">
                      &copy; ${new Date().getFullYear()} Monkae Bookings.
                    </div>
                  </div>
                </body>
                </html>
            `,
        };

        const emailsToSend = [transporter.sendMail(customerMail)];

        // 4. PREPARE ADMIN EMAIL (Only if NOT manual)
        if (!bookingData.isManual) {
            const adminMail = {
                from: 'Monkae System <info@monkae.co.za>',
                to: ownerEmail, // 👈 Sends to Mida (fetched from DB)
                subject: `🔔 New Booking: ${bookingData.name} (${bookingData.service})`,
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>${emailStyle}</head>
                    <body>
                      <div class="container">
                        <div class="header">
                          <h1>New <span>Booking</span></h1>
                        </div>
                        <div class="content">
                          <p class="greeting">You have received a new online booking!</p>
                          
                          <div class="card">
                            <div class="detail-row"><span class="detail-label">Client</span></div>
                            <div class="detail-value" style="margin-bottom: 10px;">${bookingData.name}</div>

                            <div class="detail-row"><span class="detail-label">Phone</span></div>
                            <div class="detail-value" style="margin-bottom: 10px;">${bookingData.phone || 'N/A'}</div>

                            <div class="detail-row"><span class="detail-label">Service</span></div>
                            <div class="detail-value" style="margin-bottom: 10px;">${bookingData.service}</div>

                            <div class="detail-row"><span class="detail-label">Time</span></div>
                            <div class="detail-value">${formattedTime}</div>
                          </div>
                        </div>
                        <div class="footer">Check dashboard for details.</div>
                      </div>
                    </body>
                    </html>
                `,
            };
            emailsToSend.push(transporter.sendMail(adminMail));
        }

        // 5. SEND ALL
        await Promise.all(emailsToSend);
        logger.info(`Emails sent. Customer: Yes. Owner: ${!bookingData.isManual ? ownerEmail : 'Skipped (Manual)'}`);

    } catch (error) {
        logger.error('Email sending failed.', error);
    }
});

// FUNCTION 2 Generate Monthly Report PDF
exports.generateMonthlyReport = onCall(async (request) => {

    // 1. Security & Validation
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'You must be logged in.');
    }

    const { month, year, recipientEmail, salonId } = request.data;

    if (!month || !year || !salonId) {
        throw new HttpsError('invalid-argument', 'Month, Year, and Salon ID are required.');
    }

    try {
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);
        const monthName = startDate.toLocaleString('default', { month: 'long' });

        // ✅ 1. FETCH SALON DATA (To get the Logo & Name)
        const salonDoc = await admin.firestore().collection('salons').doc(salonId).get();
        const salonData = salonDoc.data();
        const salonLogo = salonData.logoUrl || ""; // Get URL or empty string
        const salonName = salonData.name || "Monkae Salon";

        // 2. Fetch Bookings
        const snapshot = await admin.firestore()
            .collection('salons').doc(salonId).collection('bookings')
            .where('time', '>=', startDate.toISOString())
            .where('time', '<=', endDate.toISOString())
            .get();

        // 3. Calculate Stats
        let totalBookings = 0;
        let completedCount = 0;
        let cancelledCount = 0;
        let totalRevenue = 0;
        const bookings = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            totalBookings++;
            if (data.status === 'Completed') {
                completedCount++;
                totalRevenue += (parseInt(data.price) || 0); 
            } else if (data.status === 'Cancelled') {
                cancelledCount++;
            }
            bookings.push(data);
        });

        // ✅ 2. UPDATE HTML TEMPLATE (Add the Logo Image)
        const reportHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600&display=swap');
            body { font-family: 'Poppins', sans-serif; background-color: #f4f4f4; padding: 20px; color: #333; }
            .container { max-width: 700px; margin: 0 auto; background: #fff; padding: 40px; border-radius: 8px; }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 30px; }
            
            /* Logo Styling */
            .logo-img { max-height: 80px; margin-bottom: 15px; display: block; margin-left: auto; margin-right: auto; }
            
            .header h1 { font-size: 24px; text-transform: uppercase; margin: 0; color: #000; }
            .meta { color: #666; font-size: 14px; margin-top: 5px; }
            
            /* Stats Grid */
            .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 30px; }
            .stat-card { background: #f9f9f9; padding: 15px; border-radius: 6px; text-align: center; border: 1px solid #eee; }
            .stat-card h3 { font-size: 11px; text-transform: uppercase; color: #888; margin: 0 0 5px 0; }
            .stat-card p { font-size: 20px; font-weight: 600; color: #000; margin: 0; }
            .revenue { color: #2e7d32; }
            
            table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 20px; }
            th { text-align: left; background: #111; color: #fff; padding: 10px; }
            td { padding: 10px; border-bottom: 1px solid #eee; }
            .footer { text-align: center; margin-top: 40px; font-size: 11px; color: #aaa; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              
              ${salonLogo ? `<img src="${salonLogo}" class="logo-img" alt="Logo">` : ''}

              <h1>Monthly Report</h1>
              <div class="meta">${monthName} ${year} • ${salonName}</div>
            </div>

            <div class="stats-grid">
              <div class="stat-card"><h3>Bookings</h3><p>${totalBookings}</p></div>
              <div class="stat-card"><h3>Revenue</h3><p class="revenue">R ${totalRevenue}</p></div>
              <div class="stat-card"><h3>Cancelled</h3><p style="color:red">${cancelledCount}</p></div>
            </div>

            <h3>Detailed Log</h3>
            <table>
              <thead>
                <tr><th>Date</th><th>Client</th><th>Service</th><th>Status</th></tr>
              </thead>
              <tbody>
                ${bookings.map(b => `
                  <tr>
                    <td>${new Date(b.time).toLocaleDateString()}</td>
                    <td>${b.name}</td>
                    <td>${b.service}</td>
                    <td>${b.status}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="footer">Generated by Monkae SaaS</div>
          </div>
        </body>
        </html>
        `;

        // 4. Send Email
        const transporter = getMailTransporter();
        await transporter.sendMail({
            from: 'Monkae Reporting <info@monkae.co.za>',
            to: recipientEmail,
            subject: `📊 Report: ${monthName} ${year} - ${salonName}`,
            html: reportHtml
        });

        // 5. Update Metadata
        await admin.firestore()
            .collection('salons').doc(salonId).collection('config').doc('reports')
            .set({ lastRunDate: new Date().toISOString() }, { merge: true });

        return { success: true };

    } catch (error) {
        logger.error("Report Error", error);
        throw new HttpsError('internal', error.message);
    }
});

// FUNCTION 3: Scheduled Appointment Reminder

exports.sendAppointmentReminders = onSchedule("every 60 minutes", async (event) => {
  const db = admin.firestore();

  const now = new Date();
  const startWindow = new Date(now.getTime() + (24 * 60 * 60 * 1000));
  const endWindow = new Date(now.getTime() + (25 * 60 * 60 * 1000));

  try {
    const snapshot = await db.collection('bookings')
          .where('status', '==', 'Confirmed')
          .where('reminderSent', '!=', true) // Only send if not sent yet
          .where('time', '>=', startWindow.toISOString())
          .where('time', '<=', endWindow.toISOString())
          .get();

          if (snapshot.empty) {
            logger.info("No reminders to send this hour.");
            return;
          }

          const transporter = getMailTransporter();

          const emailPromises = snapshot.docs.map(async (doc) => {
            const booking = doc.data();

            const formattedTime = new Date(booking.time).toLocaleString('en-US', {
                weekday: 'long', month: 'short', day: 'numeric',
                hour: 'numeric', minute: 'numeric', hour12: true
            });
           
            const mailOptions = {
                from: 'Monkae Reminders <info@monkae.co.za>',
                to: booking.email,
                subject: `Reminder: Your Appointment Tomorrow at ${formattedTime}`,
                html: `
                    <div style="font-family: sans-serif; color: #333;">
                        <h2>Appointment Reminder</h2>
                        <p>Hi <strong>${booking.name}</strong>,</p>
                        <p>This is a friendly reminder about your appointment with <strong>${booking.staffMember || 'us'}</strong> tomorrow.</p>
                        <p><strong>Service:</strong> ${booking.service}<br>
                        <strong>Time:</strong> ${formattedTime}</p>
                        <p>We look forward to seeing you!</p>
                        <hr>
                        <p style="font-size: 0.8em; color: #777;">If you need to reschedule, please contact us immediately.</p>
                    </div>
                `
            };
              await transporter.sendMail(mailOptions);

            // 4. Update the document so we don't send it again
            return doc.ref.update({ reminderSent: true });
        });
        await Promise.all(emailPromises);
        logger.info(`Successfully sent ${snapshot.size} reminders.`);

    } catch (error) {
        logger.error("Error sending reminders:", error);
    }
          });
