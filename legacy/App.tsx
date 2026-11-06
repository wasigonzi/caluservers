"use client";
import { useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { CatalogProvider } from "./lib/useCatalog";
import { Layout } from "./components/Layout";
import Home from "./pages/Home";
import WebHosting from "./pages/WebHosting";
import Vps from "./pages/Vps";
import Dedicated from "./pages/Dedicated";
import Domains from "./pages/Domains";
import About from "./pages/About";
import Contact from "./pages/Contact";
import { Aup, Privacy, Terms } from "./pages/Legal";
import Abuse from "./pages/Abuse";
import Client from "./pages/Client";


function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <CatalogProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/web-hosting" element={<WebHosting />} />
            <Route path="/vps" element={<Vps />} />
            <Route path="/dedicated" element={<Dedicated />} />
            <Route path="/domains" element={<Domains />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/aup" element={<Aup />} />
            <Route path="/abuse" element={<Abuse />} />
            <Route path="/client" element={<Client />} />
            
            <Route path="*" element={<Home />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </CatalogProvider>
  );
}
