import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FileText } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await axios.post('http://localhost:3000/api/auth/login', {
        email,
        password
      });

      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login fehlgeschlagen');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center">
      <div className="mb-8 flex flex-col items-center">
        <div className="bg-blue-600 p-4 rounded-xl shadow-lg mb-4">
          <FileText size={48} className="text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-800">PlanSync</h1>
        <p className="text-slate-500">Pendenzen & Planverwaltung</p>
      </div>

      <div className="w-full max-w-md bg-white rounded-xl shadow-xl p-8 border border-slate-100">
        <h2 className="text-2xl font-bold mb-6 text-center text-slate-800">Anmelden</h2>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-md mb-4 text-sm font-medium border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">E-Mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="E-Mail Adresse"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Passwort</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Passwort"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 text-white font-semibold py-2 rounded-md hover:bg-blue-700 transition-colors shadow-sm"
          >
            Einloggen
          </button>
        </form>

        <div className="mt-6 text-center">
           <p className="text-sm text-slate-500">
             (Für die Entwicklung: Es gibt einen `register` Endpunkt via API)
           </p>
        </div>
      </div>
    </div>
  );
}
