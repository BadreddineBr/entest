import axios from 'axios';
import { ADMIN_URL } from './api';

// Same base as api.js (192.168.1.61 in dev) — avoid localhost when UI is opened from another host
const API_URL =
  process.env.REACT_APP_ADMIN_API_URL ||
  process.env.REACT_APP_ADMIN_URL ||
  ADMIN_URL;

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

export const getMyProfile = async (token) => {
  const response = await axios.get(`${API_URL}/api/me/profile`, {
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
  if (userData.groupe) payload.groupe = userData.groupe;
  if (userData.filiere) payload.filiere = userData.filiere;
  if (userData.departement) payload.departement = userData.departement;
  if (userData.specialite) payload.specialite = userData.specialite;
  if (userData.grade) payload.grade = userData.grade;
  if (userData.bureau) payload.bureau = userData.bureau;
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
  if (userData.groupe !== undefined) payload.groupe = userData.groupe;
  if (userData.departement !== undefined) payload.departement = userData.departement;
  if (userData.specialite !== undefined) payload.specialite = userData.specialite;
  if (userData.grade !== undefined) payload.grade = userData.grade;
  if (userData.bureau !== undefined) payload.bureau = userData.bureau;
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
  getMyProfile,
  createUser,
  updateUser,
  deleteUser,
  getPublicUsers,
  checkHealth,
};

export default adminService;
