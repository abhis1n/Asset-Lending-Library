/**
 * Reusable API Client for the Asset Lending Library
 * Handles authentication headers, error wrapping, 401 callbacks, and file downloads.
 */

const BASE_URL =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/api`
    : '/api';

const TOKEN_STORAGE_KEY = 'asset_lending_token';

let onUnauthorizedCallback = null;

export function setUnauthorizedHandler(callback) {
  onUnauthorizedCallback = callback;
}

export function getToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export function removeToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

/**
 * Core request helper
 */
async function request(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;
  const token = getToken();

  const isAuthEndpoint =
    endpoint === '/auth/login' ||
    endpoint.endsWith('/auth/login') ||
    url.endsWith('/auth/login') ||
    endpoint === '/auth/register' ||
    endpoint.endsWith('/auth/register') ||
    url.endsWith('/auth/register');

  const headers = {
    ...options.headers,
  };

  if (token && !isAuthEndpoint) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Set default JSON Content-Type if body is an object and not FormData/String
  if (
    options.body &&
    typeof options.body === 'object' &&
    !(options.body instanceof FormData) &&
    !(options.body instanceof Blob)
  ) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Handle 401 Unauthorized globally (exclude public auth endpoints)
    if (response.status === 401 && !isAuthEndpoint) {
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback();
      }
      throw new Error('Your session has expired. Please sign in again.');
    }

    // Handle other HTTP errors
    if (!response.ok) {
      let errorMessage = `Request failed with status ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch {
        // Response was not JSON
      }
      const error = new Error(errorMessage);
      error.status = response.status;
      throw error;
    }

    // Return parsed JSON if content-type is JSON
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }

    return await response.text();
  } catch (err) {
    // Rethrow or standardize network errors
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      throw new Error('Unable to connect to the server. Please ensure the backend is running.');
    }
    throw err;
  }
}

export const api = {
  get: (endpoint, options = {}) => request(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'POST', body }),
  put: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'PUT', body }),
  patch: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'PATCH', body }),
  delete: (endpoint, options = {}) => request(endpoint, { ...options, method: 'DELETE' }),

  /**
   * File download helper (e.g. for CSV exports)
   */
  download: async (endpoint, defaultFilename = 'download.csv') => {
    const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;
    const token = getToken();
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, { headers });

    if (response.status === 401) {
      if (onUnauthorizedCallback) onUnauthorizedCallback();
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}`);
    }

    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition');
    let filename = defaultFilename;
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="?([^";]+)"?/);
      if (match && match[1]) filename = match[1];
    }

    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);
  },
};
