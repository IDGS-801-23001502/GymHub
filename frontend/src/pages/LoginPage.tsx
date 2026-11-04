import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/contexto';
import { Alerta, Campo } from '../components/ui';
import { mensajesError } from '../utils/useCarga';

export function LoginPage() {
  const { usuario, iniciarSesion, avisoCierre } = useAuth();
  const location = useLocation();
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errores, setErrores] = useState<string[]>([]);

  const destino = (location.state as { desde?: string } | null)?.desde ?? '/socios';
  if (usuario) return <Navigate to={destino} replace />;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErrores([]);
    try {
      await iniciarSesion(correo.trim(), password);
    } catch (err) {
      setErrores(mensajesError(err));
      setPassword('');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="login">
      <form className="tarjeta tarjeta-cuerpo espaciado" onSubmit={enviar} noValidate>
        <div>
          <img className="login-logo" src="/logo.png" alt="" />
          <h1>GymHub CRM</h1>
          <p className="muted">Inicia sesión con tu cuenta del personal.</p>
        </div>
        {avisoCierre && <Alerta tipo="aviso">{avisoCierre}</Alerta>}
        <Alerta mensajes={errores} />
        <Campo etiqueta="Correo">
          {(p) => (
            <input
              {...p}
              type="email"
              autoComplete="username"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              required
            />
          )}
        </Campo>
        <Campo etiqueta="Contraseña">
          {(p) => (
            <input
              {...p}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          )}
        </Campo>
        <button className="btn btn-primario" type="submit" disabled={enviando || !correo || !password}>
          {enviando ? 'Entrando…' : 'Iniciar sesión'}
        </button>
      </form>
    </div>
  );
}
