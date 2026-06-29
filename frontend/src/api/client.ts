import axios from 'axios';

const client = axios.create({
  baseURL: '',
  timeout: 10000
});

// Request interceptor to append JWT token
client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('taopf_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle 401 Unauthorized
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('taopf_token');
      // Force reload to trigger login overlay
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

export default client;
