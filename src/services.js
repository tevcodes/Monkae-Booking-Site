// src/services.js (Update the data structure)
export const services = [
  { id: 'wash-blow', name: 'Wash & Blow', icon: 'dry', duration: 30, price: 35.00, }, // 60 mins
  { id: 'cut', name: 'Cut', icon: 'content_cut', duration: 60, price: 50.00, }, // 30 mins
  { id: 'color', name: 'Color', icon: 'colorize',  duration: 90, price: 120.00, }, // 1 hr 30 mins
  { id: 'relax', name: 'Relax', icon: 'spa',  duration: 60, price: 40.00, },
  { id: 'all', name: 'Color, Cut and Wash', icon: 'spa', duration: 60, price: 340.00, },
  { id: 'botox', name: 'botox', icon: 'colorize', duration: 60, price: 440.00, },
];


export const shopConfig = {
  openHour: 9,
  closeHour: 17,
  closedDays: [0, 1], // Example: Closed on Sundays (0) and Mondays (1)
};

export const staffMembers = ["Mida", "First Time"];