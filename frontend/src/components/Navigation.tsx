import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

export const Navigation = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <nav className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-50 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-24">
          <div className="flex items-center space-x-8">
            <Link to="/" className="flex items-center group">
              <img
                src="/logo-horizontal2.png"
                alt="IYT Compass"
                className="h-48 w-auto brightness-0 invert group-hover:opacity-80 transition-opacity"
              />
            </Link>
            <Link to="/trips" className="text-slate-200 hover:text-white transition-colors font-medium">
              Trips
            </Link>
            {user.role === 'admin' && (
              <Link to="/trips/create" className="text-slate-200 hover:text-white transition-colors font-medium">
                Create Trip
              </Link>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-slate-300">
              {user.first_name} {user.last_name} <span className="text-slate-400">({user.role})</span>
            </span>
            <Button variant="secondary" size="sm" onClick={handleLogout} className="bg-white text-slate-900 hover:bg-slate-200">
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
};