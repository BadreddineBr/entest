import React, { useState, useEffect } from 'react';
import { getUsers, deleteUser, createUser, updateUser } from '../services/adminService';

function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  
  // Formulaire nouvel utilisateur
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    nom: '',
    prenom: '',
    role: 'etudiant'
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const token = 'fake-token-admin';
      const data = await getUsers(token);
      setUsers(data.users);
      setError('');
    } catch (err) {
      setError('Erreur lors du chargement des utilisateurs');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (userId) => {
    if (window.confirm('Supprimer cet utilisateur ?')) {
      try {
        const token = 'fake-token-admin';
        await deleteUser(userId, token);
        fetchUsers(); // Recharger la liste
      } catch (err) {
        setError('Erreur lors de la suppression');
      }
    }
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = 'fake-token-admin';
      
      if (editingUser) {
        // Mode modification
        await updateUser(editingUser.id, formData, token);
        alert('Utilisateur modifié avec succès !');
      } else {
        // Mode création
        await createUser(formData, token);
        alert('Utilisateur créé avec succès !');
      }
      
      // Réinitialiser le formulaire
      setFormData({
        username: '',
        email: '',
        nom: '',
        prenom: '',
        role: 'etudiant'
      });
      setEditingUser(null);
      setShowForm(false);
      fetchUsers(); // Recharger la liste
    } catch (err) {
      setError('Erreur lors de l\'enregistrement');
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      nom: user.nom,
      prenom: user.prenom,
      role: user.role
    });
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingUser(null);
    setFormData({
      username: '',
      email: '',
      nom: '',
      prenom: '',
      role: 'etudiant'
    });
  };

  if (loading) return <div style={styles.loading}>Chargement...</div>;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2>Gestion des utilisateurs</h2>
        <button 
          style={styles.addButton}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Fermer' : '+ Ajouter un utilisateur'}
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {/* Formulaire d'ajout/modification */}
      {showForm && (
        <div style={styles.formContainer}>
          <h3>{editingUser ? 'Modifier' : 'Ajouter'} un utilisateur</h3>
          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.formGroup}>
              <label>Nom d'utilisateur:</label>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                required
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label>Email:</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                required
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label>Nom:</label>
              <input
                type="text"
                name="nom"
                value={formData.nom}
                onChange={handleInputChange}
                required
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label>Prénom:</label>
              <input
                type="text"
                name="prenom"
                value={formData.prenom}
                onChange={handleInputChange}
                required
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label>Rôle:</label>
              <select
                name="role"
                value={formData.role}
                onChange={handleInputChange}
                style={styles.input}
              >
                <option value="etudiant">Étudiant</option>
                <option value="enseignant">Enseignant</option>
                <option value="admin">Administrateur</option>
              </select>
            </div>
            <div style={styles.buttonGroup}>
              <button type="submit" style={styles.saveButton}>
                {editingUser ? 'Modifier' : 'Ajouter'}
              </button>
              <button type="button" onClick={handleCancel} style={styles.cancelButton}>
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tableau des utilisateurs */}
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Nom</th>
            <th style={styles.th}>Prénom</th>
            <th style={styles.th}>Email</th>
            <th style={styles.th}>Rôle</th>
            <th style={styles.th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id}>
              <td style={styles.td}>{user.nom}</td>
              <td style={styles.td}>{user.prenom}</td>
              <td style={styles.td}>{user.email}</td>
              <td style={styles.td}>
                <span style={{
                  ...styles.role,
                  ...(user.role === 'admin' ? styles.roleAdmin : 
                      user.role === 'enseignant' ? styles.roleTeacher : 
                      styles.roleStudent)
                }}>
                  {user.role}
                </span>
              </td>
              <td style={styles.td}>
                <button 
                  onClick={() => handleEdit(user)}
                  style={styles.editButton}
                >
                  Modifier
                </button>
                <button 
                  onClick={() => handleDelete(user.id)}
                  style={styles.deleteButton}
                >
                  Supprimer
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Styles
const styles = {
  container: {
    padding: '20px',
    fontFamily: 'Arial, sans-serif'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px'
  },
  addButton: {
    backgroundColor: '#4CAF50',
    color: 'white',
    padding: '10px 20px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px'
  },
  formContainer: {
    backgroundColor: '#f5f5f5',
    padding: '20px',
    borderRadius: '8px',
    marginBottom: '20px'
  },
  form: {
    display: 'grid',
    gap: '15px'
  },
  formGroup: {
    display: 'grid',
    gap: '5px'
  },
  input: {
    padding: '8px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px'
  },
  buttonGroup: {
    display: 'flex',
    gap: '10px',
    marginTop: '10px'
  },
  saveButton: {
    backgroundColor: '#4CAF50',
    color: 'white',
    padding: '10px 20px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  cancelButton: {
    backgroundColor: '#f44336',
    color: 'white',
    padding: '10px 20px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '20px'
  },
  th: {
    backgroundColor: '#f2f2f2',
    padding: '12px',
    border: '1px solid #ddd',
    textAlign: 'left'
  },
  td: {
    padding: '10px',
    border: '1px solid #ddd'
  },
  role: {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 'bold'
  },
  roleAdmin: {
    backgroundColor: '#ff4444',
    color: 'white'
  },
  roleTeacher: {
    backgroundColor: '#ffbb33',
    color: 'black'
  },
  roleStudent: {
    backgroundColor: '#00C851',
    color: 'white'
  },
  editButton: {
    backgroundColor: '#ffbb33',
    color: 'black',
    padding: '5px 10px',
    border: 'none',
    borderRadius: '4px',
    marginRight: '5px',
    cursor: 'pointer'
  },
  deleteButton: {
    backgroundColor: '#ff4444',
    color: 'white',
    padding: '5px 10px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  error: {
    backgroundColor: '#ff4444',
    color: 'white',
    padding: '10px',
    borderRadius: '4px',
    marginBottom: '10px'
  },
  loading: {
    textAlign: 'center',
    padding: '50px',
    fontSize: '18px'
  }
};

export default AdminUsers;
