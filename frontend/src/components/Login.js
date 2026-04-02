import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService, getKeycloakForgotPasswordUrl, getKeycloakRegistrationUrl } from '../services/api';
import './Login.css';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;
    const dedupeKey = `kc_oauth_${code}`;
    if (sessionStorage.getItem(dedupeKey)) return;
    sessionStorage.setItem(dedupeKey, '1');
    const redirectUri = `${window.location.origin}/login`;
    (async () => {
      setLoading(true);
      setError('');
      try {
        await authService.oauthExchange(code, redirectUri);
        window.history.replaceState({}, document.title, '/login');
        navigate('/dashboard');
      } catch (e) {
        setError(
          "Impossible de finaliser la connexion après Keycloak. Vérifiez l'URL de redirection dans le client Keycloak."
        );
        window.history.replaceState({}, document.title, '/login');
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      await authService.login(username, password);
      navigate('/dashboard');
    } catch (err) {
      setError('Nom d\'utilisateur ou mot de passe incorrect');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <img src="/estsale.webp" alt="EST Sale" className="login-logo" />
          <h1>
            Espace Numérique
            <br />
            de Travail
          </h1>
          <h2>EST Salé</h2>
        </div>
        
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleSubmit} className="login-form" autoComplete="on">
          <div className="form-group">
            <label>Nom d'utilisateur</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="etudiant1, enseignant1, admin1"
              required
              disabled={loading}
            />
          </div>
          
          <div className="form-group">
            <label>Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
              autoComplete="current-password"
            />
          </div>
          
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Connexion en cours...' : 'Se connecter'}
          </button>
        </form>

        <div className="login-footer">
          <a href={getKeycloakForgotPasswordUrl()} rel="noreferrer">
            Mot de passe oublié ?
          </a>
          <span className="login-separator">|</span>
          <a href={getKeycloakRegistrationUrl()} rel="noreferrer">
            Nouveau ? Créer / valider votre compte
          </a>
        </div>
      </div>
    </div>
  );
};

export default Login;