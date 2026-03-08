import React from "react";

const DEFAULT_DATA = {
  contractTitle: "Contrat de location saisonnière",
  contractSubtitle: "Modèle agence immobilière - version prête à remplir par code",
  contractNumber: "",
  owner: {
    name: "",
    idNumber: "",
    address: "",
    phone: "",
  },
  agency: {
    name: "",
    registration: "",
    address: "",
    phone: "",
    email: "",
  },
  tenant: {
    name: "",
    idNumber: "",
    address: "",
    phone: "",
    email: "",
  },
  property: {
    type: "",
    reference: "",
    address: "",
    city: "",
    description: "",
    capacity: "",
    bedrooms: "",
    amenities: "",
  },
  stay: {
    arrivalDate: "",
    departureDate: "",
    checkInTime: "",
    checkOutTime: "",
    duration: "",
  },
  pricing: {
    totalRent: "",
    bookingAdvance: "",
    bookingAdvanceDate: "",
    balanceDue: "",
    securityDeposit: "",
    paymentMethod: "",
  },
  clauses: {
    keyHandover: "",
    depositReturnDelay: "",
    cancellationTerms: "",
    specialConditions: "",
    governingLaw: "Tunisie",
  },
  obligations: {
    owner: [
      "Remettre le bien en bon état, propre et conforme aux normes de sécurité.",
      "Fournir les informations utiles sur les équipements et règles de la résidence.",
      "Signaler tout élément important susceptible d'affecter le séjour.",
    ],
    agency: [
      "Assurer la coordination entre le propriétaire et le locataire.",
      "Communiquer les informations pratiques avant l'arrivée.",
      "Assister le locataire pendant la période de location selon les modalités convenues.",
    ],
    tenant: [
      "Payer le loyer, l'acompte et la caution selon les conditions prévues.",
      "Utiliser le bien paisiblement et respecter les règles de la résidence.",
      "Informer immédiatement l'agence ou le propriétaire de tout dommage ou incident.",
    ],
  },
  signing: {
    city: "",
    date: "",
  },
  signatures: {
    ownerLabel: "Le propriétaire",
    agencyLabel: "L'agence",
    tenantLabel: "Le locataire",
  },
};

const css = `
  .contract-root {
    --brand: #166f55;
    --brand-soft: #eef7f3;
    --ink: #1f2937;
    --muted: #6b7280;
    --line: #dde5ea;
    --surface: #ffffff;
    --surface-soft: #f7f9fb;
    width: 210mm;
    min-height: 297mm;
    margin: 24px auto;
    padding: 14mm 14mm 12mm;
    background: var(--surface);
    color: var(--ink);
    box-sizing: border-box;
    box-shadow: 0 14px 35px rgba(15, 23, 42, 0.08);
    border: 1px solid #e8edf1;
    font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .contract-top-bar {
    height: 5px;
    width: 100%;
    background: linear-gradient(90deg, var(--brand), #2f8f72);
    border-radius: 999px;
    margin-bottom: 14px;
  }

  .contract-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
    margin-bottom: 12px;
  }

  .contract-title-wrap h1 {
    margin: 0;
    font-size: 24px;
    line-height: 1.15;
    letter-spacing: -0.02em;
    font-weight: 700;
  }

  .contract-title-wrap p {
    margin: 6px 0 0;
    font-size: 11px;
    color: var(--muted);
  }

  .contract-chip {
    min-width: 125px;
    border: 1px solid var(--line);
    background: var(--surface-soft);
    border-radius: 14px;
    padding: 10px 12px;
  }

  .contract-chip-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    margin-bottom: 4px;
  }

  .contract-chip-value {
    font-size: 13px;
    font-weight: 600;
  }

  .contract-section {
    margin-top: 12px;
    border: 1px solid var(--line);
    border-radius: 16px;
    overflow: hidden;
    break-inside: avoid;
  }

  .contract-section-header {
    background: var(--brand-soft);
    border-bottom: 1px solid var(--line);
    padding: 8px 12px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--brand);
  }

  .contract-section-body {
    padding: 12px;
  }

  .grid-2, .grid-3 {
    display: grid;
    gap: 10px;
  }

  .grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }

  .info-card {
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 10px 11px;
    background: var(--surface);
  }

  .info-card-title {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 700;
  }

  .field {
    display: grid;
    grid-template-columns: 110px 1fr;
    gap: 8px;
    align-items: start;
    padding: 4px 0;
    border-bottom: 1px dashed #ebf0f3;
  }

  .field:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .field-label {
    font-size: 10.5px;
    color: var(--muted);
  }

  .field-value {
    font-size: 11px;
    line-height: 1.45;
    font-weight: 500;
    min-height: 16px;
  }

  .placeholder {
    color: #94a3b8;
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  .pricing-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .price-box {
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--surface-soft);
    padding: 10px 11px;
  }

  .price-label {
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 6px;
  }

  .price-value {
    font-size: 14px;
    font-weight: 700;
    min-height: 18px;
  }

  .muted-note {
    margin-top: 10px;
    font-size: 10.5px;
    line-height: 1.5;
    color: var(--muted);
  }

  .clause-block {
    padding: 8px 0;
    border-bottom: 1px dashed #ebf0f3;
  }

  .clause-block:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .clause-title {
    font-size: 11px;
    font-weight: 700;
    margin-bottom: 3px;
  }

  .clause-text {
    font-size: 10.9px;
    line-height: 1.55;
    color: var(--ink);
    white-space: pre-wrap;
  }

  .obligation-list {
    margin: 0;
    padding-left: 16px;
  }

  .obligation-list li {
    font-size: 10.6px;
    line-height: 1.48;
    margin-bottom: 6px;
  }

  .signature-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-top: 12px;
  }

  .signature-box {
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 10px;
    min-height: 120px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    background: linear-gradient(180deg, #ffffff 0%, #fafcfd 100%);
  }

  .signature-title {
    font-size: 11px;
    font-weight: 700;
  }

  .signature-line {
    border-top: 1px dashed #94a3b8;
    padding-top: 8px;
    font-size: 10px;
    color: var(--muted);
  }

  .footer-line {
    margin-top: 12px;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 10.5px;
    color: var(--muted);
  }

  @media print {
    @page {
      size: A4;
      margin: 0;
    }

    html, body {
      background: #ffffff;
      margin: 0;
      padding: 0;
    }

    .contract-root {
      margin: 0;
      box-shadow: none;
      border: none;
      width: 210mm;
      min-height: 297mm;
    }
  }

  @media (max-width: 1024px) {
    .contract-root {
      width: 100%;
      min-height: auto;
      padding: 20px;
    }

    .grid-2, .grid-3, .pricing-grid, .signature-row {
      grid-template-columns: 1fr;
    }

    .contract-header {
      flex-direction: column;
    }

    .field {
      grid-template-columns: 1fr;
      gap: 3px;
    }
  }
`;

const mergeDeep = (target, source) => {
  const output = { ...target };
  Object.keys(source || {}).forEach((key) => {
    const sourceValue = source[key];
    const targetValue = target?.[key];
    if (
      sourceValue &&
      typeof sourceValue === "object" &&
      !Array.isArray(sourceValue) &&
      targetValue &&
      typeof targetValue === "object" &&
      !Array.isArray(targetValue)
    ) {
      output[key] = mergeDeep(targetValue, sourceValue);
    } else {
      output[key] = sourceValue;
    }
  });
  return output;
};

const textOrPlaceholder = (value, placeholder = "................................") => {
  if (value === 0) return "0";
  if (value === null || value === undefined) return <span className="placeholder">{placeholder}</span>;
  if (typeof value === "string" && value.trim() === "") return <span className="placeholder">{placeholder}</span>;
  return value;
};

function Field({ label, value, placeholder }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <div className="field-value">{textOrPlaceholder(value, placeholder)}</div>
    </div>
  );
}

function InfoCard({ title, children }) {
  return (
    <div className="info-card">
      <h3 className="info-card-title">{title}</h3>
      {children}
    </div>
  );
}

function PriceBox({ label, value, placeholder }) {
  return (
    <div className="price-box">
      <div className="price-label">{label}</div>
      <div className="price-value">{textOrPlaceholder(value, placeholder)}</div>
    </div>
  );
}

export default function AgencySeasonalContractTemplate({ data = {} }) {
  const contract = mergeDeep(DEFAULT_DATA, data);

  return (
    <div className="contract-root">
      <style>{css}</style>

      <div className="contract-top-bar" />

      <div className="contract-header">
        <div className="contract-title-wrap">
          <h1>{contract.contractTitle}</h1>
          <p>{contract.contractSubtitle}</p>
        </div>

        <div className="contract-chip">
          <div className="contract-chip-label">N° de contrat</div>
          <div className="contract-chip-value">
            {textOrPlaceholder(contract.contractNumber, "À générer")}
          </div>
        </div>
      </div>

      <section className="contract-section">
        <div className="contract-section-header">1. Parties au contrat</div>
        <div className="contract-section-body grid-3">
          <InfoCard title="Propriétaire">
            <Field label="Nom" value={contract.owner.name} />
            <Field label="CIN / ID" value={contract.owner.idNumber} />
            <Field label="Adresse" value={contract.owner.address} placeholder="Adresse complète" />
            <Field label="Téléphone" value={contract.owner.phone} />
          </InfoCard>

          <InfoCard title="Agence immobilière">
            <Field label="Nom" value={contract.agency.name} />
            <Field label="RC / MF" value={contract.agency.registration} />
            <Field label="Adresse" value={contract.agency.address} placeholder="Adresse de l'agence" />
            <Field label="Téléphone" value={contract.agency.phone} />
            <Field label="Email" value={contract.agency.email} />
          </InfoCard>

          <InfoCard title="Locataire">
            <Field label="Nom" value={contract.tenant.name} />
            <Field label="CIN / ID" value={contract.tenant.idNumber} />
            <Field label="Adresse" value={contract.tenant.address} placeholder="Adresse complète" />
            <Field label="Téléphone" value={contract.tenant.phone} />
            <Field label="Email" value={contract.tenant.email} />
          </InfoCard>
        </div>
      </section>

      <section className="contract-section">
        <div className="contract-section-header">2. Bien immobilier concerné</div>
        <div className="contract-section-body grid-2">
          <InfoCard title="Identification du bien">
            <Field label="Type" value={contract.property.type} />
            <Field label="Référence" value={contract.property.reference} />
            <Field label="Ville" value={contract.property.city} />
            <Field label="Adresse" value={contract.property.address} placeholder="Adresse du bien" />
          </InfoCard>

          <InfoCard title="Description utile">
            <Field label="Capacité" value={contract.property.capacity} />
            <Field label="Chambres" value={contract.property.bedrooms} />
            <Field label="Équipements" value={contract.property.amenities} placeholder="Piscine, Wi-Fi, climatisation..." />
            <Field label="Description" value={contract.property.description} placeholder="Résumé du bien / étage / vue / résidence" />
          </InfoCard>
        </div>
      </section>

      <section className="contract-section">
        <div className="contract-section-header">3. Séjour et règlement financier</div>
        <div className="contract-section-body">
          <div className="grid-2" style={{ marginBottom: 10 }}>
            <InfoCard title="Période de location">
              <Field label="Arrivée" value={contract.stay.arrivalDate} />
              <Field label="Départ" value={contract.stay.departureDate} />
              <Field label="Check-in" value={contract.stay.checkInTime} />
              <Field label="Check-out" value={contract.stay.checkOutTime} />
              <Field label="Durée" value={contract.stay.duration} placeholder="Nombre de nuits / jours" />
            </InfoCard>

            <InfoCard title="Règlement">
              <Field label="Mode" value={contract.pricing.paymentMethod} placeholder="Espèces, virement, TPE..." />
              <Field label="Acompte le" value={contract.pricing.bookingAdvanceDate} />
              <Field label="Solde" value={contract.pricing.balanceDue} placeholder="Montant ou modalité" />
              <Field label="Caution" value={contract.pricing.securityDeposit} />
            </InfoCard>
          </div>

          <div className="pricing-grid">
            <PriceBox label="Loyer total" value={contract.pricing.totalRent} />
            <PriceBox label="Acompte à la réservation" value={contract.pricing.bookingAdvance} />
            <PriceBox label="Solde à l'arrivée" value={contract.pricing.balanceDue} />
          </div>

          <div className="muted-note">
            L'acompte est versé lors de la réservation. Le solde et la caution sont exigibles selon les conditions prévues ci-dessus.
          </div>
        </div>
      </section>

      <section className="contract-section">
        <div className="contract-section-header">4. Clauses essentielles</div>
        <div className="contract-section-body grid-2">
          <div>
            <div className="clause-block">
              <div className="clause-title">Objet du contrat</div>
              <div className="clause-text">
                Le présent contrat a pour objet la location saisonnière du bien décrit ci-dessus pour la période convenue entre les parties.
              </div>
            </div>
            <div className="clause-block">
              <div className="clause-title">Remise des clés et état des lieux</div>
              <div className="clause-text">
                {textOrPlaceholder(
                  contract.clauses.keyHandover,
                  "Préciser la remise des clés, l'état des lieux d'entrée/sortie et les personnes de contact."
                )}
              </div>
            </div>
            <div className="clause-block">
              <div className="clause-title">Restitution de la caution</div>
              <div className="clause-text">
                {textOrPlaceholder(
                  contract.clauses.depositReturnDelay,
                  "Indiquer le délai et les conditions de restitution après vérification du bien."
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="clause-block">
              <div className="clause-title">Annulation</div>
              <div className="clause-text">
                {textOrPlaceholder(
                  contract.clauses.cancellationTerms,
                  "Préciser les conditions de remboursement ou de non-remboursement selon la date d'annulation."
                )}
              </div>
            </div>
            <div className="clause-block">
              <div className="clause-title">Conditions particulières</div>
              <div className="clause-text">
                {textOrPlaceholder(
                  contract.clauses.specialConditions,
                  "Ajouter ici toute condition spéciale : animaux, nombre d'occupants, interdictions, frais supplémentaires, etc."
                )}
              </div>
            </div>
            <div className="clause-block">
              <div className="clause-title">Loi applicable</div>
              <div className="clause-text">Le contrat est soumis à la réglementation applicable en {textOrPlaceholder(contract.clauses.governingLaw, "Tunisie")}.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="contract-section">
        <div className="contract-section-header">5. Obligations des parties</div>
        <div className="contract-section-body grid-3">
          <InfoCard title="Propriétaire">
            <ul className="obligation-list">
              {contract.obligations.owner.map((item, index) => (
                <li key={`owner-${index}`}>{item}</li>
              ))}
            </ul>
          </InfoCard>

          <InfoCard title="Agence immobilière">
            <ul className="obligation-list">
              {contract.obligations.agency.map((item, index) => (
                <li key={`agency-${index}`}>{item}</li>
              ))}
            </ul>
          </InfoCard>

          <InfoCard title="Locataire">
            <ul className="obligation-list">
              {contract.obligations.tenant.map((item, index) => (
                <li key={`tenant-${index}`}>{item}</li>
              ))}
            </ul>
          </InfoCard>
        </div>
      </section>

      <section className="contract-section">
        <div className="contract-section-header">6. Signature des parties</div>
        <div className="contract-section-body">
          <div className="footer-line">
            <div>
              Fait à {textOrPlaceholder(contract.signing.city, "........................")}, le {textOrPlaceholder(contract.signing.date, "........................")}
            </div>
            <div>Document généré pour impression / export PDF</div>
          </div>

          <div className="signature-row">
            <div className="signature-box">
              <div className="signature-title">{contract.signatures.ownerLabel}</div>
              <div className="signature-line">Nom, signature et mention “Lu et approuvé”</div>
            </div>

            <div className="signature-box">
              <div className="signature-title">{contract.signatures.agencyLabel}</div>
              <div className="signature-line">Cachet / signature de l'agence</div>
            </div>

            <div className="signature-box">
              <div className="signature-title">{contract.signatures.tenantLabel}</div>
              <div className="signature-line">Nom, signature et mention “Lu et approuvé”</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export { DEFAULT_DATA };
