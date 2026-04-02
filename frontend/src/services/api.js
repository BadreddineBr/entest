import axios from 'axios';

const AUTH_URL = process.env.REACT_APP_AUTH_URL || 'http://192.168.1.61:8000';
const AJOUT_URL = process.env.REACT_APP_AJOUT_URL || 'http://192.168.1.61:8002';
const DOWNLOAD_URL = process.env.REACT_APP_DOWNLOAD_URL || 'http://192.168.1.61:8003';
const ADMIN_URL = process.env.REACT_APP_ADMIN_URL || 'http://192.168.1.61:8004';
const AI_URL = process.env.REACT_APP_AI_URL || 'http://192.168.1.61:8005';

/** Keycloak public URL (no trailing slash), e.g. http://YOUR_SERVER:8080 — must match what users open in the browser */
const KEYCLOAK_URL = (process.env.REACT_APP_KEYCLOAK_URL || 'http://192.168.1.61:8080').replace(
  /\/$/,
  ''
);
const KEYCLOAK_REALM = process.env.REACT_APP_KEYCLOAK_REALM || 'est-sale';
const KEYCLOAK_CLIENT_ID = process.env.REACT_APP_KEYCLOAK_CLIENT_ID || 'ent-backend';

/**
 * Mot de passe oublié — écran Keycloak (realm: Login → Forgot password activé).
 */
export function getKeycloakForgotPasswordUrl() {
  const q = new URLSearchParams({ client_id: KEYCLOAK_CLIENT_ID });
  return `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/login-actions/reset-credentials?${q}`;
}

/**
 * Inscription OIDC — nécessite User registration activé sur le realm + redirect URI autorisé pour le client.
 * REACT_APP_KEYCLOAK_REDIRECT_URI sinon window.location.origin + /login
 */
export function getKeycloakRegistrationUrl() {
  const redirect =
    process.env.REACT_APP_KEYCLOAK_REDIRECT_URI ||
    (typeof window !== 'undefined' ? `${window.location.origin}/login` : '');
  const q = new URLSearchParams({
    client_id: KEYCLOAK_CLIENT_ID,
    response_type: 'code',
    scope: 'openid profile email',
    redirect_uri: redirect,
  });
  return `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/registrations?${q}`;
}

const authApi = axios.create({ baseURL: AUTH_URL });
const ajoutApi = axios.create({ baseURL: AJOUT_URL });
const downloadApi = axios.create({ baseURL: DOWNLOAD_URL });
const adminApi = axios.create({ baseURL: ADMIN_URL });
const aiApi = axios.create({ baseURL: AI_URL });

[authApi, ajoutApi, downloadApi, adminApi, aiApi].forEach(instance => {
  instance.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
});

function applyTokenResponse(data) {
  if (!data.access_token) return;
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('refresh_token', data.refresh_token);
  const tokenData = JSON.parse(atob(data.access_token.split('.')[1]));
  const user = {
    username: tokenData.preferred_username,
    email: tokenData.email,
    name: tokenData.name,
    roles:
      tokenData.resource_access?.['ent-backend']?.roles ||
      tokenData.realm_access?.roles?.filter((r) =>
        ['etudiant', 'enseignant', 'admin'].includes(r)
      ) ||
      [],
  };
  localStorage.setItem('user', JSON.stringify(user));
}

// ==================== AUTH SERVICE ====================
export const authService = {
  login: async (username, password) => {
    const response = await axios.post(`${AUTH_URL}/api/auth/login`, { username, password });
    applyTokenResponse(response.data);
    return response.data;
  },
  /** Après inscription Keycloak (redirect ?code= sur /login) — redirect_uri doit être identique à l’URL d’inscription */
  oauthExchange: async (code, redirectUri) => {
    const response = await axios.post(`${AUTH_URL}/api/auth/oauth-callback`, {
      code,
      redirect_uri: redirectUri,
    });
    applyTokenResponse(response.data);
    return response.data;
  },
  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
  },
  getCurrentUser: () => {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },
  isAuthenticated: () => !!localStorage.getItem('access_token'),
  testStudentRoute: async () => (await authApi.get('/api/auth/me')).data,
  testTeacherRoute: async () => (await ajoutApi.get('/')).data,
  testAdminRoute: async () => (await adminApi.get('/')).data,
};

// ==================== COURS SERVICE ====================
export const coursService = {
  uploadCourse: async (title, description, file) => {
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('access_token');
    return (await ajoutApi.post(
      `/api/courses?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data', 'Authorization': `Bearer ${token}` } }
    )).data;
  },
  listCourses: async (role) => {
    const token = localStorage.getItem('access_token');
    const endpoint = role === 'etudiant' ? '/api/public/courses' : '/api/courses';
    return (await ajoutApi.get(endpoint, { headers: { 'Authorization': `Bearer ${token}` } })).data;
  },
  deleteCourse: async (courseId) => {
    const token = localStorage.getItem('access_token');
    return (await ajoutApi.delete(`/api/courses/${courseId}`, { headers: { 'Authorization': `Bearer ${token}` } })).data;
  },
};

// ==================== AI SERVICE ====================
export const aiService = {
  chat: async (message) => {
    if (!message) throw new Error("Message vide");
    try {
      const response = await aiApi.post('/api/ai/chat', { message });
      return response.data;
    } catch (err) {
      console.error("Erreur AI:", err.response || err);
      throw err;
    }
  },
};

export {
  authApi,
  ajoutApi,
  downloadApi,
  adminApi,
  aiApi,
  AUTH_URL,
  AJOUT_URL,
  DOWNLOAD_URL,
  ADMIN_URL,
  AI_URL,
  KEYCLOAK_URL,
  KEYCLOAK_REALM,
  KEYCLOAK_CLIENT_ID,
  getKeycloakForgotPasswordUrl,
  getKeycloakRegistrationUrl,
};
