import { Outlet } from 'react-router';

export function VentesLayout() {
  return (
    <div className="min-h-screen pt-24 bg-gradient-to-br from-emerald-50 via-white to-amber-50">
      <Outlet />
    </div>
  );
}
