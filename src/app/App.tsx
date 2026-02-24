import { RouterProvider } from "react-router";
import { router } from "./routes";
import { AuthProvider } from "./context/AuthContext";
import { PropertiesProvider } from "./context/PropertiesContext";
import { Toaster } from "sonner";

export default function App() {
  return (
    <AuthProvider>
      <PropertiesProvider>
        <RouterProvider router={router} />
        <Toaster position="top-right" richColors closeButton />
      </PropertiesProvider>
    </AuthProvider>
  );
}
