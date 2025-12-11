export function getSalonId() {
    const urlParams = new URLSearchParams(window.location.search);
    const salonId = urlParams.get('salon');

    return salonId || 'mida';
}