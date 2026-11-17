import {
    BrowserRouter,
    Navigate,
    Route,
    Routes
} from 'react-router-dom';

import { ProtectedRoute } from './components/ProtectedRoute';
import { AppConfigProvider } from './contexts/AppConfigContext';
import { AuthProvider } from './contexts/AuthContext';
import { ActiveNet } from './pages/ActiveNet';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { Dashboard } from './pages/Dashboard';
import { LoginPage } from './pages/LoginPage';
import { NetMapPage } from './pages/NetMapPage';
import { SettingsPage } from './pages/SettingsPage';
import { SetupPage } from './pages/SetupPage';
import { StationsPage } from './pages/StationsPage';
import { UsersPage } from './pages/UsersPage';

function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <AppConfigProvider>
                    <Routes>
                        {/* Public routes */}
                        <Route path='/login' element={<LoginPage />} />
                        <Route
                            path='/change-password'
                            element={(
                                <ProtectedRoute allowPasswordChange>
                                    <ChangePasswordPage />
                                </ProtectedRoute>
                            )}
                        />
                        <Route path='/setup' element={<SetupPage />} />

                        {/* Protected routes */}
                        <Route
                            path='/'
                            element={(
                                <ProtectedRoute>
                                    <Dashboard />
                                </ProtectedRoute>
                            )}
                        />
                        <Route
                            path='/nets/:id'
                            element={(
                                <ProtectedRoute>
                                    <ActiveNet />
                                </ProtectedRoute>
                            )}
                        />
                        <Route
                            path='/nets/:id/map'
                            element={(
                                <ProtectedRoute>
                                    <NetMapPage />
                                </ProtectedRoute>
                            )}
                        />
                        <Route
                            path='/stations'
                            element={(
                                <ProtectedRoute>
                                    <StationsPage />
                                </ProtectedRoute>
                            )}
                        />

                        <Route
                            path='/settings'
                            element={(
                                <ProtectedRoute>
                                    <SettingsPage />
                                </ProtectedRoute>
                            )}
                        />

                        {/* Admin-only routes */}
                        <Route
                            path='/users'
                            element={(
                                <ProtectedRoute requireAdmin>
                                    <UsersPage />
                                </ProtectedRoute>
                            )}
                        />

                        {/* Catch-all redirect */}
                        <Route path='*' element={<Navigate to='/' replace />} />
                    </Routes>
                </AppConfigProvider>
            </AuthProvider>
        </BrowserRouter>
    );
}

export default App;