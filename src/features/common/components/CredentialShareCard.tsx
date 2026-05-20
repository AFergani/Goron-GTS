import { useState } from "react";

type CredentialShareCardProps = {
  username: string;
  temporaryPassword: string;
};

export function CredentialShareCard({ username, temporaryPassword }: CredentialShareCardProps) {
  const [copiedKey, setCopiedKey] = useState<"" | "username" | "password" | "all">("");

  const copyText = async (value: string, key: "username" | "password" | "all") => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(""), 1400);
  };

  const allText = `Nom affiché : ${username}\nMot de passe temporaire : ${temporaryPassword}`;

  return (
    <section className="credential-card">
      <p className="credential-card-title">Identifiants à transmettre</p>
      <div className="credential-row">
        <span className="credential-label">Nom affiché :</span>
        <code>{username}</code>
        <button className="btn-light" type="button" onClick={() => void copyText(username, "username")}>
          {copiedKey === "username" ? "Copié" : "Copier"}
        </button>
      </div>
      <div className="credential-row">
        <span className="credential-label">Mot de passe temporaire :</span>
        <code>{temporaryPassword}</code>
        <button className="btn-light" type="button" onClick={() => void copyText(temporaryPassword, "password")}>
          {copiedKey === "password" ? "Copié" : "Copier"}
        </button>
      </div>
      <div className="credential-actions">
        <button className="btn-light" type="button" onClick={() => void copyText(allText, "all")}>
          {copiedKey === "all" ? "Copié" : "Copier les deux"}
        </button>
      </div>
    </section>
  );
}
