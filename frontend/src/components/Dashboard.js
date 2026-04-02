import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService, coursService, aiService } from '../services/api';
import { getUsers, createUser, deleteUser } from '../services/adminService';
import './Dashboard.css';

const MINIO = 'http://192.168.1.61:9000/courses/';
const GDOCS = 'https://docs.google.com/viewer?embedded=true&url=';

function getMinioUrl(fileUrl) {
  var fileName = fileUrl ? fileUrl.split('/').pop() : '';
  return MINIO + encodeURIComponent(fileName);
}

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadMsg, setUploadMsg] = useState('');
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    nom: '',
    prenom: '',
    role: 'etudiant',
    password: '',
  });
  const [viewingCourse, setViewingCourse] = useState(null);
  const [editingCourse, setEditingCourse] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editFile, setEditFile] = useState(null);
  const [editMsg, setEditMsg] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState([
    {
      role: 'bot',
      text: "Bonjour. Je suis l'assistant ENT de l'EST Salé. Posez une question sur l'école, les cours ou la plateforme — je réponds de façon courte et utile.",
      ts: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const aiSuggestions = [
    "Comment accéder à mes cours sur l'ENT ?",
    "À quoi sert l'espace étudiant à l'EST Salé ?",
    "Comment publier un cours ? (enseignant)",
  ];

  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) { navigate('/login'); return; }
    setUser(currentUser);
    setLoading(false);
    const roles = currentUser.roles || [];
    if (roles.includes('etudiant')) loadCourses('etudiant');
    if (roles.includes('enseignant')) loadCourses('enseignant');
    if (roles.includes('admin')) loadUsers(currentUser);
  }, [navigate]);

  const loadCourses = async (role) => {
    setCoursesLoading(true);
    try {
      const data = await coursService.listCourses(role);
      setCourses(data.courses || []);
    } catch (e) {
      setCourses([]);
    } finally {
      setCoursesLoading(false);
    }
  };

  const loadUsers = async (currentUser) => {
    setUsersLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const data = await getUsers('Bearer ' + token);
      setUsers(data.users || []);
    } catch (e) {
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    setUploadMsg('Envoi en cours...');
    try {
      await coursService.uploadCourse(uploadTitle, uploadDesc, uploadFile);
      setUploadMsg('Cours uploade avec succes !');
      setUploadTitle('');
      setUploadDesc('');
      setUploadFile(null);
      loadCourses('enseignant');
    } catch (err) {
      setUploadMsg('Erreur upload');
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUser.password || newUser.password.length < 6) {
      alert('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    try {
      const token = localStorage.getItem('access_token');
      await createUser(newUser, 'Bearer ' + token);
      setShowAddForm(false);
      setNewUser({
        username: '',
        email: '',
        nom: '',
        prenom: '',
        role: 'etudiant',
        password: '',
      });
      loadUsers(user);
    } catch (err) {
      const d = err.response?.data?.detail;
      alert(typeof d === 'string' ? d : 'Erreur lors de la création du compte');
    }
  };

  const handleDeleteCourse = async (courseId) => {
    if (!window.confirm('Supprimer ce cours ?')) return;
    try {
      await coursService.deleteCourse(courseId);
      loadCourses('enseignant');
    } catch (err) {
      alert('Erreur suppression');
    }
  };
  
  const handleEditCourse = (c) => {
    console.log('Editing course:', c);
    setEditingCourse(c);
    setEditTitle(c.title);
    setEditDesc(c.description);
    setEditFile(null);
    setEditMsg('');
  };

  const handleUpdateCourse = async (e, courseId) => {
    e.preventDefault();
    console.log('Update button clicked');
    console.log('Edit File:', editFile);
    
    if (!editTitle || !editDesc) {
      setEditMsg('Le titre et la description sont requis');
      return;
    }
    
    setEditMsg('Mise à jour en cours...');
    
    try {
      const token = localStorage.getItem('access_token');
      
      // Create FormData
      const formData = new FormData();
      formData.append('title', editTitle);
      formData.append('description', editDesc);
      
      // Only append file if one is selected
      if (editFile) {
        console.log('Adding file to formData:', editFile.name, editFile.type, editFile.size);
        formData.append('file', editFile);
      } else {
        console.log('No new file selected');
        // Send an empty file to indicate no change
        // formData.append('file', '');
      }
      
      // Log FormData contents for debugging
      for (let pair of formData.entries()) {
        console.log('FormData entry:', pair[0], pair[1]);
      }
      
      // Send request
      const response = await fetch(`http://192.168.1.61:8002/api/courses/${courseId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      console.log('Response status:', response.status);
      
      const result = await response.json();
      console.log('Response data:', result);
      
      if (!response.ok) {
        throw new Error(result.detail || 'Erreur lors de la mise à jour');
      }
      
      if (result.file_updated) {
        setEditMsg('✓ Cours mis à jour avec succès (fichier inclus)!');
      } else {
        setEditMsg('✓ Cours mis à jour avec succès!');
      }
      
      setTimeout(() => {
        setEditingCourse(null);
        setEditMsg('');
        loadCourses('enseignant');
      }, 1500);
      
    } catch (err) {
      console.error('Update error:', err);
      setEditMsg(`✗ Erreur: ${err.message}`);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Supprimer cet utilisateur ?')) return;
    try {
      const token = localStorage.getItem('access_token');
      await deleteUser(userId, 'Bearer ' + token);
      loadUsers(user);
    } catch (err) {
      alert('Erreur suppression');
    }
  };
  
  const handleLire = async (c) => {
    var url = getMinioUrl(c.file_url);
    var response = await fetch(url);
    var blob = await response.blob();
    var blobUrl = URL.createObjectURL(blob);
    setViewingCourse({...c, blobUrl: blobUrl});
  };

  const handleLogout = () => { authService.logout(); navigate('/login'); };

  const handleAiSend = async (presetText) => {
    const text = (presetText || aiInput).trim();
    if (!text || aiLoading) return;
    const ts = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    setAiMessages((prev) => [...prev, { role: 'user', text, ts }]);
    setAiInput('');
    setAiLoading(true);
    try {
      const data = await aiService.chat(text);
      setAiMessages((prev) => [
        ...prev,
        {
          role: 'bot',
          text: data.reply || 'Aucune reponse.',
          ts: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err) {
      setAiMessages((prev) => [
        ...prev,
        {
          role: 'bot',
          text: "Service IA indisponible pour le moment.",
          ts: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) return <div className="loading">Chargement...</div>;

  const roles = user ? (user.roles || []) : [];
  const isAdmin = roles.includes('admin');
  const isEnseignant = roles.includes('enseignant');
  const isEtudiant = roles.includes('etudiant');
  const roleLabel = isAdmin ? 'Administrateur' : isEnseignant ? 'Enseignant' : 'Étudiant';
  const roleCounts = {
    etudiant: users.filter((u) => u.role === 'etudiant').length,
    enseignant: users.filter((u) => u.role === 'enseignant').length,
    admin: users.filter((u) => u.role === 'admin').length,
  };
  const ROLE_META = {
    etudiant: { label: 'Étudiant', short: 'Étudiant', color: 'role-pill-etu' },
    enseignant: { label: 'Enseignant', short: 'Enseignant', color: 'role-pill-ens' },
    admin: { label: 'Administrateur', short: 'Admin', color: 'role-pill-adm' },
  };
  const rawName = user ? (user.name || user.username || 'Utilisateur') : 'Utilisateur';
  const baseFirstName = rawName.split(' ')[0];
  const firstName = baseFirstName
    ? baseFirstName.charAt(0).toUpperCase() + baseFirstName.slice(1).toLowerCase()
    : 'Utilisateur';
  const welcomeName = isEnseignant ? `Prof ${firstName}` : isAdmin ? `Admin ${firstName}` : firstName;
  const stats = isAdmin
    ? [
        { label: 'Étudiants', value: roleCounts.etudiant },
        { label: 'Enseignants', value: roleCounts.enseignant },
        { label: 'Administrateurs', value: roleCounts.admin },
      ]
    : isEnseignant
    ? [
        { label: 'Mes cours', value: courses.length || 0 },
        { label: 'Fichiers prets', value: courses.length || 0 },
        { label: 'Role', value: roleLabel },
      ]
    : [
        { label: 'Cours disponibles', value: courses.length || 0 },
        { label: 'Role', value: roleLabel },
      ];
  const recentCourses = courses.slice(0, 4);
  const now = new Date();
  const calendarYear = now.getFullYear();
  const calendarMonth = now.getMonth();
  const monthLabel = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const monthTitle = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
  const firstDay = new Date(calendarYear, calendarMonth, 1);
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const startOffset = (firstDay.getDay() + 6) % 7;
  const calendarCells = Array.from({ length: 42 }, (_, idx) => {
    const day = idx - startOffset + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });
  const courseEvents = courses
    .map((c) => {
      const rawDate = c.updated_at || c.created_at || c.date;
      if (!rawDate) return null;
      const d = new Date(rawDate);
      if (Number.isNaN(d.getTime())) return null;
      if (d.getFullYear() !== calendarYear || d.getMonth() !== calendarMonth) return null;
      return {
        key: `${c.id}-${d.toISOString()}`,
        day: d.getDate(),
        dateLabel: d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
        title: c.title || 'Cours',
        subject: c.title || 'Matiere',
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.day - b.day);
  const highlightedDays = new Set(courseEvents.map((e) => e.day));

  const topBarTitles = {
    dashboard: 'Tableau de bord',
    courses: 'Mes cours',
    calendar: 'Calendrier',
    upload: 'Publier un cours',
    'admin-console': 'Console administration',
    'admin-etudiants': 'Étudiants',
    'admin-enseignants': 'Enseignants',
    'admin-admins': 'Administrateurs',
  };
  const topBarTitle = topBarTitles[activeTab] || 'Tableau de bord';
  const barRoleKeys = roles.filter((r) => ['admin', 'enseignant', 'etudiant'].includes(r));

  const adminFilterRole =
    activeTab === 'admin-etudiants'
      ? 'etudiant'
      : activeTab === 'admin-enseignants'
        ? 'enseignant'
        : activeTab === 'admin-admins'
          ? 'admin'
          : null;
  const filteredAdminUsers = adminFilterRole
    ? users.filter((u) => u.role === adminFilterRole)
    : users;
  const adminListUsers = adminFilterRole ? filteredAdminUsers : users;

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="s-logo">
          <div className="s-logo-top">
            <img src="/estsale.webp" alt="EST Sale" className="s-logo-img" />
            <div>
              <div className="s-logo-t">ENT EST Sale</div>
              <div className="s-logo-s">Espace Numerique de Travail</div>
            </div>
          </div>
        </div>

        <div className="s-sec">{isAdmin ? 'Principal' : isEnseignant ? 'Enseignement' : 'Espace étudiant'}</div>
        <button className={`ni ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
          <span className="ni-icon ni-icon-grid" />
          Tableau de bord
        </button>
        {(isEtudiant || isEnseignant) && (
          <button className={`ni ${activeTab === 'courses' ? 'active' : ''}`} onClick={() => setActiveTab('courses')}>
            <span className="ni-icon ni-icon-list" />
            Mes cours
          </button>
        )}
        {isAdmin && (
          <>
            <div className="s-sec">Console administration</div>
            <button
              type="button"
              className={`ni ${activeTab === 'admin-console' ? 'active' : ''}`}
              onClick={() => setActiveTab('admin-console')}
            >
              <span className="ni-dot ni-dot-console" aria-hidden />
              Vue d&apos;ensemble
            </button>
            <button
              type="button"
              className={`ni ${activeTab === 'admin-etudiants' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('admin-etudiants');
                setNewUser((p) => ({ ...p, role: 'etudiant' }));
              }}
            >
              <span className="ni-dot ni-dot-etu" aria-hidden />
              Étudiants
            </button>
            <button
              type="button"
              className={`ni ${activeTab === 'admin-enseignants' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('admin-enseignants');
                setNewUser((p) => ({ ...p, role: 'enseignant' }));
              }}
            >
              <span className="ni-dot ni-dot-ens" aria-hidden />
              Enseignants
            </button>
            <button
              type="button"
              className={`ni ${activeTab === 'admin-admins' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('admin-admins');
                setNewUser((p) => ({ ...p, role: 'admin' }));
              }}
            >
              <span className="ni-dot ni-dot-adm" aria-hidden />
              Administrateurs
            </button>
          </>
        )}
        <div className="s-sec">Agenda</div>
        <button className={`ni ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>
          <span className="ni-icon ni-icon-calendar" />
          Calendrier
        </button>
        {isEnseignant && (
          <button className={`ni ${activeTab === 'upload' ? 'active' : ''}`} onClick={() => setActiveTab('upload')}>
            <svg className="ni-svg" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 11V3M5 6l3-3 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 13h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            Ajouter cours
          </button>
        )}

        <div className="s-footer">
          <div className="u-chip">
            <div className="av">{(user ? (user.name || user.username || 'U') : 'U').slice(0, 1).toUpperCase()}</div>
            <div>
              <div className="u-role">
                {barRoleKeys.length > 0
                  ? barRoleKeys.map((r) => ROLE_META[r]?.short || r).join(' · ')
                  : roleLabel}
              </div>
              <div className="u-name">{user ? (user.name || user.username) : ''}</div>
            </div>
          </div>
          <button onClick={handleLogout} className="logout-side-btn">Deconnexion</button>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="tb-title">{topBarTitle}</div>
          <div className="tb-right">
            {barRoleKeys.length > 0 ? (
              <div className="tb-role-chips">
                {barRoleKeys.map((r) => (
                  <span key={r} className={`tb-role-chip tb-role-chip-${r}`}>
                    {ROLE_META[r]?.label || r}
                  </span>
                ))}
              </div>
            ) : (
              <span className="badge-role">{roleLabel}</span>
            )}
          </div>
        </div>

        <div className="content">
        {activeTab === 'dashboard' && (
        <>
        {isEnseignant ? (
          <div className="welcome-banner fade-in">
            <div className="wb-title">{`Bienvenue, ${welcomeName} !`}</div>
          </div>
        ) : (
          <div className="welcome-card fade-in">
            <h1>{`Bienvenue, ${welcomeName} !`}</h1>
            <p>Bienvenue sur votre Espace Numerique de Travail de l EST Sale.</p>
            <div className="role-badge">{roleLabel}</div>
          </div>
        )}

        <div className="stats-row fade-in">
          {stats.map((s) => (
            <div className="sc" key={s.label}>
              <div className="sc-label">{s.label}</div>
              <div className="sc-val">{s.value}</div>
            </div>
          ))}
        </div>

        {isEtudiant && (
          <div className="card fade-in">
            <div className="card-head">
              <div className="card-title">Cours recents</div>
              <button className="act" onClick={() => setActiveTab('courses')}>Voir tout</button>
            </div>
            <div className="card-body">
              {coursesLoading ? (
                <p>Chargement des cours...</p>
              ) : recentCourses.length === 0 ? (
                <p style={{ color: '#888' }}>Aucun cours disponible pour le moment.</p>
              ) : (
                <div className="recent-courses-list">
                  {recentCourses.map((c, idx) => {
                    const minioUrl = getMinioUrl(c.file_url);
                    const ext = c.file_url && c.file_url.includes('.') ? c.file_url.substring(c.file_url.lastIndexOf('.')) : '';
                    const downloadName = `${c.title || 'cours'}${ext}`;
                    const progress = 35 + ((idx * 22) % 55);
                    const updatedDays = 2 + (idx * 3);
                    return (
                    <div className="recent-course-item" key={c.id}>
                      <div className="recent-course-top">
                        <div>
                          <div className="recent-course-title">{c.title}</div>
                          <div className="recent-course-desc">
                            Prof. {c.teacher || 'Inconnu'} · Mis a jour il y a {updatedDays}j
                          </div>
                        </div>
                        <a href={minioUrl} download={downloadName} className="recent-course-download-btn">
                          Telecharger
                        </a>
                      </div>
                      <div className="recent-progress-track">
                        <div className="recent-progress-fill" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {isEnseignant && (
          <div className="card fade-in">
            <div className="card-head">
              <div className="card-title">Mes cours</div>
            </div>
            <div className="card-body">
              {coursesLoading ? (
                <p>Chargement des cours...</p>
              ) : courses.length === 0 ? (
                <p style={{color:'#888'}}>Aucun cours disponible pour le moment.</p>
              ) : (
                <table style={{width:'100%', marginTop:12}}>
                  <thead>
                    <tr>
                      <th>Titre</th>
                      <th>Description</th>
                      <th style={{textAlign:'center'}}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courses.map((c) => {
                      var minioUrl = getMinioUrl(c.file_url);
                    var ext = c.file_url && c.file_url.includes('.') ? c.file_url.substring(c.file_url.lastIndexOf('.')) : '';
                    var downloadName = `${c.title || 'cours'}${ext}`;
                      return (
                        <tr key={c.id}>
                          <td>{c.title}</td>
                          <td>{c.description}</td>
                          <td style={{textAlign:'center'}}>
                            <div className="acts" style={{justifyContent:'center'}}>
                              <a href={minioUrl} download={downloadName} className="act act-download">Telecharger</a>
                              <button onClick={() => handleEditCourse(c)} className="act">Modifier</button>
                              <button onClick={() => handleDeleteCourse(c.id)} className="act act-r">Supprimer</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
        </>
        )}

        {activeTab === 'courses' && viewingCourse && (
          <div className="card fade-in">
            <div className="card-head">
              <div className="card-title">{viewingCourse.title}</div>
              <button onClick={() => setViewingCourse(null)} className="act act-r">Fermer</button>
            </div>
            <div className="card-body">
              <iframe
                src={viewingCourse.blobUrl}
                title={viewingCourse.title}
                style={{width:'100%', height:'700px', border:'1px solid #ddd', borderRadius:8}}
              />
            </div>
          </div>
        )}

        {activeTab === 'courses' && (isEtudiant || isEnseignant) && (
          <div className="card fade-in">
            <div className="card-head">
              <div className="card-title">{isEtudiant ? 'Mes cours' : 'Cours disponibles'}</div>
            </div>
            <div className="card-body">
            {coursesLoading ? (
              <p>Chargement des cours...</p>
            ) : courses.length === 0 ? (
              <p style={{color:'#888'}}>Aucun cours disponible pour le moment.</p>
            ) : (
              isEtudiant ? (
                <div className="student-cours-grid">
                  {courses.map((c, idx) => {
                    var minioUrl = getMinioUrl(c.file_url);
                    var ext = c.file_url && c.file_url.includes('.') ? c.file_url.substring(c.file_url.lastIndexOf('.')) : '';
                    var downloadName = `${c.title || 'cours'}${ext}`;
                    var progress = 25 + ((idx * 17) % 70);
                    return (
                      <div className="student-cours-card" key={c.id}>
                        <div className="student-cours-icon">≡</div>
                        <div className="student-cours-title">{c.title}</div>
                        <div className="student-cours-desc">{c.description || 'Support de cours'}</div>
                        <div className="student-cours-prof">Prof: {c.teacher || 'Inconnu'}</div>
                        <div className="student-cours-footer">
                          <span className="student-progress-pill">{progress}% complété</span>
                          <a href={minioUrl} download={downloadName} className="student-download-btn">Télécharger</a>
                        </div>
                        <div className="student-progress-track">
                          <div className="student-progress-fill" style={{width: `${progress}%`}} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
              <table style={{width:'100%', marginTop:12}}>
                <thead>
                  <tr>
                    <th>Titre</th>
                    <th>Description</th>
                    {isEtudiant && <th>Professeur</th>}
                    <th style={{textAlign:'center'}}>Actions</th>
                   </tr>
                </thead>
                <tbody>
                  {courses.map((c) => {
                    var minioUrl = getMinioUrl(c.file_url);
                    var ext = c.file_url && c.file_url.includes('.') ? c.file_url.substring(c.file_url.lastIndexOf('.')) : '';
                    var downloadName = `${c.title || 'cours'}${ext}`;
                    return (
                      <tr key={c.id}>
                        <td>{c.title}</td>
                        <td>{c.description}</td>
                        {isEtudiant && <td>{c.teacher || 'Inconnu'}</td>}
                        <td style={{textAlign:'center'}}>
                          <div className="acts" style={{justifyContent:'center'}}>
                            <a href={minioUrl} download={downloadName} className="act act-download">Telecharger</a>
                            {isEnseignant && (
                              <>
                                <button
                                  onClick={() => handleEditCourse(c)}
                                  className="act">
                                  Modifier
                                </button>
                                <button
                                  onClick={() => handleDeleteCourse(c.id)}
                                  className="act act-r">
                                  Supprimer
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              )
            )}
            </div>
          </div>
        )}

        {activeTab === 'courses' && isEnseignant && editingCourse && (
          <div className="card fade-in">
            <div className="card-head">
              <div className="card-title">Modifier le cours</div>
            </div>
            <div className="card-body">
            <form onSubmit={(e) => handleUpdateCourse(e, editingCourse.id)} style={{display:'grid', gap:12, maxWidth:500}}>
              <input 
                value={editTitle} 
                onChange={e => setEditTitle(e.target.value)} 
                placeholder="Titre du cours" 
                required 
                style={{padding:8, border:'1px solid #ddd', borderRadius:4}} 
              />
              <input 
                value={editDesc} 
                onChange={e => setEditDesc(e.target.value)} 
                placeholder="Description" 
                required 
                style={{padding:8, border:'1px solid #ddd', borderRadius:4}} 
              />
              <div>
                <label style={{display:'block', marginBottom:8, fontWeight:'bold', color: '#333'}}>
                  Nouveau fichier (optionnel):
                </label>
                <input 
                  type="file" 
                  onChange={e => {
                    const selectedFile = e.target.files[0];
                    console.log('File selected:', selectedFile);
                    setEditFile(selectedFile);
                  }} 
                  style={{padding:8, border:'1px solid #ddd', borderRadius:4, width:'100%'}} 
                />
                {editingCourse.file_url && (
                  <p style={{fontSize:12, color:'#666', marginTop:5}}>
                    📄 Fichier actuel: {editingCourse.file_url.split('/').pop()}
                    <br />💡 Sélectionnez un nouveau fichier pour le remplacer
                  </p>
                )}
              </div>
              <div style={{display:'flex', gap:8}}>
                <button type="submit" className="app-primary-btn">
                  Enregistrer
                </button>
                <button type="button" onClick={() => setEditingCourse(null)} className="act">
                  Annuler
                </button>
              </div>
              {editMsg && <p style={{marginTop:10, fontWeight:'bold', color: editMsg.includes('✓') ? 'green' : 'red'}}>{editMsg}</p>}
            </form>
            </div>
          </div>
        )}

        {activeTab === 'upload' && isEnseignant && (
          <div className="card fade-in upload-card">
            <div className="card-head">
              <div className="card-title">Nouveau cours</div>
            </div>
            <div className="card-body upload-body">
            <form onSubmit={handleUpload} className="upload-form">
              <div className="form-group">
                <label className="form-label">Titre du cours</label>
                <input
                  value={uploadTitle}
                  onChange={e => setUploadTitle(e.target.value)}
                  placeholder="ex: Algorithmique avancée"
                  required
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <input
                  value={uploadDesc}
                  onChange={e => setUploadDesc(e.target.value)}
                  placeholder="Brève description du cours"
                  required
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Filière / Niveau</label>
                <select className="form-input" defaultValue="gi-s3">
                  <option value="gi-s3">Génie Informatique — S3</option>
                  <option value="ge-s2">Génie Électrique — S2</option>
                  <option value="gc-s1">Génie Civil — S1</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Fichier du cours (PDF, PPTX, ZIP)</label>
                <label className="file-drop" htmlFor="upload-course-file">
                  <div className="upload-icon">↥</div>
                  <div className="file-drop-text">
                    Glissez votre fichier ici ou <span>parcourez</span>
                  </div>
                  <div className="file-drop-sub">Stockage MinIO · Max 100 MB</div>
                  {uploadFile && <div className="file-drop-name">{uploadFile.name}</div>}
                </label>
                <input
                  id="upload-course-file"
                  type="file"
                  required
                  className="hidden-file-input"
                  onChange={e => setUploadFile(e.target.files[0])}
                />
              </div>

              <button type="submit" className="publish-btn">Publier le cours</button>
              {uploadMsg && <p className="upload-msg">{uploadMsg}</p>}
            </form>
            </div>
          </div>
        )}

        {isAdmin && (activeTab === 'admin-console' || adminFilterRole) && (
          <div className="fade-in admin-console-root">
            {activeTab === 'admin-console' && (
              <>
                <div className="admin-console-hero">
                  <div className="admin-console-title">Console administration</div>
                  <p className="admin-console-sub">Pilotage des comptes : répartition par rôle et actions rapides.</p>
                </div>
                <div className="admin-console-kpis">
                  <button
                    type="button"
                    className="admin-kpi admin-kpi-etu"
                    onClick={() => {
                      setActiveTab('admin-etudiants');
                      setNewUser((p) => ({ ...p, role: 'etudiant' }));
                    }}
                  >
                    <span className="admin-kpi-n">{roleCounts.etudiant}</span>
                    <span className="admin-kpi-l">Étudiants</span>
                  </button>
                  <button
                    type="button"
                    className="admin-kpi admin-kpi-ens"
                    onClick={() => {
                      setActiveTab('admin-enseignants');
                      setNewUser((p) => ({ ...p, role: 'enseignant' }));
                    }}
                  >
                    <span className="admin-kpi-n">{roleCounts.enseignant}</span>
                    <span className="admin-kpi-l">Enseignants</span>
                  </button>
                  <button
                    type="button"
                    className="admin-kpi admin-kpi-adm"
                    onClick={() => {
                      setActiveTab('admin-admins');
                      setNewUser((p) => ({ ...p, role: 'admin' }));
                    }}
                  >
                    <span className="admin-kpi-n">{roleCounts.admin}</span>
                    <span className="admin-kpi-l">Administrateurs</span>
                  </button>
                </div>
              </>
            )}
            {adminFilterRole && (
              <div className={`admin-role-banner admin-role-banner-${adminFilterRole}`}>
                <span className="admin-role-banner-title">{ROLE_META[adminFilterRole].label}</span>
                <span className="admin-role-banner-count">{filteredAdminUsers.length} compte(s)</span>
              </div>
            )}

            <div className="card admin-user-card">
              <div className="card-head">
                <div className="card-title">
                  {activeTab === 'admin-console'
                    ? 'Tous les utilisateurs'
                    : `Utilisateurs — ${ROLE_META[adminFilterRole].label}s`}
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="app-primary-btn"
                >
                  {showAddForm ? 'Fermer' : '+ Ajouter un utilisateur'}
                </button>
              </div>
              <div className="card-body">
                {showAddForm && (
                  <form onSubmit={handleCreateUser} className="users-add-form">
                    <input
                      placeholder="Nom d'utilisateur"
                      value={newUser.username}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                      required
                      className="users-input"
                    />
                    <input
                      placeholder="Email"
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      required
                      className="users-input"
                    />
                    <input
                      placeholder="Mot de passe (min. 6 car.)"
                      type="password"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      className="users-input"
                    />
                    <input
                      placeholder="Nom"
                      value={newUser.nom}
                      onChange={(e) => setNewUser({ ...newUser, nom: e.target.value })}
                      required
                      className="users-input"
                    />
                    <input
                      placeholder="Prénom"
                      value={newUser.prenom}
                      onChange={(e) => setNewUser({ ...newUser, prenom: e.target.value })}
                      required
                      className="users-input"
                    />
                    <select
                      value={newUser.role}
                      onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                      className="users-input"
                      disabled={!!adminFilterRole}
                      title={adminFilterRole ? 'Rôle imposé par la section' : ''}
                    >
                      <option value="etudiant">Étudiant</option>
                      <option value="enseignant">Enseignant</option>
                      <option value="admin">Administrateur</option>
                    </select>
                    <button type="submit" className="users-submit-btn">
                      Créer le compte
                    </button>
                  </form>
                )}

                {usersLoading ? (
                  <p>Chargement...</p>
                ) : (
                  <div className="admin-table-wrap">
                    <table className="admin-users-table">
                      <thead>
                        <tr>
                          <th>Identifiant</th>
                          <th>Nom</th>
                          <th>Prénom</th>
                          <th>Email</th>
                          <th>Rôle</th>
                          <th style={{ textAlign: 'center' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminListUsers.map((u) => (
                          <tr key={u.id}>
                            <td className="td-mono">{u.username || '—'}</td>
                            <td>{u.nom}</td>
                            <td>{u.prenom}</td>
                            <td>{u.email}</td>
                            <td>
                              <span
                                className={`role-pill-table ${ROLE_META[u.role]?.color || ''}`}
                              >
                                {ROLE_META[u.role]?.label || u.role}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u.id)}
                                className="act act-r"
                              >
                                Supprimer
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'calendar' && (
          <>
          <div className="card fade-in calendar-card">
            <div className="card-head calendar-head">
              <div className="card-title">{monthTitle}</div>
            </div>
            <div className="card-body calendar-body">
              <div className="calendar-weekdays">
                {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
                  <div key={`cal-wd-${i}`} className="calendar-weekday">{d}</div>
                ))}
              </div>
              <div className="calendar-grid">
                {calendarCells.map((day, idx) => {
                  const isToday = day === now.getDate();
                  const hasEvent = day && highlightedDays.has(day);
                  return (
                    <div
                      key={`${day || 'x'}-${idx}`}
                      className={`calendar-day ${day ? '' : 'empty'} ${hasEvent ? 'event' : ''} ${isToday ? 'today' : ''}`}
                    >
                      {day || ''}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="card fade-in">
            <div className="card-head">
              <div className="card-title">Cours ajoutes du mois</div>
            </div>
            <div className="card-body">
              {courseEvents.length === 0 ? (
                <p style={{ color: '#666' }}>Aucun cours ajoute ce mois-ci.</p>
              ) : (
                <table style={{ width: '100%', marginTop: 0 }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Cours ajoute</th>
                      <th>Matiere</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courseEvents.map((ev) => (
                      <tr key={ev.key}>
                        <td>{ev.dateLabel}</td>
                        <td>{ev.title}</td>
                        <td>{ev.subject}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          </>
        )}
      </div>
      </div>

      <div className="ai-float">
        <button className="ai-fab" onClick={() => setAiOpen((v) => !v)} title="Assistant IA">
          <span className="ai-ring" />
          <svg className="ai-fab-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="6.5" y="8" width="11" height="9" rx="3" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="10" cy="12.5" r="1" fill="currentColor" />
            <circle cx="14" cy="12.5" r="1" fill="currentColor" />
            <path d="M12 5V3M8.5 17.8v1.7M15.5 17.8v1.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            <path d="M19 6.2l1.6-.8M20.2 9.4H22" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <div className={`ai-panel ${aiOpen ? 'open' : ''}`}>
            <div className="ai-panel-head">
              <div>
                <div className="ai-title">Assistant IA</div>
                <div className="ai-sub">EST Salé · Réponses courtes et ciblées (Ollama)</div>
                <div className="ai-status"><span className="ai-status-dot" />En ligne</div>
              </div>
              <button className="ai-close-btn" onClick={() => setAiOpen(false)} aria-label="Fermer">×</button>
            </div>
            <div className="ai-msgs">
              {aiMessages.map((m, idx) => (
                <div key={idx} className={`ai-msg-row ${m.role === 'user' ? 'ai-msg-row-user' : 'ai-msg-row-bot'} ai-fade-in`}>
                  {m.role === 'bot' && <div className="ai-avatar">🤖</div>}
                  <div className="ai-msg-stack">
                    <div className={`ai-msg ${m.role === 'user' ? 'ai-msg-user' : 'ai-msg-bot'}`}>{m.text}</div>
                    <div className="ai-ts">{m.ts}</div>
                  </div>
                </div>
              ))}
              {aiLoading && (
                <div className="ai-msg-row ai-msg-row-bot ai-fade-in">
                  <div className="ai-avatar">🤖</div>
                  <div className="ai-msg-stack">
                    <div className="ai-msg ai-msg-bot ai-typing">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="ai-suggestions">
              {aiSuggestions.map((s) => (
                <button key={s} className="ai-chip" onClick={() => handleAiSend(s)} disabled={aiLoading}>
                  {s}
                </button>
              ))}
            </div>
            <div className="ai-input-row">
              <input
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAiSend()}
                placeholder="Posez votre question..."
                className="ai-input"
                disabled={aiLoading}
              />
              <button onClick={() => handleAiSend()} className="ai-send-btn" disabled={aiLoading}>Envoyer</button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;