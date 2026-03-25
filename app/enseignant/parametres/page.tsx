"use client";

import EnseignantLayout from "@/components/EnseignantLayout";
import MatieresView from "@/components/dashboard/MatieresView";

export default function ParametresPage() {
  return (
    <EnseignantLayout>
      <h2 className="ens-page-title">Paramètres</h2>

      <div style={{ marginTop: 24 }}>
        <h3 className="ens-section-title" style={{ marginBottom: 16 }}>
          <span className="ms" style={{ fontSize: 20, verticalAlign: "middle", marginRight: 8 }}>palette</span>
          Matières
        </h3>
        <MatieresView />
      </div>
    </EnseignantLayout>
  );
}
