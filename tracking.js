// Function to initialize the main Google Tag for Ads and Analytics
function initGTag() {
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'AW-17534255111'); // Google Ads ID
  gtag('config', 'G-8JYPJDKSP8');    // Google Analytics ID
}

// Function to track a specific "Page view" conversion
function trackPageViewConversion() {
  if (typeof gtag === 'function') {
    gtag('event', 'conversion', {'send_to': 'AW-17534255111/09vcCOjI85QbEIeA_qhB'});
  }
}

// Immediately run the initialization function when this script is loaded
initGTag();