import React from "react";
import { Routes, Route, Navigate, useLocation, Outlet } from "react-router-dom";
import OauthLogin from "./components/Routes/OauthLogin";
import QADashboardPage from "./components/Routes/QADashboardPage";
import FormsCatalog from "./components/Routes/FormsCatalog";
import QAForms from "./components/Routes/QAForms";
import UserManagement from "./components/Routes/UserManagement";
import OtpVerification from "./components/common/OtpVerification";

import UserService from "./service/UserService";

// ✅ Route Guard: Checks if user is authenticated
function RequireAuth() {
  const location = useLocation();

  const authed =
    !!localStorage.getItem("userId") ||
    !!localStorage.getItem("token");

  return authed ? (
    <Outlet />
  ) : (
    <Navigate to="/OauthLogin" replace state={{ from: location }} />
  );
}


// ✅ Route Guard: Prevents access if access level is "User"
function RequireAdminOrHigher() {
  const location = useLocation();
  const accessLevel = localStorage.getItem("user_access_level")  || "User";

  return accessLevel !== "User" ? (
    <Outlet />
  ) : (
    <Navigate to="/Dashboard" replace state={{ from: location }} />
  );
}

// ✅ Routes
export default function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<OauthLogin />} />
      <Route path="/OauthLogin" element={<OauthLogin />} />
      <Route path="/OTP-SECURE" element={<OtpVerification />} />

      {/* Protected Routes */}
      <Route element={<RequireAuth />}>
        {/* Only allow non-"User" roles to access ClientRoster */}
        <Route element={<RequireAdminOrHigher />}>
          <Route path="/FormsCatalog" element={<FormsCatalog />} />
          <Route path="/UserManagement" element={<UserManagement />} />
        </Route>

        {/* Accessible by all authenticated users */}
        <Route path="/Dashboard" element={<QADashboardPage />} />
        <Route path="/QAForms" element={<QAForms />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />

    </Routes>
  );
}
