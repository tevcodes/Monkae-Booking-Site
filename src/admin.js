import './style.css';

import { db, auth, functions } from "./firebase.js";
import { 
    collection, onSnapshot, query, orderBy, doc, updateDoc, 
    serverTimestamp, where, addDoc, getDocs, getDoc 
} from "firebase/firestore";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth"; 
import { httpsCallable } from "firebase/functions";

// Fallback data
import { services, shopConfig, staffMembers } from "./services.js"; 
import alertSound from "./assets/synthetic-ping-sound.mp3";
import { getSalonId } from "./utils.js"; 

// --- GLOBAL VARIABLES ---
const salonId = getSalonId(); 
console.log("Admin Dashboard loading for Salon:", salonId);

let currentServicesList = services; 
let currentStaffList = staffMembers;
let currentShopConfig = shopConfig; 

const ADMIN_EMAIL = "info@monkae.co.za";
const CLEANUP_BUFFER_MINUTES = 15; 
const BOOKING_ALERT_SOUND = alertSound;

// State Flags
let currentPin = "";
let currentView = 'today'; 
let isInitialLoad = true;
let editingBookingId = null; // 👈 NEW: Tracks if we are editing

// --- DOM ELEMENTS ---
const list = document.getElementById("bookings-list");
const pinContainer = document.getElementById("pin-container");
const dashboardContainer = document.getElementById("dashboard-container");
const errorMsg = document.getElementById("auth-error-message");
const logoutBtn = document.getElementById("logout-btn");
const keypad = document.getElementById("keypad");
const viewFutureBtn = document.getElementById("view-future-btn");
const viewTodayBtn = document.getElementById("view-today-btn");
const currentViewTitle = document.getElementById("current-view-title");

// Modal Elements
const manualBookingModal = document.getElementById("manual-booking-modal");
const manualBookingForm = document.getElementById("manual-booking-form"); 
const addManualBookingBtn = document.getElementById("add-manual-booking-btn");
const closeManualModalBtn = document.getElementById("close-manual-modal");
const modalTitle = document.getElementById("modal-title");
const modalSubmitBtn = document.getElementById("modal-submit-btn");

// Confirm Modal Elements
const confirmModal = document.getElementById("confirm-modal");
const confirmMsg = document.getElementById("confirm-message");
const confirmYes = document.getElementById("confirm-yes-btn");
const confirmNo = document.getElementById("confirm-no-btn");

// Report Elements
const reportForm = document.getElementById("report-form");
const reportBtn = document.getElementById("generate-report-btn");
const reportStatus = document.getElementById("report-status");

// --- 1. DATA LOADER ---
async function loadAdminData() {
    try {
        const docRef = doc(db, "salons", salonId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.logoUrl) {
                document.querySelectorAll(".salon-logo-target").forEach(img => img.src = data.logoUrl);
            }
            return {
                services: data.services || services, 
                staff: data.staff || staffMembers, 
                config: data.shopConfig || shopConfig,
                adminPin: data.adminPin 
            };
        }
    } catch (error) {
        console.error("Failed to load admin data:", error);
    }
    return null; 
}

// --- CUSTOM ALERTS & CONFIRMS ---
function showEliteAlert(message) {
    const modal = document.getElementById('custom-alert-modal');
    const msg = document.getElementById('custom-alert-message');
    const btn = document.getElementById('custom-alert-ok');
    
    if (modal) {
        msg.textContent = message;
        modal.style.display = 'flex'; // Use flex to center
        btn.onclick = () => { modal.style.display = 'none'; };
    } else {
        alert(message);
    }
}


function showEliteConfirm(message, onConfirm) {
    if (confirmModal) {
        confirmMsg.textContent = message;
        confirmModal.style.display = 'flex';
        
        // Remove old listeners to prevent stacking
        const newYes = confirmYes.cloneNode(true);
        const newNo = confirmNo.cloneNode(true);
        confirmYes.parentNode.replaceChild(newYes, confirmYes);
        confirmNo.parentNode.replaceChild(newNo, confirmNo);

        newYes.addEventListener('click', () => {
            confirmModal.style.display = 'none';
            onConfirm(); // Run the action
        });

        newNo.addEventListener('click', () => {
            confirmModal.style.display = 'none';
        });
    } else {
        // Fallback if HTML missing
        if (confirm(message)) onConfirm();
    }
}

// --- LOGIN LOGIC ---
function updatePinDisplay() {
    const pinDots = document.querySelectorAll('.pin-dot');
    if(errorMsg) errorMsg.style.display = 'none';
    pinDots.forEach((dot, index) => {
        if (index < currentPin.length) dot.classList.add('filled');
        else dot.classList.remove('filled');
    });
}

function showAuthError(message) {
    currentPin = "";
    updatePinDisplay();
    showEliteAlert(message);
}

async function attemptLogin(inputPin) {
    try {
        const salonRef = doc(db, "salons", salonId);
        const salonSnap = await getDoc(salonRef);

        if (!salonSnap.exists()) {
            showEliteAlert("Error: Salon not found.");
            return;
        }

        const realPin = salonSnap.data().adminPin; 

        if (inputPin === realPin) {
             try {
                const unlockAudio = new Audio(BOOKING_ALERT_SOUND);
                unlockAudio.volume = 0;
                await unlockAudio.play();
             } catch (e) {}

             await signInWithEmailAndPassword(auth, ADMIN_EMAIL, "Monkae25"); 
             currentPin = ""; 
             updatePinDisplay();
        } else {
             showAuthError("Incorrect PIN.");
        }
    } catch (error) {
        console.error("Login Error:", error);
        showAuthError("Login failed.");
    }
}

// Keypad Listener
if (keypad) {
    keypad.addEventListener('click', (e) => {
        const key = e.target.dataset.key;
        if (!key) return;
        if (key === 'back') currentPin = currentPin.slice(0, -1);
        else if (key === 'submit') {
            if (currentPin.length === 4) attemptLogin(currentPin);
            else showAuthError("Enter 4 digits.");
        } else if (currentPin.length < 4 && !isNaN(parseInt(key))) { 
            currentPin += key;
            if (currentPin.length === 4) attemptLogin(currentPin);
        }
        updatePinDisplay();
    });
}

if (logoutBtn) logoutBtn.addEventListener('click', async () => await signOut(auth));


// --- MANUAL BOOKING & EDIT LOGIC ---
function populateServiceSelect(selectedValue = "") {
    const serviceSelect = document.getElementById("manual-service-select");
    serviceSelect.innerHTML = '<option value="" disabled selected>Select Service</option>';
    currentServicesList.forEach(service => {
        const option = document.createElement("option");
        option.value = service.name;
        option.textContent = service.name;
        if (service.name === selectedValue) option.selected = true;
        serviceSelect.appendChild(option);
    });
}

function populateStaffSelect(selectedValue = "") {
    const staffSelect = document.getElementById("manual-staff-select");
    if(!staffSelect) return;
    staffSelect.innerHTML = '';
    currentStaffList.forEach(name => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        if (name === selectedValue) option.selected = true;
        staffSelect.appendChild(option);
    });
}

// ✅ NEW: Open Modal for Editing
function openEditModal(bookingData, id) {
    editingBookingId = id; // Set global flag
    
    // UI Updates
    modalTitle.textContent = "Edit Booking";
    modalSubmitBtn.textContent = "Save Changes";
    manualBookingModal.style.display = 'flex';

    // Populate Form
    manualBookingForm.name.value = bookingData.name;
    manualBookingForm.email.value = bookingData.email;
    manualBookingForm.phone.value = bookingData.phone || "";
    
    // Handle Date/Time Format for Input
    const dateObj = new Date(bookingData.time);
    // Format to "YYYY-MM-DDTHH:MM" for datetime-local input
    const isoString = new Date(dateObj.getTime() - (dateObj.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    manualBookingForm.timeValue.value = isoString;

    populateServiceSelect(bookingData.service);
    populateStaffSelect(bookingData.staffMember);
}

if (addManualBookingBtn) {
    addManualBookingBtn.addEventListener('click', () => {
        editingBookingId = null; // Clear flag
        modalTitle.textContent = "New Booking";
        modalSubmitBtn.textContent = "Confirm Booking";
        manualBookingModal.style.display = 'flex';
        manualBookingForm.reset();
        populateServiceSelect();
        populateStaffSelect();
    });
}

if (closeManualModalBtn) {
    closeManualModalBtn.addEventListener('click', () => {
        manualBookingModal.style.display = 'none';
        manualBookingForm.reset();
        editingBookingId = null;
    });
}

// ✅ UPDATED: Handle Submit (Create OR Update)
if (manualBookingForm) {
    manualBookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = manualBookingForm.name.value;
        const service = manualBookingForm.service.value;
        const timeValue = manualBookingForm.timeValue.value; 
        const email = manualBookingForm.email.value;
        const phone = manualBookingForm.phone.value;
        const staff = manualBookingForm.staff ? manualBookingForm.staff.value : "Any"; 
    
        if (!name || !service || !timeValue || !email || !phone) {
            showEliteAlert("Please fill all fields.");
            return;
        }

        // --- CONFLICT CHECK ---
        const timeToCheck = new Date(timeValue);
        const serviceObject = currentServicesList.find(s => s.name === service);
        if (!serviceObject) { showEliteAlert("Service error."); return; }

        const requiredDuration = serviceObject.duration + CLEANUP_BUFFER_MINUTES;
        const selectedDateISO = timeToCheck.toISOString().split('T')[0];
        const startOfDayISO = selectedDateISO + 'T00:00:00.000Z';
        const nextDay = new Date(timeToCheck); nextDay.setDate(nextDay.getDate() + 1);
        const startOfNextDayISO = nextDay.toISOString().split('T')[0] + 'T00:00:00.000Z';

        const q = query(
            collection(db, "salons", salonId, "bookings"),
            where("time", ">=", startOfDayISO),
            where("time", "<", startOfNextDayISO),
            where('status', 'not-in', ['Cancelled', 'Completed', 'No-Show']) 
        );

        const snapshot = await getDocs(q);
        // ✅ NEW: Exclude the booking we are currently editing from the conflict check
        const existingBookings = snapshot.docs
            .map(doc => ({ ...doc.data(), id: doc.id }))
            .filter(b => b.id !== editingBookingId); 
        
        const slotStartTime = timeToCheck.getTime();
        const slotEndTime = slotStartTime + requiredDuration * 60000;

        const isOverlapping = existingBookings.some(booked => {
            const bookedStartTime = new Date(booked.time).getTime();
            const bookedSvc = currentServicesList.find(s => s.name === booked.service);
            const bookedDuration = bookedSvc ? bookedSvc.duration + CLEANUP_BUFFER_MINUTES : 60; 
            const bookedEndTime = bookedStartTime + bookedDuration * 60000;
            return slotStartTime < bookedEndTime && slotEndTime > bookedStartTime;
        });

        if (isOverlapping) {
            showEliteAlert("CONFLICT: Overlaps with existing booking.");
            return;
        }
    
        try {
            if (editingBookingId) {
                // ✅ UPDATE MODE
                const bookingRef = doc(db, "salons", salonId, "bookings", editingBookingId);
                await updateDoc(bookingRef, {
                    name, email, phone, service, staffMember: staff,
                    time: new Date(timeValue).toISOString()
                });
                showEliteAlert("Booking updated successfully.");
            } else {
                // ✅ CREATE MODE
                await addDoc(collection(db, "salons", salonId, "bookings"), {
                    name, email, phone, service, staffMember: staff,
                    time: new Date(timeValue).toISOString(), 
                    status: 'Confirmed', 
                    createdAt: serverTimestamp(),
                    isManual: true,
                });
                showEliteAlert("Booking added successfully.");
            }
            
            manualBookingModal.style.display = 'none';
            manualBookingForm.reset();
            editingBookingId = null;

        } catch (err) {
            console.error("Error saving booking:", err);
            showEliteAlert("Error saving booking.");
        }
    });
}

// --- REPORTS LOGIC ---
async function checkReportAvailability() {
    if (!reportBtn) return; 
    const today = new Date();
    const currentMonthKey = `${today.getFullYear()}-${today.getMonth() + 1}`;
    try {
        const configRef = doc(db, "salons", salonId, "config", "reports");
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
            const lastRunDate = new Date(configSnap.data().lastRunDate);
            const lastRunKey = `${lastRunDate.getFullYear()}-${lastRunDate.getMonth() + 1}`;
            if (lastRunKey === currentMonthKey) {
                reportBtn.disabled = true;
                reportBtn.textContent = "Report Already Sent";
                return;
            }
        }
        reportBtn.disabled = false;
        reportBtn.textContent = "Email Report";
    } catch (error) { reportBtn.disabled = false; }
}

if (reportForm) {
    reportForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const month = reportForm.month.value;
        const year = reportForm.year.value;
        const recipientEmail = reportForm.recipientEmail.value;

        reportBtn.disabled = true;
        reportBtn.textContent = "Sending...";
        reportStatus.style.display = "block";
        reportStatus.textContent = "Processing...";

        try {
            const generateReport = httpsCallable(functions, 'generateMonthlyReport');
            await generateReport({ month: parseInt(month), year: parseInt(year), recipientEmail, salonId });

            reportBtn.textContent = "Email Report";
            reportBtn.disabled = false;
            reportStatus.textContent = "Success! Check inbox.";
            reportStatus.style.color = "green";
            reportForm.reset();
            setTimeout(() => { reportStatus.style.display = "none"; }, 5000);
            await checkReportAvailability();
        } catch (error) {
            showEliteAlert("Failed: " + error.message);
            reportBtn.disabled = false;
        }
    });
}

// --- DASHBOARD LISTENER ---
function toggleView(view) {
    currentView = view;
    if (currentView === 'today') {
        currentViewTitle.textContent = "Today's Bookings";
        viewTodayBtn.classList.add('active');
        viewFutureBtn.classList.remove('active');
    } else {
        currentViewTitle.textContent = "Future Bookings";
        viewTodayBtn.classList.remove('active');
        viewFutureBtn.classList.add('active');
    }
    isInitialLoad = true; 
    startBookingListener(); 
}

if (viewTodayBtn) viewTodayBtn.addEventListener('click', () => toggleView('today'));
if (viewFutureBtn) viewFutureBtn.addEventListener('click', () => toggleView('future'));

// --- MAIN BOOKING LISTENER ---
function startBookingListener() {
    // Determine Time Range
    const today = new Date();
    today.setHours(0,0,0,0);
    const startOfToday = today.toISOString();
    
    // For "Future", we start from tomorrow
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const startOfTomorrow = tomorrow.toISOString();

    const bookingsRef = collection(db, "salons", salonId, "bookings");

    let q;
    if (currentView === 'today') {
        q = query(bookingsRef, orderBy("time", "asc"), where("time", ">=", startOfToday), where("time", "<", startOfTomorrow));
    } else {
        q = query(bookingsRef, orderBy("time", "asc"), where("time", ">=", startOfTomorrow));
    }

    const updateBookingStatus = async (bookingId, newStatus) => {
        const bookingRef = doc(db, "salons", salonId, "bookings", bookingId);
        
        // ✅ NEW: Use Custom Confirm for Cancellation
        if (newStatus === 'Cancelled') {
            showEliteConfirm("Are you sure you want to CANCEL this booking?", async () => {
                await updateDoc(bookingRef, { status: 'Cancelled' });
            });
            return; // Exit, because the actual update happens inside the callback
        }

        // Standard updates (Check-in, No-Show) happen immediately
        let updateData = { status: newStatus };
        if (newStatus === 'Completed') updateData.completedAt = serverTimestamp();
        await updateDoc(bookingRef, updateData);
    }

    onSnapshot(q, (snapshot) => {
        let hasNewBooking = false; 
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added" && !isInitialLoad) { 
                try {
                    const audio = new Audio(BOOKING_ALERT_SOUND); 
                    audio.play(); 
                    hasNewBooking = true; 
                } catch (e) {}
            }
        });
        isInitialLoad = false; 
        list.innerHTML = "";
        
        if (snapshot.empty) {
            list.innerHTML = `<li class="empty-list-message">No bookings found.</li>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const bookingId = docSnap.id;
            if (['Completed', 'Cancelled', 'No-Show'].includes(data.status)) return; 

            const dateDisplay = new Date(data.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const timeDisplay = new Date(data.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            const currentStatus = data.status || 'Confirmed';
            const confirmText = (currentStatus === 'Confirmed') ? 'Check-In' : 'Done';
            const staffDisplay = data.staffMember || "Any"; 
            const phoneDisplay = data.phone || "";

            const li = document.createElement("li");
            li.classList.add('booking-item', currentStatus.toLowerCase()); 
            
            li.innerHTML = `
                <div class="booking-time">${timeDisplay}</div>
                <div class="booking-details">
                    <div class="booking-client">
                        ${data.name}
                        <span style="font-size: 0.8rem; color: var(--accent); margin-left: 8px;">${phoneDisplay}</span>
                    </div>
                    <div class="booking-service">${data.service}</div>
                    <div class="booking-staff" style="font-size: 0.85rem; color: #aaa;">
                        <span style="color: var(--accent);">Stylist:</span> ${staffDisplay}
                    </div>
                    <div class="booking-status">${currentStatus}</div>
                    ${currentView === 'future' ? `<div class="booking-date">${dateDisplay}</div>` : ''}
                </div>
                <div class="booking-actions">
                    <button class="action-btn confirm-btn">${confirmText}</button>
                    <button class="action-btn edit-btn" style="background: #7e7e7eff;">Edit</button>
                    <button class="action-btn no-show-btn">No-Show</button>
                    <button class="action-btn cancel-btn">Cancel</button>
                </div>
            `;
            
            li.querySelector('.confirm-btn').addEventListener('click', () => updateBookingStatus(bookingId, 'Completed'));
            li.querySelector('.no-show-btn').addEventListener('click', () => updateBookingStatus(bookingId, 'No-Show'));
            li.querySelector('.cancel-btn').addEventListener('click', () => updateBookingStatus(bookingId, 'Cancelled'));
            
            // ✅ NEW: Edit Listener
            li.querySelector('.edit-btn').addEventListener('click', () => openEditModal(data, bookingId));

            list.appendChild(li);
        });
    });
}

// 🔑 AUTH OBSERVER
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const salonData = await loadAdminData();
        if (salonData) {
            currentServicesList = salonData.services;
            currentStaffList = salonData.staff;
            currentShopConfig = salonData.config;
        }
        if (pinContainer) pinContainer.style.display = 'none';
        if (dashboardContainer) dashboardContainer.style.display = 'grid';
        populateServiceSelect(); 
        populateStaffSelect();
        checkReportAvailability();
        startBookingListener(); 
    } else {
        if (pinContainer) pinContainer.style.display = 'grid';
        if (dashboardContainer) dashboardContainer.style.display = 'none';
        currentPin = "";
        updatePinDisplay();
    }
});

// --- IMMEDIATE INIT ---
// Run this immediately to load the logo on the PIN screen
(async function initBranding() {
    if (!salonId) return;
    
    // Fetch just enough to show the logo
    try {
        const docRef = doc(db, "salons", salonId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            // Inject Logo into all logo slots (Login screen + Dashboard)
            if (data.logoUrl) {
                document.querySelectorAll(".salon-logo-target").forEach(img => { 
                    img.src = data.logoUrl;
                    img.style.display = 'block'; // Ensure it's visible
                });
            }
        }
    } catch (e) {
        console.error("Branding load failed", e);
    }
})();