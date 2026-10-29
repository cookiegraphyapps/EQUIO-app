import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { COLOR } from "../components/ui";
import StallumbauSection from "../components/Stallumbau";

export default function OrgaStallumbau({ isAdmin }) {
  const navigate = useNavigate();
  return (
    <div>
      <button onClick={() => navigate("/orga")} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft, display: "flex", alignItems: "center", gap: 4, padding: "8px 0", fontSize: 13 }}>
        <ChevronLeft size={15} /> Orga
      </button>
      <StallumbauSection isAdmin={isAdmin} />
    </div>
  );
}
