import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { COLOR, SectionTitle } from "../components/ui";
import AnweideplanSection from "../components/Anweideplan";
import DienstleisterSection from "../components/Dienstleister";
import HeuSection from "../components/Heu";
import StallumbauSection from "../components/Stallumbau";

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
      <div style={{ marginTop: 8 }}>
        <DienstleisterSection user={user} isAdmin={isAdmin} />
      </div>
      <div style={{ marginTop: 8 }}>
        <StallumbauSection isAdmin={isAdmin} />
      </div>
    </div>
  );
}
