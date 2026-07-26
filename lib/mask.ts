// Máscaras de digitação configuráveis por campo do formulário. O criador do
// formulário escolhe (Telefone, CNPJ, CPF, CEP) e a página pública formata
// enquanto a pessoa digita.
export type MaskId = "none" | "phone" | "cnpj" | "cpf" | "cep";

export const MASKS: { id: MaskId; label: string }[] = [
  { id: "none", label: "Sem máscara" },
  { id: "phone", label: "Telefone / WhatsApp" },
  { id: "cnpj", label: "CNPJ" },
  { id: "cpf", label: "CPF" },
  { id: "cep", label: "CEP" },
];

export function applyMask(mask: MaskId | undefined, raw: string): string {
  const d = (raw || "").replace(/\D/g, "");
  switch (mask) {
    case "phone": {
      const v = d.slice(0, 11);
      if (v.length > 6) return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
      if (v.length > 2) return `(${v.slice(0, 2)}) ${v.slice(2)}`;
      if (v.length > 0) return `(${v}`;
      return "";
    }
    case "cnpj": {
      const v = d.slice(0, 14);
      if (v.length > 12) return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}`;
      if (v.length > 8) return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8)}`;
      if (v.length > 5) return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5)}`;
      if (v.length > 2) return `${v.slice(0, 2)}.${v.slice(2)}`;
      return v;
    }
    case "cpf": {
      const v = d.slice(0, 11);
      if (v.length > 9) return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}`;
      if (v.length > 6) return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6)}`;
      if (v.length > 3) return `${v.slice(0, 3)}.${v.slice(3)}`;
      return v;
    }
    case "cep": {
      const v = d.slice(0, 8);
      if (v.length > 5) return `${v.slice(0, 5)}-${v.slice(5)}`;
      return v;
    }
    default:
      return raw;
  }
}

// Confete simples e sem dependência externa (comemoração ao enviar).
export function celebrate(color = "#10b981") {
  if (typeof document === "undefined") return;
  const colors = [color, "#ffffff", "#fbbf24", "#6366f1", "#ec4899"];
  const N = 90;
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden";
  document.body.appendChild(root);
  for (let i = 0; i < N; i++) {
    const p = document.createElement("div");
    const size = 6 + Math.random() * 8;
    p.style.cssText = `position:absolute;top:-16px;left:${Math.random() * 100}%;width:${size}px;height:${size * 0.5}px;background:${colors[i % colors.length]};opacity:.95;border-radius:2px;transform:rotate(${Math.random() * 360}deg)`;
    const dur = 1600 + Math.random() * 1400;
    const drift = (Math.random() - 0.5) * 200;
    p.animate(
      [
        { transform: `translate(0,0) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${drift}px, ${window.innerHeight + 40}px) rotate(${540 + Math.random() * 360}deg)`, opacity: 1 },
      ],
      { duration: dur, easing: "cubic-bezier(.2,.6,.4,1)", delay: Math.random() * 250 }
    ).onfinish = () => p.remove();
    root.appendChild(p);
  }
  setTimeout(() => root.remove(), 3400);
}
