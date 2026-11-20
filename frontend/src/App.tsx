import { Route, Routes } from "react-router-dom";

import About from "./pages/About";
import AppLayout from "./layouts/AppLayout";
import CopyrightInfo from "./pages/CopyrightInfo";
import DataManagement from "./pages/DataManagement";
import DeviceDetail from "./pages/DeviceDetail";
import Devices from "./pages/Devices";
import Diagnose from "./pages/Diagnose";
import DynamicInterview from "./pages/DynamicInterview";
import DiagnosisReport from "./pages/DiagnosisReport";
import DiagnosisResult from "./pages/DiagnosisResult";
import Home from "./pages/Home";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Records from "./pages/Records";
import RepairAssistant from "./pages/RepairAssistant";
import RepairHistory from "./pages/RepairHistory";
import Settings from "./pages/Settings";
import TermsOfService from "./pages/TermsOfService";
import TicketDetail from "./pages/TicketDetail";
import UiKit from "./pages/UiKit";

export default function App() {
  return (
    <Routes>
      {/* 登录门户：独立整页（参考微信网页版），不套用应用外壳 */}
      <Route path="login" element={<Login />} />

      <Route element={<AppLayout />}>
        {/* 首页 */}
        <Route index element={<Home />} />
        {/* P1 AI 诊断（?deviceId= / ?category= 预选） */}
        <Route path="diagnose" element={<Diagnose />} />
        <Route path="interview/ac" element={<DynamicInterview />} />
        {/* P2 诊断结果 / P3 诊断报告 */}
        <Route path="diagnosis/:id/result" element={<DiagnosisResult />} />
        <Route path="diagnosis/:id/report" element={<DiagnosisReport />} />
        {/* P6 设备列表 / P7 设备详情 / P8 维修历史 */}
        <Route path="devices" element={<Devices />} />
        <Route path="devices/:id" element={<DeviceDetail />} />
        <Route path="devices/:id/history" element={<RepairHistory />} />
        {/* P5 智能报修（?diagnosisId= 带入） / P4 维修档案 */}
        <Route path="repair" element={<RepairAssistant />} />
        <Route path="records" element={<Records />} />
        <Route path="tickets/:id" element={<TicketDetail />} />
        {/* 个人数据管理 */}
        <Route path="data" element={<DataManagement />} />
        {/* P9 个人设置 / 个人中心 */}
        <Route path="settings" element={<Settings />} />
        {/* 法律文档：关于我们 / 隐私政策 / 用户协议 / 版权说明 */}
        <Route path="about" element={<About />} />
        <Route path="privacy" element={<PrivacyPolicy />} />
        <Route path="terms" element={<TermsOfService />} />
        <Route path="copyright" element={<CopyrightInfo />} />
        <Route path="ui-kit" element={<UiKit />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
