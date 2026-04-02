import axios from 'axios';

const API_URL =
  process.env.REACT_APP_ADMIN_API_URL ||
  process.env.REACT_APP_ADMIN_URL ||
  'http://localhost:8004';

function authHeader(token) {
  if (!token) return {};
  const t = token.startsWith('Bearer') ? token : `Bearer ${token}`;
  return { Authorization: t };
}

export const getUsers = async (token) => {
  const response = await axios.get(`${API_URL}/api/admin/users`, {
    headers: authHeader(token),
  });
  return response.data;
};

export const getUserById = async (userId, token) => {
  const response = await axios.get(`${API_URL}/api/admin/users/${userId}`, {
    headers: authHeader(token),
  });
  return response.data;
};

export const createUser = async (userData, token) => {
  const payload = {
    username: userData.username,
    email: userData.email,
    role: userData.role,
    nom: userData.nom,
    prenom: userData.prenom,
    password: userData.password,
  };
  if (userData.filiere) payload.filiere = userData.filiere;
  const response = await axios.post(`${API_URL}/api/admin/users`, payload, {
    headers: { ...authHeader(token), 'Content-Type': 'application/json' },
  });
  return response.data;
};

export const updateUser = async (userId, userData, token) => {
  const payload = {};
  if (userData.email !== undefined && userData.email !== '') payload.email = userData.email;
  if (userData.nom !== undefined) payload.nom = userData.nom;
  if (userData.prenom !== undefined) payload.prenom = userData.prenom;
  if (userData.role !== undefined) payload.role = userData.role;
  if (userData.actif !== undefined) payload.actif = userData.actif;
  if (userData.password && userData.password.length > 0) payload.password = userData.password;
  if (userData.filiere !== undefined) payload.filiere = userData.filiere;
  const response = await axios.put(`${API_URL}/api/admin/users/${userId}`, payload, {
    headers: { ...authHeader(token), 'Content-Type': 'application/json' },
  });
  return response.data;
};

export const deleteUser = async (userId, token) => {
  const response = await axios.delete(`${API_URL}/api/admin/users/${userId}`, {
    headers: authHeader(token),
  });
  return response.data;
};

export const getPublicUsers = async () => {
  const response = await axios.get(`${API_URL}/api/public/users`);
  return response.data;
};

export const checkHealth = async () => {
  const response = await axios.get(`${API_URL}/`);
  return response.data;
};

const adminService = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getPublicUsers,
  checkHealth,
};

export default adminService;
