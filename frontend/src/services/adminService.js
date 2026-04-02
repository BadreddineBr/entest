import axios from 'axios';

// Admin service URL - use 192.168.1.61 for local dev
const API_URL = process.env.REACT_APP_ADMIN_API_URL || 'http://192.168.1.61:8004';

// Récupérer tous les utilisateurs (admin seulement)
export const getUsers = async (token) => {
  try {
    const response = await axios.get(`${API_URL}/api/admin/users`, {
      headers: { Authorization: token }
    });
    return response.data;
  } catch (error) {
    console.error('❌ Erreur chargement utilisateurs:', error.response?.data || error.message);
    throw error;
  }
};

// Récupérer un utilisateur par son ID
export const getUserById = async (userId, token) => {
  try {
    const response = await axios.get(`${API_URL}/api/admin/users/${userId}`, {
      headers: { Authorization: token }
    });
    return response.data;
  } catch (error) {
    console.error('❌ Erreur chargement utilisateur:', error.response?.data || error.message);
    throw error;
  }
};

// Créer un nouvel utilisateur
// Créer un utilisateur
export const createUser = async (userData, token) => {
  console.log("📤 Données envoyées:", userData);
  console.log("🔑 Token utilisé:", token);
  console.log("🌐 URL complète:", `${API_URL}/api/admin/users`);
  
  try {
    // IMPORTANT: Ne pas ajouter d'ID dans l'URL pour la création
    const response = await axios.post(`${API_URL}/api/admin/users`, null, {
      params: {
        username: userData.username,
        email: userData.email,
        role: userData.role,
        nom: userData.nom,
        prenom: userData.prenom
      },
      headers: { Authorization: token }
    });
    console.log("✅ Réponse création:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Erreur détaillée:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      url: error.config?.url
    });
    throw error;
  }
};
// Mettre à jour un utilisateur existant
// Mettre à jour un utilisateur
export const updateUser = async (userId, userData, token) => {
  console.log("📤 Modification utilisateur:", userId, userData);
  
  try {
    // Ici on AJOUTE l'ID dans l'URL (contrairement à create)
    const response = await axios.put(`${API_URL}/api/admin/users/${userId}`, null, {
      params: {
        email: userData.email,
        nom: userData.nom,
        prenom: userData.prenom,
        role: userData.role
      },
      headers: { Authorization: token }
    });
    console.log("✅ Réponse modification:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Erreur modification:", error.response?.data || error.message);
    throw error;
  }
};
// Supprimer un utilisateur
export const deleteUser = async (userId, token) => {
  try {
    const response = await axios.delete(`${API_URL}/api/admin/users/${userId}`, {
      headers: { Authorization: token }
    });
    
    console.log('✅ Utilisateur supprimé avec succès:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Erreur suppression utilisateur:', error.response?.data || error.message);
    throw error;
  }
};

// Récupérer la liste publique (pour tests)
export const getPublicUsers = async () => {
  try {
    const response = await axios.get(`${API_URL}/api/public/users`);
    return response.data;
  } catch (error) {
    console.error('❌ Erreur chargement public:', error.response?.data || error.message);
    throw error;
  }
};

// Vérifier si le service est en ligne
export const checkHealth = async () => {
  try {
    const response = await axios.get(`${API_URL}/`);
    return response.data;
  } catch (error) {
    console.error('❌ Service MS4 non disponible:', error.message);
    throw error;
  }
};

// Export par défaut avec toutes les fonctions
const adminService = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getPublicUsers,
  checkHealth
};

export default adminService;
