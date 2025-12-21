import './style.css'
import { db } from "./firebase.js";
import { collection, addDoc, serverTimestamp, query, getDocs, where, doc, getDoc, setDoc } from "firebase/firestore";
import { services, staffMembers } from "./services.js";
import { getSalonId } from "./utils.js";


const form = document.getElementById("booking-form");
const servicesContainer = document.getElementById("services-container");
const daySelector = document.getElementById("day-selector");
const timeSlotsContainer = document.getElementById("time-slots-container");
const finalStep = document.getElementById("final-step");
const successModal = document.getElementById("success-modal");
const bookAnotherBtn = document.getElementById("book-another-btn"); 
const closeModalBtn = document.getElementById("close-modal-btn"); 
const doneBtn = document.getElementById("done-btn");


const salonId = getSalonId();


let currentShopConfig = {
  openHour: 9,
  closeHour: 17,
  closedDays: []
};

let selectedService = null;
let selectedTime = null;
let currentServicesList = [];

const CLEANUP_BUFFER_MINUTES = 15;


function showEliteAlert(message) {
    const modal = document.getElementById('custom-alert-modal');
    const msg = document.getElementById('custom-alert-message');
    const btn = document.getElementById('custom-alert-ok');
    const body = document.body;

    if (modal && msg && btn) {
        msg.textContent = message;
        modal.classList.add('visible');
        body.classList.add('modal-open');
        
        btn.onclick = () => {
            modal.classList.remove('visible');
            body.classList.remove('modal-open');
        };
    } else {
     
        alert(message);
    }
}


async function loadSalonData() {
    try {
        const docRef = doc(db, "salons", salonId); 
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();

            if (data.logoUrl) {
                const logoEl = document.getElementById("dynamic-logo");
                if (logoEl) logoEl.src = data.logoUrl;
            }

            return {
              services: data.services || [],
              staff: data.staff || ["Default"],
              config: data.shopConfig || { openHour: 9, closeHour: 17, closedDays: [] }
            }
        }
    } catch (error) {
    
        console.error("Data Load Error:", error);
    }
    return null; 
}

const getTimeSlots = async (dateString, requiredDurationMinutes) => {
    const date = new Date(dateString);
    const dayOfWeek = date.getDay();

    if (currentShopConfig.closedDays.includes(dayOfWeek)) {
        return [];
    }

    const allPotentialSlots = [];
    const startHour = currentShopConfig.openHour;
    const endHour = currentShopConfig.closeHour; 
    const interval = 30; 

    for (let h = startHour; h < endHour; h++) {
        for (let m = 0; m < 60; m += interval) {
            const slotTime = new Date(date);
            slotTime.setHours(h, m, 0, 0);

      
            if (slotTime < new Date() && slotTime.toISOString().split('T')[0] === new Date().toISOString().split('T')[0]) {
                continue;
            }
            
       
            if (slotTime.getTime() + requiredDurationMinutes * 60000 > new Date(date).setHours(endHour, 0, 0, 0)) {
                continue;
            }

            allPotentialSlots.push(slotTime);
        }
    }

    const selectedDateISO = new Date(date).toISOString().split('T')[0];
    const startOfDayISO = selectedDateISO + 'T00:00:00.000Z';
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    const startOfNextDayISO = nextDay.toISOString().split('T')[0] + 'T00:00:00.000Z';

    const q = query(
        collection(db, "salons", salonId, "bookings"),
        where("time", ">=", startOfDayISO),
        where("time", "<", startOfNextDayISO),
        where('status', 'not-in', ['Cancelled', 'Completed', 'No-Show'])
    );

    const snapshot = await getDocs(q);
    const existingBookings = snapshot.docs.map(doc => doc.data()); 

    const availableSlots = allPotentialSlots.filter(potentialSlot => {
        const slotStartTime = potentialSlot.getTime(); 
        const slotEndTime = slotStartTime + requiredDurationMinutes * 60000; 

        const isOverlapping = existingBookings.some(booked => {
            const bookedStartTime = new Date(booked.time).getTime();
            const bookedService = services.find(s => s.name === booked.service);
            const bookedDuration = bookedService ? bookedService.duration + CLEANUP_BUFFER_MINUTES : 75; 
            const bookedEndTime = bookedStartTime + bookedDuration * 60000;

            return slotStartTime < bookedEndTime && slotEndTime > bookedStartTime;
        });

        return !isOverlapping;
    });

    return availableSlots.map(slot => ({
        time: slot.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        dateTime: slot.toISOString()
    }));
};

const getFutureDays = (count = 6) => {
    const days = [];
    for (let i = 0; i < count; i++) { 
        const date = new Date();
        date.setDate(date.getDate() + i);
        days.push(date); 
    }
    return days;
};



function resetBookingUI() {
  successModal.style.display = 'none';
  selectedService = null;
  selectedTime = null;
  daySelector.innerHTML = '';
  timeSlotsContainer.innerHTML = '';
  form.reset();
  renderServices(currentServicesList);
}

function renderServices(servicesList) {
  servicesContainer.innerHTML = '';

  servicesList.forEach(service => {
    const durationDisplay = service.duration >= 60
    ? `${Math.floor(service.duration / 60)} hr ${service.duration % 60} min`
    : `${service.duration} min`;

    const priceDisplay = `R ${service.price || 0}`;

    const card = document.createElement("div");
    card.classList.add("service-card");
    card.dataset.id = String(service.id);
    card.innerHTML = `
      <span class="service-icon material-symbols-outlined">${service.icon}</span>
            <div class="service-name">${service.name}</div>
            <div class="service-duration">${durationDisplay}</div>
            <div class="service-price">${priceDisplay}</div>
    `;

    card.addEventListener('click', () => selectService(service.id));
    servicesContainer.appendChild(card);
  });
}

function selectService(serviceId) {
  const serviceObj = currentServicesList.find(s => s.id === serviceId);

  if (!serviceObj) return;

  selectedService = serviceObj.name;
  form.service.value = serviceObj.name;

  document.querySelectorAll('.service-card').forEach(card => card.classList.remove('selected'));

  const card = document.querySelector(`.service-card[data-id="${serviceObj.id}"]`);
  if (card) {
    card.classList.add('selected');
  }
  
  renderDays();
  selectedTime = null;
  form.time.value = '';
  timeSlotsContainer.innerHTML = '';
  finalStep.style.display = 'none';
}

function renderDays() {
  daySelector.innerHTML = '';
  const days = getFutureDays(6);

  days.forEach((date, index) => {
    const dayName = index === 0 ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short' });

    const dayButton = document.createElement('button');
    dayButton.type = 'button';
    dayButton.classList.add('day-button');
    dayButton.dataset.date = date.toISOString().split('T')[0]; 

    const dayIndex = date.getDay(); 

    if (currentShopConfig.closedDays && currentShopConfig.closedDays.includes(dayIndex)) {
        dayButton.textContent = `${dayName} (Closed)`;
        dayButton.disabled = true; 
        dayButton.classList.add('disabled-day'); 
    } else {
        dayButton.textContent = dayName;
        dayButton.addEventListener('click', () => selectDay(dayButton));
    }

    daySelector.appendChild(dayButton);
  });
}

async function selectDay(button) {
    if (!selectedService) {
        showEliteAlert("Please select a service first.");
        return;
    }
    document.querySelectorAll('.day-button').forEach(btn => btn.classList.remove('selected'));
    button.classList.add('selected');

    const serviceObject = currentServicesList.find(s => s.name === selectedService);
    if (!serviceObject) return;
    
    const date = button.dataset.date;
    await renderTimeSlots(date, serviceObject.duration + CLEANUP_BUFFER_MINUTES); 

    selectedTime = null;
    form.time.value = '';
    finalStep.style.display = 'none';
}

async function renderTimeSlots(date, requiredDurationMinutes) {
  timeSlotsContainer.innerHTML = '<div class="loading-state">Loading available times...</div>';
  const slots = await getTimeSlots(date, requiredDurationMinutes);

  timeSlotsContainer.innerHTML = '';

  if (slots.length === 0) {
    timeSlotsContainer.innerHTML = '<div class="no-slots">No times available that day.</div>';
    return;
  }

  slots.forEach(slot => {
    const slotButton = document.createElement('button');
      slotButton.type = 'button';
      slotButton.classList.add('time-slot-button');
      slotButton.textContent = slot.time;
      slotButton.dataset.datetime = slot.dateTime;
      slotButton.addEventListener('click', () => selectTime(slotButton));
      timeSlotsContainer.appendChild(slotButton);
  });
}

function selectTime(button) {
    selectedTime = button.dataset.datetime;
    form.time.value = selectedTime;
    document.querySelectorAll('.time-slot-button').forEach(btn => btn.classList.remove('selected'));
    button.classList.add('selected');
    finalStep.style.display = 'flex';
}




form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = form.name.value;
    const email = form.email.value;
    const phone = form.phone.value;
    const service = form.service.value;
    const staff = form.staff.value;
    const time = form.time.value;

    if (!name || !email || !phone || !service || !time || !staff) {
        showEliteAlert("Please complete all steps: select service, time, and enter your name and email.");
        return;
    }

    if (!salonId) {
        console.error("CRITICAL ERROR: Salon ID is missing!"); 
        showEliteAlert("System Error: Missing Salon ID. Please contact support.");
        return;
    }

    try {
        await addDoc(collection(db, "salons", salonId, "bookings"), {
            name,
            email,
            phone,
            service,
            staffMember: staff,
            time, 
            status: 'Pending',
            createdAt: serverTimestamp(),
        });

        await addDoc(collection(db, "salons", salonId, "mail"), {
          to: email,
          message: {
            subject: `Booking Confirmed: ${service} with ${staff}`,
            html: `<p>Hello <strong>${name}</strong>, your appointment for ${service} on ${new Date(time).toLocaleString()} is confirmed.</p>`
          },
        });
      
      successModal.style.display = 'flex';
        form.reset();

      finalStep.style.display = 'none';

    } catch (err) {
        showEliteAlert("Error saving booking. Please try again.");
    }
});



bookAnotherBtn.addEventListener('click', () => {
  resetBookingUI();
});

doneBtn.addEventListener('click', () => {
  resetBookingUI();
});

closeModalBtn.addEventListener('click', () => {
  resetBookingUI();
});

function populateStaff(staffList) {
  const selects = document.querySelectorAll('select[name="staff"]');

  selects.forEach(select => {
    select.innerHTML = "";

    const listToUse = (staffList && staffList.length > 0) ? staffList : staffMembers;

    listToUse.forEach(name => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
  });
}



async function initApp() {
    const salonData = await loadSalonData();

    if (salonData) {
        currentServicesList = salonData.services;
        currentShopConfig = salonData.config;

        renderServices(currentServicesList);
        populateStaff(salonData.staff);
       } else {
        currentServicesList = services;
        renderServices(currentServicesList);
        populateStaff(staffMembers);
    }

    renderDays();
}

initApp();

// async function seedDatabase() {
 //   console.log("🚀 Starting Database Upload...");

//    try {
        // This writes to: salons -> mida
  //     await setDoc(doc(db, "salons", "mida"), {
  //          name: "Mida Hair",
  //          ownerEmail: "info@monkae.co.za",
   //         logoUrl: "https://firebasestorage.googleapis.com/v0/b/hairdresser-booking-5bd86.firebasestorage.app/o/midaLogo.png?alt=media&token=b2ed0735-afd0-4ad5-a6cf-7d09a10c26f4", 
    //        staff: ["Mida", "Sarah", "John"],
    //        adminPin: "3434"
               

   //         shopConfig: {
   //             openHour: 9,
   //             closeHour: 17,
  //              closedDays: [0, 1] 
  //          },

 //           services: [
 //               { id: 1, name: "Wash & Blow", duration: 30, price: 250, icon: "content_cut" },
  //              { id: 2, name: "Cut", duration: 60, price: 350, icon: "content_cut" },
  //            { id: 3, name: "Color", duration: 90, price: 600, icon: "palette" },
 //              { id: 4, name: "Relax", duration: 60, price: 450, icon: "self_improvement" },
 //               { id: 5, name: "Color, Cut and Wash", duration: 60, price: 850, icon: "content_cut" },
 //               { id: 6, name: "Botox", duration: 60, price: 750, icon: "medication" }
 //           ]
 //       }, { merge: true });

 //       console.log("✅ SUCCESS! Database populated for 'mida'.");
 //       alert("Database Updated Successfully!");
        
 //   } catch (error) {
 //       console.error("Error uploading data:", error);
 //       alert("Error uploading data. Check console.");
 //   }
//}
 //seedDatabase(); // Uncomment to run, then comment out again