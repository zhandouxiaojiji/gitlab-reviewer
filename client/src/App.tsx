import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import ProjectSettings from './components/ProjectSettings';
import FeishuSettings from './components/FeishuSettings';
import ScheduleSettings from './components/ScheduleSettings';
import ProjectDetail from './components/ProjectDetail';
import CodeReview from './components/CodeReview';
import ProtectedRoute from './components/ProtectedRoute';
import './App.css';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <div className="App">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/code-review" 
            element={
              <ProtectedRoute>
                <CodeReview />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/project" 
            element={
              <ProtectedRoute>
                <ProjectDetail />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/settings" 
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/settings/projects" 
            element={
              <ProtectedRoute>
                <ProjectSettings />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/settings/feishu" 
            element={
              <ProtectedRoute>
                <FeishuSettings />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/settings/schedule" 
            element={
              <ProtectedRoute>
                <ScheduleSettings />
              </ProtectedRoute>
            } 
          />
        </Routes>
      </div>
    </AuthProvider>
  );
};

export default App; 