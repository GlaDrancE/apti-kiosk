import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { StudentDashboard } from './pages/student/StudentDashboard';
import { ExamInstructions } from './pages/student/ExamInstructions';
import { AttemptRunner } from './pages/student/AttemptRunner';
import { AttemptSubmitted } from './pages/student/AttemptSubmitted';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminQuestions } from './pages/admin/AdminQuestions';
import { AdminExams } from './pages/admin/AdminExams';
import { AdminExamDetail } from './pages/admin/AdminExamDetail';
import { AdminExamResults } from './pages/admin/AdminExamResults';
import { AdminHackerRankImport } from './pages/admin/AdminHackerRankImport';
import { AdminStudents } from './pages/admin/AdminStudents';

function Home() {
  const { profile, loading } = useAuth();
  if (loading) return <div className="p-8 text-center text-slate-500">Loading…</div>;
  if (!profile) return <Navigate to="/login" replace />;
  return <Navigate to={profile.role === 'STUDENT' ? '/student/dashboard' : '/admin/dashboard'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />

          {/* The live test runner is deliberately outside Layout: no nav bar,
              no sign-out button, nothing to click away with mid-exam. */}
          <Route
            path="/student/attempts/:attemptId"
            element={
              <ProtectedRoute roles={['STUDENT']}>
                <AttemptRunner />
              </ProtectedRoute>
            }
          />

          <Route element={<ProtectedRoute roles={['STUDENT']}><Layout /></ProtectedRoute>}>
            <Route path="/student/dashboard" element={<StudentDashboard />} />
            <Route path="/student/exams/:examId/instructions" element={<ExamInstructions />} />
            <Route path="/student/attempts/:attemptId/submitted" element={<AttemptSubmitted />} />
          </Route>

          <Route element={<ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}><Layout /></ProtectedRoute>}>
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/questions" element={<AdminQuestions />} />
            <Route path="/admin/exams" element={<AdminExams />} />
            <Route path="/admin/exams/:examId" element={<AdminExamDetail />} />
            <Route path="/admin/exams/:examId/results" element={<AdminExamResults />} />
            <Route path="/admin/students" element={<AdminStudents />} />
            <Route path="/admin/hackerrank-import" element={<AdminHackerRankImport />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
