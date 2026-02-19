import { RouterProvider } from "react-router";
import { router } from "./routes";
import { AuthProvider } from "./context/AuthContext";
import { PropertiesProvider } from "./context/PropertiesContext";

export default function App() {
  return (
    <AuthProvider>
      <PropertiesProvider>
        <RouterProvider router={router} />
      </PropertiesProvider>
    </AuthProvider>
  );
}
