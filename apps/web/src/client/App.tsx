import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LoginPage } from './pages/Login';
import { SetupPage } from './pages/Setup';
import { AuthProvider, useAuth } from './contexts/AuthContext';

const DesktopWorkspacePage = lazy(() =>
  import('./pages/DesktopWorkspace').then((module) => ({
    default: module.DesktopWorkspacePage,
  })),
);

function LoadingScreen() {
  const { t } = useTranslation();
  return <div className="loading-screen">{t('dashboard.loading')}</div>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, isBootstrapLoading, isInitialized } = useAuth();
  const location = useLocation();

  if (isLoading || isBootstrapLoading) {
    return <LoadingScreen />;
  }

  if (!isInitialized) {
    return <Navigate to="/setup" state={{ from: location }} replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function SetupRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isBootstrapLoading, isInitialized } = useAuth();

  if (isBootstrapLoading) {
    return <LoadingScreen />;
  }

  if (isInitialized) {
    return <Navigate to={isAuthenticated ? '/' : '/login'} replace />;
  }

  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/setup" element={<SetupRoute><SetupPage /></SetupRoute>} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Suspense fallback={<LoadingScreen />}>
                  <DesktopWorkspacePage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="*"
            element={
              <ProtectedRoute>
                <Suspense fallback={<LoadingScreen />}>
                  <DesktopWorkspacePage />
                </Suspense>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
