"use client";

import { Component, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";

// BARREIRA DE ERRO por app.
//
// Sem isto, um erro dentro de QUALQUER app (na tela ou numa janela) sobe até a
// raiz do React, desmonta tudo e o site "recarrega" — foi o que o dono viu ao
// abrir abas/janelas. Com a barreira, o erro fica contido naquele app: aparece
// um aviso com "tentar de novo" e o resto do Workspace segue de pé.
//
// Precisa ser classe: só componente de classe captura erro de render (não há
// equivalente em hook para getDerivedStateFromError).

type Props = { children: ReactNode; nome?: string };
type State = { erro: Error | null };

export default class AppBoundary extends Component<Props, State> {
  state: State = { erro: null };

  static getDerivedStateFromError(erro: Error): State {
    return { erro };
  }

  componentDidCatch(erro: Error) {
    console.error(`[AppBoundary] ${this.props.nome ?? "app"} falhou:`, erro);
  }

  reset = () => this.setState({ erro: null });

  render() {
    if (this.state.erro) {
      return (
        <div className="h-full grid place-items-center p-6 text-center">
          <div className="max-w-sm">
            <p className="text-sm font-semibold text-gray-200">Este app teve um problema.</p>
            <p className="text-[12px] text-gray-500 mt-1">O resto do Workspace continua funcionando. Você pode tentar abrir de novo.</p>
            <button
              onClick={this.reset}
              className="inline-flex items-center gap-1.5 mt-4 text-xs font-semibold bg-white/10 hover:bg-white/15 px-3 py-2 rounded-lg cursor-pointer"
            >
              <RotateCcw size={13} /> Tentar de novo
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
