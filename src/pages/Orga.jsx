import { useNavigate } from "react-router-dom";
import { ChevronLeft, Hammer, ChevronRight, Wheat } from "lucide-react";
import { Card, COLOR, SectionTitle } from "../components/ui";
import AnweideplanSection from "../components/Anweideplan";
import DienstleisterSection from "../components/Dienstleister";
import HeuSection from "../components/Heu";

export default function Orga({ user, isAdmin }) {
  const navigate = useNavigate();
  return (
    <div>
      <button onClick={() => navigate("/")} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft, display: "flex", alignItems: "center", gap: 4, padding: "8px 0", fontSize: 13 }}>
        <ChevronLeft size={15} /> Start
      </button>
      <SectionTitle>Orga</SectionTitle>

      <div style={{ marginBottom: 8 }}>
        <AnweideplanSection isAdmin={isAdmin} />
      </div>
      <div style={{ marginTop: 8 }}>
        <HeuSection isAdmin={isAdmin} />
      </div>

      <Card onClick={() => navigate("/orga/futter")} style={{ marginTop: 8, marginBottom: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Wheat size={16} color={COLOR.accent} />
          <span style={{ fontSize: 14, fontWeight: 700, color: COLOR.ink }}>Geteiltes Futter</span>
        </div>
        <ChevronRight size={16} color={COLOR.inkSoft} />
      </Card>

      <Card onClick={() => navigate("/orga/stallumbau")} style={{ marginTop: 8, marginBottom: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Hammer size={16} color={COLOR.accent} />
          <span style={{ fontSize: 14, fontWeight: 700, color: COLOR.ink }}>Stallprojekte</span>
        </div>
        <ChevronRight size={16} color={COLOR.inkSoft} />
      </Card>

      <div style={{ marginTop: 8 }}>
        <DienstleisterSection user={user} isAdmin={isAdmin} />
      </div>
    </div>
  );
}
