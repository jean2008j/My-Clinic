import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import Book from './pages/Book';
import Manage from './pages/Manage';
import AdminPage from './pages/admin/AdminPage';
import ProviderPage from './pages/provider/ProviderPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="login" element={<Login />} />

        {/* Batch 4: booking + manage */}
        <Route path="book" element={<Book />} />
        <Route path="manage" element={<Manage />} />
        <Route path="manage/:token" element={<Manage />} />

        {/* Batch 5: admin dashboard */}
        <Route path="admin/*" element={
          <ProtectedRoute roles={['admin']}><AdminPage /></ProtectedRoute>
        } />
        {/* Batch 6: doctor panel */}
        <Route path="provider/*" element={
          <ProtectedRoute roles={['provider']}><ProviderPage /></ProtectedRoute>
        } />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
