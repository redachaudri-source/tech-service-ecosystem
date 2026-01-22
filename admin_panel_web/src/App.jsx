import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import DashboardHome from './pages/DashboardHome';
import ServiceMonitor from './pages/ServiceMonitor';
import InventoryManager from './pages/InventoryManager';
import ApplianceTypes from './pages/ApplianceTypes';
import ClientManager from './pages/ClientManager';
import TeamManager from './pages/TeamManager';
import IncomingRequests from './pages/IncomingRequests';
import GlobalAgenda from './pages/GlobalAgenda';
// NEUTRALIZED: Google Maps dependency - migrate to Mapbox if needed
// import FleetMap from './components/FleetMap';
import FleetMapbox from './components/FleetMapbox'; // Mapbox replacement for FleetMap
import Login from './pages/Login';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/ToastProvider';
import AuthGuard from './components/AuthGuard';
import Settings from './pages/Settings';
import BudgetRegistry from './pages/financial/BudgetRegistry'; // New
import MaterialManager from './pages/MaterialManager'; // New Material Workflow
import BusinessSettings from './pages/BusinessSettings'; // New God Mode Settings
import Analytics from './pages/Analytics'; // Level God Analytics
import MortifyDashboard from './pages/MortifyDashboard'; // Phase 3.1.4

// Tech Imports
import TechLayout from './components/TechLayout';
import TechGuard from './components/TechGuard';
import TechLogin from './pages/tech/TechLogin';
import TechDashboard from './pages/tech/TechDashboard';
import TechTicketDetail from './pages/tech/TechTicketDetail';
import TechServiceList from './pages/tech/TechServiceList';
import TechAgenda from './pages/tech/TechAgenda';
import TechSettings from './pages/tech/TechSettings';
import TechMaterialList from './pages/tech/TechMaterialList';

import ErrorBoundary from './components/ErrorBoundary';

function App() {
    return (
        <ErrorBoundary>
            <AuthProvider>
                <ToastProvider>
                    <BrowserRouter>
                        <Routes>
                            {/* Admin Routes */}
                            <Route path="/login" element={<Login />} />
                            <Route path="/" element={
                                <AuthGuard>
                                    <Layout />
                                </AuthGuard>
                            }>
                                <Route index element={<DashboardHome />} />
                                <Route path="requests" element={<IncomingRequests />} />
                                <Route path="mortify" element={<MortifyDashboard />} />
                                <Route path="services" element={<ServiceMonitor />} />
                                <Route path="agenda" element={<GlobalAgenda />} />
                                <Route path="clients" element={<ClientManager />} />
                                <Route path="team" element={<TeamManager />} />
                                <Route path="tracking" element={<div className="h-full"><FleetMapbox /></div>} />
                                {/* <Route path="inventory" element={<InventoryManager />} /> Replaced by Analytics */}
                                <Route path="analytics" element={<Analytics />} />
                                <Route path="appliance-types" element={<ApplianceTypes />} />
                                <Route path="materials" element={<MaterialManager />} />
                                <Route path="budgets" element={<BudgetRegistry />} />
                                <Route path="business-settings" element={<BusinessSettings />} />
                                <Route path="settings" element={<Settings />} />
                            </Route>

                            {/* Tech App Routes (Mobile Optimized) */}
                            <Route path="/tech/login" element={<TechLogin />} />
                            <Route path="/tech" element={
                                <TechGuard>
                                    <TechLayout />
                                </TechGuard>
                            }>
                                <Route index element={<Navigate to="dashboard" replace />} />
                                <Route path="dashboard" element={<TechDashboard />} />
                                <Route path="ticket/:id" element={<TechTicketDetail />} />

                                {/* New Tech Routes */}
                                <Route path="all-services" element={<TechServiceList filterType="all" />} />
                                <Route path="new-services" element={<TechServiceList filterType="new" />} />
                                <Route path="pending-material" element={<TechServiceList filterType="pending_material" />} />
                                <Route path="materials" element={<TechMaterialList />} />
                                <Route path="agenda" element={<TechAgenda />} />
                                <Route path="history" element={<TechServiceList filterType="history" />} />
                                <Route path="warranties" element={<TechServiceList filterType="warranty" />} />
                                <Route path="settings" element={<TechSettings />} />
                            </Route>
                        </Routes>
                    </BrowserRouter>
                </ToastProvider>
            </AuthProvider>
        </ErrorBoundary>
    );
}

export default App
