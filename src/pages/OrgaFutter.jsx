import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { COLOR } from "../components/ui";
import FutterSection from "../components/Futter";

export default function OrgaFutter({ user, isAdmin }) {
  const navigate = useNavigate();
  return (
    <div>
      <button onClick={() => navigate("/orga")} style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.inkSoft, display: "flex", alignItems: "center", gap: 4, padding: "8px 0", fontSize: 13 }}>
        <ChevronLeft size={15} /> Orga
      </button>
      <FutterSection user={user} isAdmin={isAdmin} />
    </div>
  );
}
