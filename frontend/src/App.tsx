import { Route, Routes } from "react-router-dom";

import AppLayout from "./layouts/AppLayout";
import Devices from "./pages/Devices";
import Diagnose from "./pages/Diagnose";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import Records from "./pages/Records";
import Settings from "./pages/Settings";
import UiKit from "./pages/UiKit";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Home />} />
        <Route path="diagnose" element={<Diagnose />} />
        <Route path="devices" element={<Devices />} />
        <Route path="records" element={<Records />} />
        <Route path="settings" element={<Settings />} />
        <Route path="ui-kit" element={<UiKit />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
