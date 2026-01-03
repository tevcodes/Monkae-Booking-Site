# Monkae | Multi-Tenant SaaS Booking Platform

Monkae is a production-grade, serverless booking platform designed for the beauty and service industry. It creates a seamless link between client-side bookings and admin-side management using real-time data synchronization.

Unlike standard CRUD apps, Monkae handles complex logic like automated PDF financial reporting, email notifications via Twilio, and multi-tenant data isolation.

![Status](https://img.shields.io/badge/Status-Production_Ready-success)
![Type](https://img.shields.io/badge/Type-SaaS_Platform-blue)
![Stack](https://img.shields.io/badge/Stack-Vite_%7C_Firebase_%7C_Google_Cloud-orange)

## 🚀 Key Features

### ⚡ Real-Time Architecture
* **Live Admin Dashboard:** Utilizes Firestore Snapshot Listeners to instantly reflect new bookings without page refreshes.
* **Concurrency Handling:** Prevents double-bookings in real-time by locking slots during the checkout process.

### 🛠 Backend Automation (Serverless)
* **Automated Reporting:** Google Cloud Functions generate month-to-month PDF financial reports and email them to store owners automatically.
* **Smart Notifications:** Integrated with Twilio to send Email reminders and confirmations to clients.
* **Cron Jobs:** Scheduled functions handle cleanup tasks and daily summary aggregation.

### 🎨 UI/UX & Security
* **"Elite" Dark Mode:** A custom-engineered theme toggle that persists user preference.
* **Role-Based Access Control (RBAC):** Distinct flows for **Admins** (Dashboard) vs. **Clients** (Booking Wizard).
* **Secure PIN Authentication:** Custom auth layer for quick staff access.

## 🛠️ Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | VanillaJS (via Vite) |
| **Backend** | Firebase (Firestore, Auth, Hosting) |
| **Serverless** | Google Cloud Functions (Node.js environment) |
| **Integrations** | Twilio (Notifications), PDFKit (Reporting) |

## 🔧 Installation & Setup

This project uses Vite and Firebase Emulators.

Prerequisites
Node.js (LTS)
Firebase CLI (npm install -g firebase-tools)

1. Clone the repository


git clone https://github.com/YOUR_USERNAME/Monkae-Booking-Site.git
cd monkae
2. Install dependencies

npm install
3. Configure Environment Variables
Create a .env file in the root directory. You will need API keys for Firebase and Twilio.



VUE_APP_FIREBASE_API_KEY=your_key_here
VUE_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VUE_APP_FIREBASE_PROJECT_ID=your_project_id
...
4. Run Locally


npm run serve

### 1. Clone the repository
```bash
git clone [https://github.com/tevcodes/monkae.git](https://github.com/tevcodes/monkae.git)
cd monkae