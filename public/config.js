// API Configuration
// This file determines which API endpoint to use based on the environment

(function() {
  // Detect if we're running on Firebase Hosting
  const isFirebaseHosting = window.location.hostname.includes('web.app') || 
                            window.location.hostname.includes('firebaseapp.com');
  
  // Cloud Run service URL (update this after deploying the backend)
  // Format: https://recommendation-api-xxxxx-uc.a.run.app
  const CLOUD_RUN_API_URL = 'https://recommendation-api-xxxxx-uc.a.run.app';
  
  // Local development API URL
  const LOCAL_API_URL = 'http://localhost:3000';
  
  // Determine the API base URL
  let API_BASE_URL;
  
  if (isFirebaseHosting) {
    // Production: Use Cloud Run URL
    // If Cloud Run is not deployed yet, API calls will fail
    // Update CLOUD_RUN_API_URL above with your actual Cloud Run service URL
    API_BASE_URL = CLOUD_RUN_API_URL;
    
    // Fallback: If Cloud Run URL is not set, try relative paths (requires Firebase rewrites)
    if (CLOUD_RUN_API_URL.includes('xxxxx')) {
      console.warn('⚠️ Cloud Run API URL not configured. Using relative paths.');
      API_BASE_URL = ''; // Use relative paths (requires Firebase Hosting rewrites)
    }
  } else {
    // Development: Use local server
    API_BASE_URL = LOCAL_API_URL;
  }
  
  // Export the configuration
  window.APP_CONFIG = {
    API_BASE_URL: API_BASE_URL,
    isProduction: isFirebaseHosting,
    isDevelopment: !isFirebaseHosting
  };
  
  console.log('🔧 API Configuration:', {
    environment: isFirebaseHosting ? 'Production' : 'Development',
    apiUrl: API_BASE_URL || '(relative paths)'
  });
})();

