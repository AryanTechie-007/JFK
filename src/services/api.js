// Base API client service for FinMate AI frontend

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

// Token storage keys (unified across legacy auth and v1 API client)
const TOKEN_KEY = 'finmate_token';

export const getAuthToken = () =>
  localStorage.getItem('finmate_token') ||
  localStorage.getItem('finmate_auth_token') ||
  sessionStorage.getItem('finmate_token');

export const setAuthToken = (token) => {
  if (token) {
    localStorage.setItem('finmate_token', token);
    localStorage.setItem('finmate_auth_token', token);
  } else {
    localStorage.removeItem('finmate_token');
    localStorage.removeItem('finmate_auth_token');
  }
};

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers,
    credentials: 'omit',
  };

  try {
    let response;
    try {
      response = await fetch(url, config);
    } catch (fetchErr) {
      const netError = new Error('Network error: Unable to reach API server.');
      netError.isNetworkError = true;
      netError.originalError = fetchErr;
      throw netError;
    }

    // Handle HTTP errors
    if (!response.ok) {
      let errorMessage = `API Error: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData && (errorData.message || errorData.error)) {
          errorMessage = errorData.message || errorData.error;
        }
      } catch (e) {
        // Response was not JSON
      }
      const error = new Error(errorMessage);
      error.status = response.status;
      throw error;
    }

    // Return JSON if present
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    return { success: true };
  } catch (error) {
    console.warn(`[API] ${options.method || 'GET'} ${url} failed:`, error.message);
    throw error;
  }
}

export const api = {
  get: (endpoint, options) => request(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options) => request(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body, options) => request(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) }),
  delete: (endpoint, options) => request(endpoint, { ...options, method: 'DELETE' }),
  getBaseUrl: () => BASE_URL,
};
