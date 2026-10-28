import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FileText, ListTodo, LogOut } from 'lucide-react';

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <header className="bg-white border-b shadow-sm sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
        <div className="flex items-center space-x-8">
          <div className="flex items-center space-x-3">
             <div className="bg-blue-600 p-2 rounded-lg">
                <FileText size={24} className="text-white" />
             </div>
             <h1 className="text-xl font-bold text-slate-800">PlanSync</h1>
          </div>

          <nav className="hidden md:flex space-x-4">
            <Link
              to="/dashboard"
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${location.pathname === '/dashboard' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
            >
              Projekte
            </Link>
            <Link
              to="/tasks"
              className={`px-3 py-2 flex items-center space-x-2 rounded-md text-sm font-medium transition-colors ${location.pathname === '/tasks' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
            >
              <ListTodo size={16} />
              <span>Pendenzenliste</span>
            </Link>
          </nav>
        </div>

        <div className="flex items-center space-x-4">
          <span className="text-sm text-slate-600 hidden md:block">Angemeldet als <strong>{user.firstName} {user.lastName}</strong></span>
          <button
            onClick={handleLogout}
            className="text-slate-500 hover:text-red-600 p-2 rounded-full hover:bg-red-50 transition-colors"
            title="Abmelden"
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}
