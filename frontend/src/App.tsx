import { Route, Routes } from 'react-router-dom';
import { AppShell } from './layouts/AppShell';
import OverviewPage from './pages/OverviewPage';
import ClassifyPage from './pages/ClassifyPage';
import BatchPage from './pages/BatchPage';
import ModelsPage from './pages/ModelsPage';
import ExperimentsPage from './pages/ExperimentsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import DatasetPage from './pages/DatasetPage';
import SettingsPage from './pages/SettingsPage';
import DocsPage from './pages/DocsPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OverviewPage />} />
        <Route path="classify" element={<ClassifyPage />} />
        <Route path="batch" element={<BatchPage />} />
        <Route path="models" element={<ModelsPage />} />
        <Route path="experiments" element={<ExperimentsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="dataset" element={<DatasetPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="docs" element={<DocsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
