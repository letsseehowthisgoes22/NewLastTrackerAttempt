import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '@/components/ui/button';
import { Home, LogOut } from 'lucide-react';

export const Navigation = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <Link to="/" className="flex items-center space-x-2 text-gray-900 hover:text-gray-600">
              <Home className="h-5 w-5" />
              <span className="font-semibold">IYT Transport</span>
            </Link>
            <Link to="/trips" className="text-gray-600 hover:text-gray-900">
              Trips
            </Link>
            {user.role === 'admin' && (
              <Link to="/trips/create" className="text-gray-600 hover:text-gray-900">
                Create Trip
              </Link>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">
              {user.first_name} {user.last_name} ({user.role})
            </span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
};
