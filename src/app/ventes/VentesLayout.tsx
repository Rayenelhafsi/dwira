import { Outlet } from 'react-router';

export function VentesLayout() {
  return (
    <div className="min-h-screen bg-[#f4f8f5]">
      <Outlet />
    </div>
  );
}
